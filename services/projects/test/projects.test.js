// The whole project workflow through the HTTP API, with the in-memory store,
// the mock payment provider and a fake learning service.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createMemoryProjectStore } from '../src/projects/projectStore.memory.js';
import { HttpError } from '../src/http/errors.js';

// What the learning service would say about each trainee.
const ELIGIBILITY = {
  'trainee-ahmad': { level: 1, permitValid: true, projectsPaused: false },
  'trainee-mariam': { level: 0, permitValid: false, projectsPaused: false },
  'trainee-yousef': { level: 1, permitValid: true, projectsPaused: true },
};

function fakeLearning({ down = false } = {}) {
  const credits = [];
  return {
    credits,
    down,
    async eligibility(traineeId) {
      if (this.down) throw new HttpError(503, 'The learning service is not reachable right now');
      return { traineeId, name: traineeId, ...ELIGIBILITY[traineeId] };
    },
    async awardProjectCredit(payload) {
      if (this.down) throw new Error('learning down');
      credits.push(payload);
      return { amount: 5 };
    },
  };
}

function setup(opts) {
  const store = createMemoryProjectStore();
  const learning = fakeLearning(opts);
  const app = createApp(loadConfig({}), { log: () => {}, repos: { projects: store }, learning });
  const as = (user) => ({
    get: (url) => request(app).get(url).set('X-Demo-User', user),
    post: (url, body = {}) => request(app).post(url).set('X-Demo-User', user).send(body),
  });
  return { app, store, learning, as };
}

const brief = {
  packCode: 'website',
  title: 'Zaytoun Bakery website',
  goals: 'Show our cakes and take orders for events.',
};

async function deliveredProject(as) {
  const { body: p } = await as('company-zaytoun').post('/projects', brief);
  await as('company-zaytoun').post(`/projects/${p.id}/accept`);
  await as('admin-rania').post(`/projects/${p.id}/assign`, { traineeId: 'trainee-ahmad' });
  await as('trainee-ahmad').post(`/projects/${p.id}/submit`, { note: 'Ready for review' });
  return p.id;
}

test('packs, showcase and portfolios are public', async () => {
  const { app } = setup();
  const packs = (await request(app).get('/packs')).body.items;
  assert.deepEqual(
    packs.map((p) => p.code),
    ['website', 'whatsapp-bot', 'ai-assistant'],
  );
  assert.equal((await request(app).get('/showcase')).status, 200);
  assert.equal((await request(app).get('/portfolio/trainee-ahmad')).body.name, 'Ahmad');
  assert.equal((await request(app).get('/portfolio/company-zaytoun')).status, 404);
});

test('a pack request is quoted at its fixed price; a custom request waits for an admin quote', async () => {
  const { as } = setup();
  const pack = (await as('company-zaytoun').post('/projects', brief)).body;
  assert.deepEqual([pack.status, pack.priceJd, pack.setupFeeJd, pack.levelRequired], ['quoted', 150, 30, 1]);

  const custom = (await as('company-zaytoun').post('/projects', { ...brief, packCode: null })).body;
  assert.equal(custom.status, 'requested');
  assert.equal((await as('company-zaytoun').post(`/projects/${custom.id}/accept`)).status, 409);

  const quoted = await as('admin-rania').post(`/projects/${custom.id}/quote`, {
    setupFeeJd: 40,
    priceJd: 220.5,
    levelRequired: 1,
  });
  assert.deepEqual([quoted.body.status, quoted.body.priceJd], ['quoted', 220.5]);
});

test('only companies request projects, and the brief is validated', async () => {
  const { as } = setup();
  assert.equal((await as('trainee-ahmad').post('/projects', brief)).status, 403);
  const bad = await as('company-zaytoun').post('/projects', { title: 'x', goals: 'short' });
  assert.equal(bad.status, 400);
  const nobody = await as('company-zaytoun').post('/projects', { ...brief, preferredTraineeId: 'nobody' });
  assert.equal(nobody.status, 400);
});

