// The API the projects service calls: eligibility and project credits.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createMemoryCreditStore } from '../src/credits/creditStore.memory.js';

const KEY = 'test-internal-key';

function setup({ key = KEY } = {}) {
  const store = createMemoryCreditStore();
  const config = loadConfig({ INTERNAL_API_KEY: key });
  const app = createApp(config, { log: () => {}, repos: { credits: store }, today: () => '2026-11-23' });
  return { app, store };
}

const call = (app, method, url, key = KEY) => request(app)[method](url).set('X-Internal-Key', key);

test('the internal API needs the right key, and is off when no key is configured', async () => {
  const { app } = setup();
  assert.equal((await request(app).get('/internal/trainees/trainee-ahmad/eligibility')).status, 401);
  assert.equal((await call(app, 'get', '/internal/trainees/trainee-ahmad/eligibility', 'wrong')).status, 401);
  assert.equal((await call(app, 'get', '/internal/trainees/trainee-ahmad/eligibility')).status, 200);

  const off = setup({ key: '' }).app;
  assert.equal((await call(off, 'get', '/internal/trainees/trainee-ahmad/eligibility')).status, 503);
});

test('eligibility reports level, permit validity and paused, nothing more', async () => {
  const { app, store } = setup();
  await store.saveProfile({ traineeId: 'trainee-ahmad', level: 1, projectsPaused: false });
  await store.savePermit({ traineeId: 'trainee-ahmad', status: 'verified', expiresOn: '2027-06-30' });
  const res = await call(app, 'get', '/internal/trainees/trainee-ahmad/eligibility');
  assert.deepEqual(res.body, {
    traineeId: 'trainee-ahmad',
    name: 'Ahmad Nasser',
    level: 1,
    permitValid: true,
    projectsPaused: false,
  });
  const fresh = (await call(app, 'get', '/internal/trainees/trainee-mariam/eligibility')).body;
  assert.deepEqual([fresh.level, fresh.permitValid], [0, false]);
  assert.equal((await call(app, 'get', '/internal/trainees/company-zaytoun/eligibility')).status, 400);
});

test('an approved project adds 5 credits once, however often the projects service retries', async () => {
  const { app, store } = setup();
  const body = { traineeId: 'trainee-ahmad', projectId: 7, title: 'Petra Trails website' };
  const first = await call(app, 'post', '/internal/project-credits').send(body);
  assert.equal(first.status, 201);
  assert.equal(first.body.amount, 5);
  const again = await call(app, 'post', '/internal/project-credits').send(body);
  assert.equal(again.status, 200);
  assert.equal(again.body.id, first.body.id);
  assert.equal(await store.creditTotal('trainee-ahmad'), 5);
  assert.equal(await store.countProjectCredits('trainee-ahmad'), 1);

  const notes = await store.listNotifications('trainee-ahmad');
  assert.equal(notes[0].data.reason, 'Completed client project: Petra Trails website');
  assert.equal((await call(app, 'post', '/internal/project-credits').send({ traineeId: 'x' })).status, 400);
});
