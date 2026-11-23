// The coding workspace through the API: repository, protected main, branches,
// commits, pull requests, review and merge, and the grade reaching the
// verification queue.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createMemoryCourseRepository } from '../src/courses/courseRepository.memory.js';

const course = (over) => ({
  description: '',
  type: 'module',
  credits: 10,
  passMark: 60,
  published: true,
  instructorId: 'instructor-omar',
  requiredForLevel: null,
  ...over,
});

function setup() {
  const courses = createMemoryCourseRepository([
    course({ title: 'Web basics' }), // 1, Omar
    course({ title: 'React', instructorId: 'instructor-dana' }), // 2, Dana
    course({ title: 'Draft', published: false }), // 3
  ]);
  const app = createApp(loadConfig({}), { log: () => {}, repos: { courses }, today: () => '2026-11-23' });
  const as = (user) => ({
    get: (url) => request(app).get(url).set('X-Demo-User', user),
    post: (url, body = {}) => request(app).post(url).set('X-Demo-User', user).send(body),
  });
  return { as };
}

const page = (body) => [
  { path: 'README.md', content: '# Web basics\n' },
  { path: 'index.html', content: body },
];

// Repository with a branch "feature" holding one commit, and a pull request from it.
async function withPull(as, trainee = 'trainee-yousef') {
  const { body: repo } = await as(trainee).post('/courses/1/workspace');
  await as(trainee).post(`/repos/${repo.id}/branches`, { name: 'feature' });
  await as(trainee).post(`/repos/${repo.id}/commits`, {
    branch: 'feature',
    message: 'Add my heading',
    files: page('<h1>Yousef</h1>\n'),
  });
  const { body: pull } = await as(trainee).post(`/repos/${repo.id}/pulls`, {
    source: 'feature',
    title: 'Homework 1',
  });
  return { repo, pull };
}

test('a trainee opens one workspace per course, created from the template on main', async () => {
  const { as } = setup();
  const first = await as('trainee-yousef').post('/courses/1/workspace');
  const again = await as('trainee-yousef').post('/courses/1/workspace');
  assert.equal(first.body.id, again.body.id);

  const files = (await as('trainee-yousef').get(`/repos/${first.body.id}/files`)).body.items;
  assert.deepEqual(
    files.map((f) => f.path),
    ['index.html', 'README.md'], // sorted ignoring case, like SQL Server's default collation
  );
  const history = (await as('trainee-yousef').get(`/repos/${first.body.id}/commits`)).body.items;
  assert.equal(history[0].message, 'Start from the course template');

  assert.equal((await as('instructor-omar').post('/courses/1/workspace')).status, 403);
  assert.equal((await as('trainee-yousef').post('/courses/3/workspace')).status, 404, 'unpublished');
});

test('main is protected; work happens on branches, and empty commits are refused', async () => {
  const { as } = setup();
  const { body: repo } = await as('trainee-yousef').post('/courses/1/workspace');
  const toMain = await as('trainee-yousef').post(`/repos/${repo.id}/commits`, {
    branch: 'main',
    message: 'Straight to main',
    files: page('x'),
  });
  assert.equal(toMain.status, 403);
  assert.match(toMain.body.error, /protected/);

  assert.equal(
    (await as('trainee-yousef').post(`/repos/${repo.id}/branches`, { name: 'feature' })).status,
    201,
  );
  assert.equal(
    (await as('trainee-yousef').post(`/repos/${repo.id}/branches`, { name: 'feature' })).status,
    409,
  );
  assert.equal(
    (await as('trainee-yousef').post(`/repos/${repo.id}/branches`, { name: 'Bad Name!' })).status,
    400,
  );
  assert.equal(
    (await as('trainee-yousef').post(`/repos/${repo.id}/branches`, { name: 'x', from: 'nope' })).status,
    404,
  );

  const template = (await as('trainee-yousef').get(`/repos/${repo.id}/files`)).body.items;
  const unchanged = await as('trainee-yousef').post(`/repos/${repo.id}/commits`, {
    branch: 'feature',
    message: 'No change',
    files: template,
  });
  assert.equal(unchanged.status, 409);

  const ok = await as('trainee-yousef').post(`/repos/${repo.id}/commits`, {
    branch: 'feature',
    message: 'My page',
    files: page('<p>mine</p>'),
  });
  assert.equal(ok.status, 201);
  const feature = (await as('trainee-yousef').get(`/repos/${repo.id}/files?branch=feature`)).body.items;
  assert.equal(feature.find((f) => f.path === 'index.html').content, '<p>mine</p>');
  assert.equal(
    (await as('trainee-yousef').get(`/repos/${repo.id}/commits?branch=feature`)).body.items.length,
    2,
  );
});

