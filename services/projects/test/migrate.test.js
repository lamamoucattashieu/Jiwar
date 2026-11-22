import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checksum, loadMigrations, parseMigration, runMigrations, splitBatches } from '../src/db/migrate.js';

// A fake database that remembers which migrations are recorded and every statement run.
function fakeDb(alreadyApplied = []) {
  const history = new Map(alreadyApplied.map((m) => [m.version, m.checksum]));
  const statements = [];
  const exec = async (text, params = {}) => {
    statements.push(text.trim());
    if (text.startsWith('SELECT version, checksum')) {
      return [...history].map(([version, sum]) => ({ version, checksum: sum }));
    }
    if (text.startsWith('SELECT 1 AS done')) return history.has(params.version) ? [{ done: 1 }] : [];
    if (text.startsWith('INSERT INTO schema_migrations')) history.set(params.version, params.checksum);
    return [];
  };
  return { history, statements, query: exec, transaction: (fn) => fn({ query: exec }) };
}

const m1 = parseMigration('001_create_things.sql', 'CREATE TABLE things (id INT);');
const m2 = parseMigration('002_seed_things.sql', 'INSERT INTO things VALUES (1);\nGO\nSELECT 1;');

test('applies pending migrations in order and records each one', async () => {
  const db = fakeDb();
  const applied = await runMigrations(db, [m1, m2]);
  assert.equal(applied, 2);
  assert.deepEqual([...db.history.keys()], [1, 2]);
  assert.ok(db.statements.includes('CREATE TABLE things (id INT);'));
  assert.ok(db.statements.includes('SELECT 1;'), 'GO splits a file into batches');
});

test('skips migrations that are already applied', async () => {
  const db = fakeDb([m1]);
  assert.equal(await runMigrations(db, [m1, m2]), 1);
  assert.ok(!db.statements.includes('CREATE TABLE things (id INT);'));
});

test('refuses a migration that was edited after it was applied', async () => {
  const db = fakeDb([{ version: 1, checksum: 'old' }]);
  await assert.rejects(runMigrations(db, [m1]), /changed after it was applied/);
});

test('does not run a migration another instance applied while waiting for the lock', async () => {
  const db = fakeDb();
  const original = db.transaction;
  db.transaction = (fn) => {
    db.history.set(1, m1.checksum); // the other instance finished first
    return original(fn);
  };
  assert.equal(await runMigrations(db, [m1]), 0);
});

test('checksums ignore Windows line endings', () => {
  assert.equal(checksum('a\r\nb'), checksum('a\nb'));
});

test('splitBatches drops empty batches and is case-insensitive', () => {
  assert.deepEqual(splitBatches('A\ngo\n\nGO\nB\n'), ['A', 'B']);
});

test('rejects badly named files', () => {
  assert.throws(() => parseMigration('create.sql', ''), /must look like/);
});

test('loads .sql files from a folder in order and rejects duplicate versions', () => {
  const dir = mkdtempSync(join(tmpdir(), 'migrations-'));
  writeFileSync(join(dir, '002_b.sql'), 'SELECT 2;');
  writeFileSync(join(dir, '001_a.sql'), 'SELECT 1;');
  writeFileSync(join(dir, 'README.md'), 'not a migration');
  assert.deepEqual(
    loadMigrations(dir).map((m) => m.version),
    [1, 2],
  );

  writeFileSync(join(dir, '002_c.sql'), 'SELECT 3;');
  assert.throws(() => loadMigrations(dir), /share version 2/);
});

test('a missing folder means no migrations', () => {
  assert.deepEqual(loadMigrations(join(tmpdir(), 'does-not-exist-jiwar')), []);
});
