import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';

const config = loadConfig({ CORS_ORIGIN: 'http://ui.test', GIT_SHA: 'abc123' });

test('GET /health returns 200 with service name and version', async () => {
  const res = await request(createApp(config, { log: () => {} })).get('/health');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { status: 'ok', service: 'learning', version: 'abc123' });
});

test('logs one line per request with method, path, status and duration', async () => {
  const lines = [];
  await request(createApp(config, { log: (l) => lines.push(l) })).get('/health');
  assert.equal(lines.length, 1);
  const entry = JSON.parse(lines[0]);
  assert.equal(entry.method, 'GET');
  assert.equal(entry.path, '/health');
  assert.equal(entry.status, 200);
  assert.equal(typeof entry.duration_ms, 'number');
});

test('CORS only allows the configured UI origin', async () => {
  const res = await request(createApp(config, { log: () => {} }))
    .get('/health')
    .set('Origin', 'http://ui.test');
  assert.equal(res.headers['access-control-allow-origin'], 'http://ui.test');
});

test('config falls back to local defaults', () => {
  const defaults = loadConfig({});
  assert.equal(defaults.port, 8000);
  assert.equal(defaults.corsOrigin, 'http://localhost:8080');
  assert.equal(defaults.version, 'dev');
});
