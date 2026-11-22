import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createMemoryCourseRepository } from '../src/courses/courseRepository.memory.js';

const config = loadConfig({ CORS_ORIGIN: 'http://ui.test' });

const draft = {
  title: 'Draft workshop',
  type: 'workshop',
  credits: 4,
  instructorId: 'instructor-omar',
  published: false,
  description: '',
  passMark: 60,
};
const live = { ...draft, title: 'Published module', type: 'module', published: true };

function setup(seed = [draft, live]) {
  const app = createApp(config, { log: () => {}, repos: { courses: createMemoryCourseRepository(seed) } });
  const as = (user) => ({
    get: (url) => request(app).get(url).set('X-Demo-User', user),
    post: (url, body) => request(app).post(url).set('X-Demo-User', user).send(body),
    put: (url, body) => request(app).put(url).set('X-Demo-User', user).send(body),
    delete: (url) => request(app).delete(url).set('X-Demo-User', user),
  });
  return { app, as };
}

const newCourse = { title: 'Intro to Git', type: 'module', credits: 5 };

test('visitors and trainees only see published courses', async () => {
  const { app, as } = setup();
  const anon = await request(app).get('/courses');
  assert.deepEqual(
    anon.body.items.map((c) => c.title),
    ['Published module'],
  );
  const trainee = await as('trainee-yousef').get('/courses');
  assert.equal(trainee.body.items.length, 1);
});

test('admins see every course, instructors see their own with mine=true', async () => {
  const { as } = setup();
  assert.equal((await as('admin-rania').get('/courses')).body.items.length, 2);
  assert.equal((await as('instructor-omar').get('/courses?mine=true')).body.items.length, 2);
  assert.equal((await as('instructor-dana').get('/courses?mine=true')).body.items.length, 0);
});

test('only instructors can ask for their own courses', async () => {
  const { as } = setup();
  assert.equal((await as('trainee-yousef').get('/courses?mine=true')).status, 403);
});

test('filters by type and paginates', async () => {
  const { as } = setup();
  const res = await as('admin-rania').get('/courses?type=workshop&limit=1&offset=0');
  assert.deepEqual(
    res.body.items.map((c) => c.type),
    ['workshop'],
  );
});

test('an instructor creates a course with defaults and owns it', async () => {
  const { as } = setup([]);
  const res = await as('instructor-dana').post('/courses', newCourse);
  assert.equal(res.status, 201);
  assert.equal(res.headers.location, `/courses/${res.body.id}`);
  assert.equal(res.body.instructorId, 'instructor-dana');
  assert.equal(res.body.passMark, 60);
  assert.equal(res.body.published, false);
});

test('trainees and companies cannot create courses; visitors must choose a user', async () => {
  const { app, as } = setup([]);
  assert.equal((await as('trainee-yousef').post('/courses', newCourse)).status, 403);
  assert.equal((await as('company-zaytoun').post('/courses', newCourse)).status, 403);
  assert.equal((await request(app).post('/courses').send(newCourse)).status, 401);
});

test('invalid input returns 400 with the fields that failed', async () => {
  const { as } = setup([]);
  const res = await as('instructor-omar').post('/courses', { title: 'x', type: 'party', credits: -1 });
  assert.equal(res.status, 400);
  assert.deepEqual(res.body.details.map((d) => d.field).sort(), ['credits', 'title', 'type']);
});

test('the owner edits and deletes a course', async () => {
  const { as } = setup([draft]);
  const put = await as('instructor-omar').put('/courses/1', { ...newCourse, published: true });
  assert.equal(put.status, 200);
  assert.equal(put.body.title, 'Intro to Git');
  assert.equal(put.body.published, true);

  assert.equal((await as('instructor-omar').delete('/courses/1')).status, 204);
  assert.equal((await as('admin-rania').get('/courses/1')).status, 404);
});

test('another instructor cannot edit or delete the course; an admin can', async () => {
  const { as } = setup([live]);
  assert.equal((await as('instructor-dana').put('/courses/1', newCourse)).status, 403);
  assert.equal((await as('instructor-dana').delete('/courses/1')).status, 403);
  assert.equal((await as('admin-rania').put('/courses/1', newCourse)).status, 200);
});

test('unpublished courses are hidden from trainees, visible to the owner', async () => {
  const { as } = setup([draft]);
  assert.equal((await as('trainee-mariam').get('/courses/1')).status, 404);
  assert.equal((await as('instructor-omar').get('/courses/1')).status, 200);
});

test('a bad id returns 400, an unknown id 404', async () => {
  const { as } = setup([]);
  assert.equal((await as('admin-rania').get('/courses/abc')).status, 400);
  assert.equal((await as('admin-rania').get('/courses/99')).status, 404);
});