test('the full workflow: accept and pay, assign, submit, revise, approve and pay, rate', async () => {
  const { as, learning } = setup();
  const company = as('company-zaytoun');
  const id = await deliveredProject(as);

  const revision = await company.post(`/projects/${id}/request-revision`, { note: 'Add opening hours' });
  assert.deepEqual([revision.body.status, revision.body.revisionsUsed], ['in_progress', 1]);
  await as('trainee-ahmad').post(`/projects/${id}/submit`);

  const approved = await company.post(`/projects/${id}/approve`);
  assert.equal(approved.body.status, 'approved');
  assert.deepEqual(learning.credits, [{ projectId: id, traineeId: 'trainee-ahmad', title: brief.title }]);

  const rated = await company.post(`/projects/${id}/rate`, {
    rating: 5,
    testimonial: 'Great work',
    testimonialPublic: true,
  });
  assert.equal(rated.body.rating, 5);

  const page = (await company.get(`/projects/${id}`)).body;
  assert.deepEqual(
    page.events.map((e) => e.action),
    ['request', 'accept', 'assign', 'submit', 'request_revision', 'submit', 'approve'],
  );
  assert.deepEqual(
    page.invoices.map((i) => [i.kind, i.amountJd]),
    [
      ['setup_fee', 30],
      ['project_price', 150],
    ],
  );
  assert.equal(page.payout, null, 'companies never see what the trainee is paid');

  const forTrainee = (await as('trainee-ahmad').get(`/projects/${id}`)).body;
  assert.deepEqual([forTrainee.payout.amountJd, forTrainee.payout.jiwarShareJd], [120, 30]);
  assert.deepEqual(forTrainee.invoices, []);

  const showcase = (await as('company-petra').get('/showcase')).body.items;
  assert.deepEqual([showcase[0].trainee, showcase[0].testimonial], ['Ahmad', 'Great work']);
  const earnings = (await as('trainee-ahmad').get('/payouts')).body.items;
  assert.equal(earnings[0].amountJd, 120);
});

test('revision rounds run out after two', async () => {
  const { as } = setup();
  const id = await deliveredProject(as);
  for (let i = 0; i < 2; i += 1) {
    await as('company-zaytoun').post(`/projects/${id}/request-revision`, { note: `Round ${i + 1}` });
    await as('trainee-ahmad').post(`/projects/${id}/submit`);
  }
  const page = (await as('company-zaytoun').get(`/projects/${id}`)).body;
  assert.deepEqual(page.actions, ['approve']);
  const third = await as('company-zaytoun').post(`/projects/${id}/request-revision`, { note: 'Again' });
  assert.equal(third.status, 409);
  assert.equal((await as('company-zaytoun').post(`/projects/${id}/request-revision`)).status, 400);
});

test('a declined card changes nothing', async () => {
  const { as } = setup();
  const { body: p } = await as('company-zaytoun').post('/projects', brief);
  const declined = await as('company-zaytoun').post(`/projects/${p.id}/accept`, { simulateDecline: true });
  assert.equal(declined.status, 402);
  const page = (await as('company-zaytoun').get(`/projects/${p.id}`)).body;
  assert.deepEqual([page.status, page.invoices.length], ['quoted', 0]);
});

test('each step belongs to one role, and other people cannot even see the project', async () => {
  const { as } = setup();
  const { body: p } = await as('company-zaytoun').post('/projects', brief);
  assert.equal((await as('company-petra').get(`/projects/${p.id}`)).status, 404);
  assert.equal((await as('company-petra').post(`/projects/${p.id}/accept`)).status, 404);
  assert.equal((await as('admin-rania').post(`/projects/${p.id}/accept`)).status, 403, 'the company pays');
  await as('company-zaytoun').post(`/projects/${p.id}/accept`);
  assert.equal(
    (await as('company-zaytoun').post(`/projects/${p.id}/assign`, { traineeId: 'trainee-ahmad' })).status,
    403,
  );
  assert.equal((await as('instructor-omar').get('/projects')).status, 403);
  assert.equal((await as('company-zaytoun').post(`/projects/${p.id}/rate`, { rating: 5 })).status, 409);
});

