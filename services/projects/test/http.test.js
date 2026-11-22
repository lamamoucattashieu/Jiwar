import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { errorHandler, forbidden, HttpError } from '../src/http/errors.js';
import { hasRole } from '../src/http/auth.js';

const config = loadConfig({});
const quiet = { log: () => {} };

test('/me returns the chosen demo user', async () => {
  const res = await request(createApp(config, quiet)).get('/me').set('X-Demo-User', 'company-zaytoun');
  assert.equal(res.status, 200);
  assert.equal(res.body.company, 'Zaytoun Bakery');
});

test('/me without a user is 401, with an unknown user is 401', async () => {
  const app = createApp(config, quiet);
  assert.equal((await request(app).get('/me')).status, 401);
  assert.equal((await request(app).get('/me').set('X-Demo-User', 'nobody')).status, 401);
});

test('lists the demo users for the UI switcher', async () => {
  const res = await request(createApp(config, quiet)).get('/demo-users');
  assert.ok(res.body.items.some((u) => u.roles.includes('company')));
});

test('unknown routes return a JSON 404', async () => {
  const res = await request(createApp(config, quiet)).get('/nope');
  assert.equal(res.status, 404);
});

test('malformed JSON returns 400', async () => {
  const res = await request(createApp(config, quiet))
    .post('/me')
    .set('Content-Type', 'application/json')
    .send('{bad');
  assert.equal(res.status, 400);
});

test('error handler: deliberate errors keep their status, others become a generic 500', () => {
  const sent = [];
  const res = {
    status(s) {
      sent.push(s);
      return this;
    },
    json(b) {
      sent.push(b);
    },
  };
  const lines = [];
  const handle = errorHandler((l) => lines.push(l));
  handle(forbidden(), { method: 'GET', path: '/x' }, res);
  handle(new HttpError(422, 'nope', [{ field: 'a' }]), { method: 'GET', path: '/x' }, res);
  handle(new Error('secret detail'), { method: 'GET', path: '/x' }, res);
  assert.deepEqual(sent.slice(0, 4), [
    403,
    { error: 'You do not have permission to do this' },
    422,
    { error: 'nope', details: [{ field: 'a' }] },
  ]);
  assert.equal(sent[4], 500);
  assert.doesNotMatch(sent[5].error, /secret/);
  assert.equal(lines.length, 1);
});

test('hasRole is false for anonymous visitors', () => {
  assert.equal(hasRole(null, 'admin'), false);
});

test('/health/db reports a missing, healthy or unreachable database', async () => {
  assert.equal((await request(createApp(config, quiet)).get('/health/db')).body.database, 'not configured');
  const ok = { ping: async () => {} };
  assert.equal((await request(createApp(config, { ...quiet, db: ok })).get('/health/db')).status, 200);
  const down = { ping: async () => Promise.reject(new Error('paused')) };
  assert.equal((await request(createApp(config, { ...quiet, db: down })).get('/health/db')).status, 503);
});

test('config reads DATABASE_URL', () => {
  assert.equal(loadConfig({ DATABASE_URL: 'mssql://x' }).databaseUrl, 'mssql://x');
});