test('file paths and sizes are checked', async () => {
  const { as } = setup();
  const { body: repo } = await as('trainee-yousef').post('/courses/1/workspace');
  await as('trainee-yousef').post(`/repos/${repo.id}/branches`, { name: 'f' });
  const bad = (files) =>
    as('trainee-yousef').post(`/repos/${repo.id}/commits`, { branch: 'f', message: 'try', files });
  assert.equal((await bad([{ path: '../secret', content: '' }])).status, 400);
  assert.equal((await bad([{ path: '/abs', content: '' }])).status, 400);
  assert.equal(
    (
      await bad([
        { path: 'a.js', content: '' },
        { path: 'a.js', content: '' },
      ])
    ).status,
    400,
  );
  assert.equal((await bad([{ path: 'big.txt', content: 'x'.repeat(50_001) }])).status, 400);
  assert.equal((await bad([{ path: 'css/site.css', content: 'body{}' }])).status, 201);
});

test('only the owner writes; the course instructor reads; everyone else gets 404', async () => {
  const { as } = setup();
  const { repo } = await withPull(as);
  assert.equal((await as('trainee-mariam').get(`/repos/${repo.id}`)).status, 404);
  assert.equal((await as('instructor-dana').get(`/repos/${repo.id}`)).status, 404, 'not her course');
  assert.equal((await as('company-zaytoun').get(`/repos/${repo.id}`)).status, 404);

  const omar = await as('instructor-omar').get(`/repos/${repo.id}`);
  assert.equal(omar.status, 200);
  assert.equal(omar.body.canWrite, false);
  assert.equal(omar.body.courseTitle, 'Web basics');
  assert.equal((await as('instructor-omar').post(`/repos/${repo.id}/branches`, { name: 'x' })).status, 403);

  assert.equal((await as('instructor-omar').get('/repos')).body.items.length, 1);
  assert.equal((await as('instructor-dana').get('/repos')).body.items.length, 0);
  assert.equal((await as('admin-rania').get('/repos')).body.items.length, 1);
  assert.equal((await as('trainee-mariam').get('/repos')).body.items.length, 0);
});

test('a pull request shows the diff against main, and line comments', async () => {
  const { as } = setup();
  const { pull } = await withPull(as);
  assert.equal(pull.status, 'open');

  const view = (await as('instructor-omar').get(`/pulls/${pull.id}`)).body;
  assert.equal(view.canReview, true);
  const index = view.diff.find((f) => f.path === 'index.html');
  assert.equal(index.status, 'modified');
  assert.ok(index.lines.some((l) => l.type === 'add' && l.text === '<h1>Yousef</h1>'));
  assert.equal(view.diff.find((f) => f.path === 'README.md').status, 'modified');

  const c = await as('instructor-omar').post(`/pulls/${pull.id}/comments`, {
    path: 'index.html',
    line: 1,
    body: 'Use a <main> element around your content.',
  });
  assert.equal(c.status, 201);
  await as('trainee-yousef').post(`/pulls/${pull.id}/comments`, { body: 'Thanks, will do' });
  const comments = (await as('trainee-yousef').get(`/pulls/${pull.id}`)).body.comments;
  assert.deepEqual(
    comments.map((x) => [x.path, x.line, x.authorId]),
    [
      ['index.html', 1, 'instructor-omar'],
      [null, null, 'trainee-yousef'],
    ],
  );
  assert.equal((await as('trainee-yousef').get(`/pulls/${pull.id}`)).body.canReview, false);
  assert.equal((await as('trainee-mariam').get(`/pulls/${pull.id}`)).status, 404);
});

test('a pull request needs real changes, comes from a branch, and only once per branch', async () => {
  const { as } = setup();
  const { repo } = await withPull(as);
  const p = (source) => as('trainee-yousef').post(`/repos/${repo.id}/pulls`, { source, title: 'Again' });
  assert.equal((await p('feature')).status, 409, 'already open');
  assert.equal((await p('main')).status, 409);
  await as('trainee-yousef').post(`/repos/${repo.id}/branches`, { name: 'empty' });
  assert.equal((await p('empty')).status, 409, 'no changes');
});

