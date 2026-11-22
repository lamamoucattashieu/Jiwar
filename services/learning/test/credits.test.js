// The credit flow through the HTTP API, with the in-memory stores:
// grade -> verification queue -> ledger -> level -> notifications.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createMemoryCourseRepository } from '../src/courses/courseRepository.memory.js';
import { createMemoryCreditStore } from '../src/credits/creditStore.memory.js';

const TODAY = '2026-11-22';
const course = (over) => ({
  description: '',
  type: 'module',
  passMark: 60,
  published: true,
  instructorId: 'instructor-omar',
  requiredForLevel: null,
  ...over,
});

function setup() {
  const courses = createMemoryCourseRepository([
    course({ title: 'Web basics', credits: 10, requiredForLevel: 1 }), // id 1
    course({ title: 'Big project module', credits: 25 }), // id 2
    course({ title: 'React', credits: 15, requiredForLevel: 2, instructorId: 'instructor-dana' }), // id 3
    course({ title: 'Live class', credits: 0, type: 'live_class' }), // id 4
  ]);
  const store = createMemoryCreditStore();
  const app = createApp(loadConfig({}), {
    log: () => {},
    repos: { courses, credits: store },
    today: () => TODAY,
  });
  const as = (user) => ({
    get: (url) => request(app).get(url).set('X-Demo-User', user),
    post: (url, body) => request(app).post(url).set('X-Demo-User', user).send(body),
    put: (url, body) => request(app).put(url).set('X-Demo-User', user).send(body),
  });
  return { app, store, as };
}

const grade = (as, courseId, grade, by = 'instructor-omar', traineeId = 'trainee-yousef') =>
  as(by).post('/results', { courseId, traineeId, grade });

test('a passing grade waits for an admin; a failing grade does not', async () => {
  const { as } = setup();
  const pass = await grade(as, 1, 75);
  assert.equal(pass.status, 201);
  assert.equal(pass.body.status, 'pending_verification');
  const fail = await grade(as, 2, 40);
  assert.equal(fail.body.status, 'failed');

  const queue = await as('admin-rania').get('/verification-queue');
  assert.deepEqual(
    queue.body.items.map((r) => [r.courseTitle, r.credits]),
    [['Web basics', 10]],
  );
});

test('only the course instructor or an admin can grade, and only trainees get grades', async () => {
  const { as } = setup();
  assert.equal((await grade(as, 3, 80, 'instructor-omar')).status, 403, 'React belongs to Dana');
  assert.equal((await grade(as, 3, 80, 'trainee-mariam')).status, 403);
  assert.equal((await grade(as, 99, 80)).status, 404);
  assert.equal((await grade(as, 1, 80, 'instructor-omar', 'company-zaytoun')).status, 400);
  assert.equal((await grade(as, 1, 101)).status, 400);
});

test('a second active result for the same course and trainee is refused', async () => {
  const { as } = setup();
  await grade(as, 1, 70);
  assert.equal((await grade(as, 1, 90)).status, 409);
});

test('verifying adds credits to the ledger and notifies the trainee', async () => {
  const { as } = setup();
  const { body: r } = await grade(as, 1, 75);
  const verified = await as('admin-rania').post(`/results/${r.id}/verify`);
  assert.equal(verified.status, 200);
  assert.equal(verified.body.status, 'verified');

  const progress = await as('trainee-yousef').get('/trainees/trainee-yousef/progress');
  assert.equal(progress.body.credits, 10);
  assert.equal(progress.body.ledger[0].reason, 'Passed Web basics');

  const notes = await as('trainee-yousef').get('/notifications');
  assert.deepEqual(notes.body.items[0].data, { amount: 10, reason: 'Passed Web basics' });
  assert.equal((await as('admin-rania').get('/verification-queue')).body.items.length, 0);
});

test('nobody verifies their own grading, and a result is reviewed only once', async () => {
  const { as } = setup();
  const { body: r } = await grade(as, 1, 75, 'admin-rania');
  assert.equal((await as('admin-rania').post(`/results/${r.id}/verify`)).status, 403);
  assert.equal((await as('instructor-omar').post(`/results/${r.id}/verify`)).status, 403, 'admins only');

  const { body: r2 } = await grade(as, 2, 80);
  assert.equal((await as('admin-rania').post(`/results/${r2.id}/verify`)).status, 200);
  assert.equal((await as('admin-rania').post(`/results/${r2.id}/verify`)).status, 409);
  assert.equal((await as('admin-rania').post('/results/999/verify')).status, 404);
});

test('rejecting needs a reason, adds no credits and tells the trainee why', async () => {
  const { as } = setup();
  const { body: r } = await grade(as, 1, 75);
  assert.equal((await as('admin-rania').post(`/results/${r.id}/reject`, {})).status, 400);
  const res = await as('admin-rania').post(`/results/${r.id}/reject`, { reason: 'Homework 2 missing' });
  assert.equal(res.body.status, 'rejected');
  assert.equal((await as('trainee-yousef').get('/trainees/trainee-yousef/progress')).body.credits, 0);
  const [note] = (await as('trainee-yousef').get('/notifications')).body.items;
  assert.deepEqual([note.kind, note.data.reason], ['resultRejected', 'Homework 2 missing']);
  assert.equal((await grade(as, 1, 80)).status, 201, 'a rejected result can be graded again');
});

