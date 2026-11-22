import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { errorHandler } from '../src/http/errors.js';

const config = loadConfig({});
const quiet = { log: () => {} };

test('an unknown demo user is rejected with 401', async () => {
  const res = await request(createApp(config, quiet)).get('/courses').set('X-Demo-User', 'nobody');
  assert.equal(res.status, 401);
  assert.match(res.body.error, /Unknown demo user/);
});

test('the request log shows the full path without the query string', async () => {
  const lines = [];
  await request(createApp(config, { log: (l) => lines.push(l) })).get('/courses/5?secret=1');
  assert.equal(JSON.parse(lines[0]).path, '/courses/5');
});

test('lists the demo users for the UI switcher', async () => {
  const res = await request(createApp(config, quiet)).get('/demo-users');
  assert.ok(res.body.items.some((u) => u.roles.includes('admin')));
});

test('/me returns the chosen demo user and needs one', async () => {
  const app = createApp(config, quiet);
  const res = await request(app).get('/me').set('X-Demo-User', 'trainee-yousef');
  assert.equal(res.body.name, 'Yousef Hamdan');
  assert.equal((await request(app).get('/me')).status, 401);
});

test('unknown routes return a JSON 404', async () => {
  const res = await request(createApp(config, quiet)).get('/nope');
  assert.equal(res.status, 404);
  assert.deepEqual(res.body, { error: 'Not found' });
});

test('malformed JSON returns 400, not a stack trace', async () => {
  const res = await request(createApp(config, quiet))
    .post('/courses')
    .set('X-Demo-User', 'admin-rania')
    .set('Content-Type', 'application/json')
    .send('{bad json');
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'The request body is not valid JSON');
});

test('unexpected errors return a generic 500 and are logged without the body', () => {
  const lines = [];
  let status;
  let body;
  const res = {
    status(s) {
      status = s;
      return this;
    },
    json(b) {
      body = b;
    },
  };
  errorHandler((l) => lines.push(l))(new Error('db exploded'), { method: 'GET', path: '/x' }, res);
  assert.equal(status, 500);
  assert.doesNotMatch(body.error, /exploded/);
  assert.match(lines[0], /db exploded/);
});

test('/health/db reports a missing, healthy or unreachable database', async () => {
  const none = await request(createApp(config, quiet)).get('/health/db');
  assert.deepEqual(none.body, { database: 'not configured' });

  const ok = await request(createApp(config, { ...quiet, db: { ping: async () => {} } })).get('/health/db');
  assert.equal(ok.status, 200);

  const down = { ping: async () => Promise.reject(new Error('paused')) };
  const bad = await request(createApp(config, { ...quiet, db: down })).get('/health/db');
  assert.equal(bad.status, 503);
  assert.deepEqual(bad.body, { database: 'unreachable' });
});

test('config reads DATABASE_URL and treats an empty one as unset', () => {
  assert.equal(loadConfig({ DATABASE_URL: 'mssql://x' }).databaseUrl, 'mssql://x');
  assert.equal(loadConfig({ DATABASE_URL: '' }).databaseUrl, undefined);
});
