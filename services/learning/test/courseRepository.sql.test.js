// Checks the SQL adapter's queries and row mapping with a fake executor.
// The real SQL Server is exercised by docker compose and the deployed smoke test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSqlCourseRepository } from '../src/courses/courseRepository.sql.js';

const row = {
  id: 7,
  title: 'Web basics',
  description: 'd',
  type: 'module',
  credits: 10,
  pass_mark: 60,
  instructor_id: 'instructor-omar',
  published: 1,
  created_at: 't1',
  updated_at: 't2',
};

function fakeDb(rows = [row]) {
  const calls = [];
  return { calls, query: async (text, params) => (calls.push({ text, params }), rows) };
}

test('maps database rows to camelCase courses', async () => {
  const repo = createSqlCourseRepository(fakeDb());
  assert.deepEqual(await repo.findById(7), {
    id: 7,
    title: 'Web basics',
    description: 'd',
    type: 'module',
    credits: 10,
    passMark: 60,
    instructorId: 'instructor-omar',
    published: true,
    createdAt: 't1',
    updatedAt: 't2',
  });
});

test('findById returns null when there is no row', async () => {
  assert.equal(await createSqlCourseRepository(fakeDb([])).findById(1), null);
});

test('list only adds the filters it is given, always with parameters', async () => {
  const db = fakeDb();
  const repo = createSqlCourseRepository(db);
  await repo.list({ limit: 10, offset: 0 });
  assert.doesNotMatch(db.calls[0].text, /WHERE/);

  await repo.list({ published: true, instructorId: 'i', type: 'module', limit: 5, offset: 10 });
  const { text, params } = db.calls[1];
  assert.match(text, /WHERE published = @published AND instructor_id = @instructorId AND type = @type/);
  assert.deepEqual(params, { limit: 5, offset: 10, published: true, instructorId: 'i', type: 'module' });
});

test('insert, update and remove use parameters and return the stored course', async () => {
  const db = fakeDb();
  const repo = createSqlCourseRepository(db);
  const input = {
    title: 'Web basics',
    description: 'd',
    type: 'module',
    credits: 10,
    passMark: 60,
    published: true,
  };

  assert.equal((await repo.insert({ ...input, instructorId: 'instructor-omar' })).id, 7);
  assert.match(db.calls[0].text, /OUTPUT INSERTED\.id, INSERTED\.title/);

  assert.equal((await repo.update(7, input)).title, 'Web basics');
  assert.equal(db.calls[1].params.id, 7);

  await repo.remove(7);
  assert.deepEqual(db.calls[2].params, { id: 7 });
});