test('reaching 30 credits with Web basics and a valid permit unlocks level 1, once', async () => {
  const { as } = setup();
  const admin = as('admin-rania');
  await admin.put('/permits/trainee-yousef', { status: 'verified', expiresOn: '2027-06-30' });
  for (const id of [1, 2]) {
    const { body: r } = await grade(as, id, 80);
    await admin.post(`/results/${r.id}/verify`);
  }
  const p = (await as('trainee-yousef').get('/trainees/trainee-yousef/progress')).body;
  assert.equal(p.credits, 35);
  assert.equal(p.level, 1);
  assert.deepEqual(p.next.missing, ['credits', 'requiredCourse', 'projects']);

  const kinds = (await as('trainee-yousef').get('/notifications')).body.items.map((n) => n.kind);
  assert.equal(kinds.filter((k) => k === 'levelReached').length, 1);
});

test('a permit verified later completes the level', async () => {
  const { as } = setup();
  const admin = as('admin-rania');
  await admin.post('/trainees/trainee-yousef/corrections', {
    amount: 20,
    reason: 'Credits from a pilot cohort',
  });
  const { body: r } = await grade(as, 1, 80);
  await admin.post(`/results/${r.id}/verify`);
  assert.equal((await as('trainee-yousef').get('/trainees/trainee-yousef/progress')).body.level, 0);

  await admin.put('/permits/trainee-yousef', { status: 'verified', expiresOn: '2027-01-31' });
  assert.equal((await as('trainee-yousef').get('/trainees/trainee-yousef/progress')).body.level, 1);
});

test('corrections are new ledger entries, positive or negative, never zero', async () => {
  const { as } = setup();
  const admin = as('admin-rania');
  assert.equal(
    (await admin.post('/trainees/trainee-mariam/corrections', { amount: 0, reason: 'nothing' })).status,
    400,
  );
  await admin.post('/trainees/trainee-mariam/corrections', { amount: 12, reason: 'Workshop credited late' });
  await admin.post('/trainees/trainee-mariam/corrections', { amount: -2, reason: 'Counted twice' });
  const p = (await as('trainee-mariam').get('/trainees/trainee-mariam/progress')).body;
  assert.equal(p.credits, 10);
  assert.deepEqual(
    p.ledger.map((e) => e.amount),
    [-2, 12],
  );
  assert.equal(
    (await as('instructor-omar').post('/trainees/trainee-mariam/corrections', { amount: 1, reason: 'x y z' }))
      .status,
    403,
  );
});

test('trainees see only their own progress; instructors never see permit data', async () => {
  const { as } = setup();
  assert.equal((await as('trainee-mariam').get('/trainees/trainee-yousef/progress')).status, 403);
  assert.equal((await as('company-zaytoun').get('/trainees/trainee-yousef/progress')).status, 403);
  assert.equal((await as('admin-rania').get('/trainees/nobody/progress')).status, 400);

  const own = (await as('trainee-yousef').get('/trainees/trainee-yousef/progress')).body;
  assert.equal(own.permitValid, false);
  assert.ok(own.next.missing.includes('permit'));

  const forInstructor = (await as('instructor-omar').get('/trainees/trainee-yousef/progress')).body;
  assert.equal('permitValid' in forInstructor, false);
  assert.ok(!forInstructor.next.missing.includes('permit'));
});

test('admins see every trainee with permit status and what expires soon', async () => {
  const { as } = setup();
  const admin = as('admin-rania');
  assert.equal(
    (await admin.put('/permits/trainee-ahmad', { status: 'verified' })).status,
    400,
    'needs a date',
  );
  await admin.put('/permits/trainee-ahmad', { status: 'verified', expiresOn: '2026-12-10' });
  await admin.put('/permits/trainee-mariam', { status: 'pending' });

  const items = (await admin.get('/permits')).body.items;
  const by = Object.fromEntries(items.map((i) => [i.traineeId, i]));
  assert.equal(by['trainee-ahmad'].expiringSoon, true);
  assert.equal(by['trainee-ahmad'].permitValid, true);
  assert.equal(by['trainee-mariam'].permitValid, false);
  assert.equal(by['trainee-yousef'].permit, null);
  assert.equal((await as('instructor-omar').get('/permits')).status, 403);
});

test('an admin pauses project access without touching credits or level', async () => {
  const { as } = setup();
  const res = await as('admin-rania').put('/trainees/trainee-ahmad/projects-paused', { paused: true });
  assert.equal(res.body.projectsPaused, true);
  const p = (await as('trainee-ahmad').get('/trainees/trainee-ahmad/progress')).body;
  assert.equal(p.projectsPaused, true);
  assert.equal(p.level, 0);
});

test('notifications are private and can be marked read', async () => {
  const { as } = setup();
  await as('admin-rania').post('/trainees/trainee-yousef/corrections', { amount: 5, reason: 'Bonus task' });
  const [note] = (await as('trainee-yousef').get('/notifications')).body.items;
  assert.equal(note.readAt, null);
  assert.equal((await as('trainee-mariam').post(`/notifications/${note.id}/read`)).status, 404);
  assert.equal((await as('trainee-yousef').post(`/notifications/${note.id}/read`)).status, 204);
  assert.notEqual((await as('trainee-yousef').get('/notifications')).body.items[0].readAt, null);
  assert.equal((await request(setup().app).get('/notifications')).status, 401);
});

test('a zero-credit course is verified without a ledger entry', async () => {
  const { as } = setup();
  const { body: r } = await grade(as, 4, 100);
  await as('admin-rania').post(`/results/${r.id}/verify`);
  const p = (await as('trainee-yousef').get('/trainees/trainee-yousef/progress')).body;
  assert.deepEqual([p.credits, p.ledger.length], [0, 0]);
});