test('requesting changes sends it back; a new commit puts it in the review queue again', async () => {
  const { as } = setup();
  const { repo, pull } = await withPull(as);
  assert.equal((await as('instructor-omar').get('/reviews')).body.items.length, 1);
  assert.equal(
    (await as('trainee-yousef').post(`/pulls/${pull.id}/request-changes`, { body: 'nope' })).status,
    403,
  );

  const sent = await as('instructor-omar').post(`/pulls/${pull.id}/request-changes`, {
    body: 'Add a footer please',
  });
  assert.equal(sent.body.status, 'changes_requested');
  assert.equal((await as('instructor-omar').get('/reviews')).body.items.length, 0);
  assert.equal((await as('instructor-omar').post(`/pulls/${pull.id}/approve`)).status, 409);

  await as('trainee-yousef').post(`/repos/${repo.id}/commits`, {
    branch: 'feature',
    message: 'Add footer',
    files: page('<h1>Yousef</h1>\n<footer>2026</footer>\n'),
  });
  const queue = (await as('instructor-omar').get('/reviews')).body.items;
  assert.deepEqual([queue.length, queue[0].traineeId], [1, 'trainee-yousef']);
});

test('approving merges into main and sends the grade to the verification queue', async () => {
  const { as } = setup();
  const { repo, pull } = await withPull(as);
  const approved = await as('instructor-omar').post(`/pulls/${pull.id}/approve`, { grade: 85 });
  assert.equal(approved.status, 200);
  assert.equal(approved.body.status, 'merged');
  assert.equal(approved.body.result.status, 'pending_verification');

  const main = (await as('trainee-yousef').get(`/repos/${repo.id}/files`)).body.items;
  assert.equal(main.find((f) => f.path === 'index.html').content, '<h1>Yousef</h1>\n');
  const queue = (await as('admin-rania').get('/verification-queue')).body.items;
  assert.deepEqual([queue[0].traineeId, queue[0].grade], ['trainee-yousef', 85]);

  const merged = (await as('instructor-omar').get(`/pulls/${pull.id}`)).body;
  assert.equal(merged.canReview, false);
  assert.ok(merged.diff.length > 0, 'a merged pull request still shows what it changed');
  assert.equal((await as('instructor-omar').post(`/pulls/${pull.id}/approve`)).status, 409);
});

test('approving without a grade only merges; a refused grade merges nothing', async () => {
  const { as } = setup();
  const { pull } = await withPull(as);
  assert.equal((await as('instructor-omar').post(`/pulls/${pull.id}/approve`)).body.result, null);

  const second = await withPull(as, 'trainee-ahmad');
  await as('instructor-omar').post('/results', { courseId: 1, traineeId: 'trainee-ahmad', grade: 70 });
  const refused = await as('instructor-omar').post(`/pulls/${second.pull.id}/approve`, { grade: 90 });
  assert.equal(refused.status, 409, 'Ahmad already has a result for this course');
  assert.equal((await as('instructor-omar').get(`/pulls/${second.pull.id}`)).body.status, 'open');
});

test('a branch made before main moved cannot be merged', async () => {
  const { as } = setup();
  const t = as('trainee-yousef');
  const { body: repo } = await t.post('/courses/1/workspace');
  await t.post(`/repos/${repo.id}/branches`, { name: 'one' });
  await t.post(`/repos/${repo.id}/branches`, { name: 'two' });
  await t.post(`/repos/${repo.id}/commits`, { branch: 'one', message: 'First', files: page('1') });
  await t.post(`/repos/${repo.id}/commits`, { branch: 'two', message: 'Second', files: page('2') });
  const p1 = (await t.post(`/repos/${repo.id}/pulls`, { source: 'one', title: 'One' })).body;
  const p2 = (await t.post(`/repos/${repo.id}/pulls`, { source: 'two', title: 'Two' })).body;

  assert.equal((await as('instructor-omar').post(`/pulls/${p1.id}/approve`)).status, 200);
  const stale = await as('instructor-omar').post(`/pulls/${p2.id}/approve`);
  assert.equal(stale.status, 409);
  assert.match(stale.body.error, /main has changed/);
});