test('only eligible trainees can be assigned: level, valid permit, not paused', async () => {
  const { as } = setup();
  const { body: p } = await as('company-zaytoun').post('/projects', brief);
  await as('company-zaytoun').post(`/projects/${p.id}/accept`);

  const candidates = (await as('admin-rania').get(`/projects/${p.id}/candidates`)).body.items;
  const by = Object.fromEntries(candidates.map((c) => [c.traineeId, c]));
  assert.equal(by['trainee-ahmad'].eligible, true);
  assert.deepEqual(by['trainee-mariam'].problems, ['level', 'permit']);
  assert.deepEqual(by['trainee-yousef'].problems, ['paused']);

  const refused = await as('admin-rania').post(`/projects/${p.id}/assign`, { traineeId: 'trainee-mariam' });
  assert.equal(refused.status, 409);
  assert.match(refused.body.error, /level, permit/);
  assert.equal(
    (await as('admin-rania').post(`/projects/${p.id}/assign`, { traineeId: 'company-petra' })).status,
    400,
  );
});

test('with learning down, assignment fails clearly and everything else keeps working', async () => {
  const { as, learning } = setup({ down: true });
  const { body: p } = await as('company-zaytoun').post('/projects', brief);
  await as('company-zaytoun').post(`/projects/${p.id}/accept`);

  const assign = await as('admin-rania').post(`/projects/${p.id}/assign`, { traineeId: 'trainee-ahmad' });
  assert.equal(assign.status, 503);
  assert.match(assign.body.error, /not reachable/);
  assert.equal((await as('admin-rania').get(`/projects/${p.id}/candidates`)).status, 503);

  assert.equal((await as('company-zaytoun').get('/projects')).status, 200);
  assert.equal(
    (await as('company-zaytoun').post(`/projects/${p.id}/messages`, { body: 'Any news?' })).status,
    201,
  );
  const portfolio = (await as('company-zaytoun').get('/portfolio/trainee-ahmad')).body;
  assert.equal(portfolio.level, null, 'the portfolio shows without the level badge');
  learning.down = false;
});

test('an approval while learning is down is delivered later, not lost', async () => {
  const { app, as, learning, store } = setup();
  const id = await deliveredProject(as);
  learning.down = true;
  assert.equal((await as('company-zaytoun').post(`/projects/${id}/approve`)).status, 200);
  assert.equal(learning.credits.length, 0);
  assert.equal((await store.pendingEvents(10, 8)).length, 1);

  learning.down = false;
  await app.locals.outbox.drain();
  assert.equal(learning.credits.length, 1);
  assert.equal((await store.pendingEvents(10, 8)).length, 0);
});

test('messages, cancelling, invoices and the admin pipeline', async () => {
  const { as } = setup();
  const { body: p } = await as('company-zaytoun').post('/projects', { ...brief, packCode: null });
  const msg = await as('company-zaytoun').post(`/projects/${p.id}/messages`, { body: 'Hello' });
  assert.equal(msg.body.authorId, 'company-zaytoun');
  assert.equal((await as('company-zaytoun').post(`/projects/${p.id}/messages`, { body: '' })).status, 400);

  assert.equal((await as('company-zaytoun').post(`/projects/${p.id}/cancel`)).body.status, 'cancelled');
  assert.equal((await as('admin-rania').get('/projects?status=cancelled')).body.items.length, 1);
  assert.equal((await as('company-zaytoun').get('/invoices')).status, 200);
  assert.equal((await as('admin-rania').get('/invoices')).status, 200);
  assert.equal((await as('trainee-ahmad').get('/invoices')).status, 403);
  assert.equal((await as('admin-rania').get('/payouts')).status, 200);
  assert.equal((await as('company-zaytoun').get('/payouts')).status, 403);
  assert.equal((await as('trainee-ahmad').get('/projects')).body.items.length, 0);
});
