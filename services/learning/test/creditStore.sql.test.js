// Checks the SQL adapter's queries and row mapping with a fake executor.
// The real SQL Server runs these through docker compose and the deployed smoke test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSqlCreditStore } from '../src/credits/creditStore.sql.js';

function fakeDb(respond = () => []) {
  const calls = [];
  const db = {
    calls,
    query: async (text, params) => {
      calls.push({ text, params });
      return respond(text, params);
    },
    transaction: async (fn) => fn(db),
  };
  return db;
}

const resultRow = {
  id: 3,
  course_id: 1,
  trainee_id: 'trainee-yousef',
  grade: 75,
  status: 'pending_verification',
  graded_by: 'instructor-omar',
  graded_at: 't',
  reviewed_by: null,
  reviewed_at: null,
  reject_reason: null,
};

test('results map to camelCase and list only adds the filters it is given', async () => {
  const db = fakeDb(() => [resultRow]);
  const store = createSqlCreditStore(db);
  assert.equal((await store.findResult(3)).traineeId, 'trainee-yousef');
  await store.listResults({});
  assert.doesNotMatch(db.calls[1].text, /WHERE/);
  await store.listResults({ status: 'verified', traineeId: 'trainee-yousef' });
  assert.match(db.calls[2].text, /WHERE status = @status AND trainee_id = @traineeId/);
  assert.equal((await store.updateResult(3, { status: 'verified', reviewedBy: 'admin-rania' })).id, 3);
  assert.equal(db.calls[3].params.rejectReason, null);
});

test('a duplicate result becomes a 409 conflict; other errors pass through', async () => {
  const dup = Object.assign(new Error('dup'), { number: 2601 });
  await assert.rejects(
    createSqlCreditStore(fakeDb(() => Promise.reject(dup))).insertResult({}),
    (err) => err.status === 409,
  );
  const other = new Error('down');
  await assert.rejects(createSqlCreditStore(fakeDb(() => Promise.reject(other))).insertResult({}), /down/);
  assert.equal((await createSqlCreditStore(fakeDb(() => [resultRow])).insertResult({})).id, 3);
});

test('ledger, totals and the append without OUTPUT (the table has a trigger)', async () => {
  const entry = {
    id: 1,
    trainee_id: 't',
    amount: 10,
    source_type: 'course',
    source_id: 3,
    reason: 'r',
    created_by: 'a',
    created_at: 'c',
  };
  const db = fakeDb((text) => {
    if (text.includes('SUM(amount)')) return [{ total: 25 }];
    if (text.includes('COUNT(*)')) return [{ n: 2 }];
    return [entry];
  });
  const store = createSqlCreditStore(db);
  assert.equal((await store.appendLedger({})).sourceType, 'course');
  assert.doesNotMatch(db.calls[0].text, /OUTPUT/);
  assert.equal((await store.listLedger('t'))[0].amount, 10);
  assert.equal(await store.creditTotal('t'), 25);
  assert.equal(await store.countProjectCredits('t'), 2);
  assert.equal(await store.hasActiveResult(1, 't'), true);
});

test('permits turn SQL dates into ISO days; profiles turn bits into booleans', async () => {
  const permit = {
    trainee_id: 't',
    status: 'verified',
    expires_on: new Date('2026-12-10T00:00:00Z'),
    updated_by: 'a',
    updated_at: 'u',
  };
  const store = createSqlCreditStore(
    fakeDb((text) =>
      text.includes('work_permits') ? [permit] : [{ trainee_id: 't', level: 1, projects_paused: 1 }],
    ),
  );
  assert.equal((await store.getPermit('t')).expiresOn, '2026-12-10');
  assert.equal((await store.savePermit({ traineeId: 't' })).status, 'verified');
  assert.deepEqual(await store.getProfile('t'), { traineeId: 't', level: 1, projectsPaused: true });
  assert.equal((await store.saveProfile({ traineeId: 't' })).level, 1);
  assert.equal(await createSqlCreditStore(fakeDb()).getPermit('x'), null);
  assert.equal(await createSqlCreditStore(fakeDb()).getProfile('x'), null);
});

test('notifications: JSON data, duplicates from a retried event ignored, read only by the owner', async () => {
  const dup = Object.assign(new Error('dup'), { number: 2601 });
  await createSqlCreditStore(fakeDb(() => Promise.reject(dup))).addNotification({ userId: 'u', kind: 'k' });
  await assert.rejects(
    createSqlCreditStore(fakeDb(() => Promise.reject(new Error('down')))).addNotification({
      userId: 'u',
      kind: 'k',
    }),
  );

  const db = fakeDb((text) =>
    text.startsWith('SELECT')
      ? [{ id: 1, user_id: 'u', kind: 'k', data: '{"a":1}', created_at: 'c', read_at: null }]
      : [],
  );
  const store = createSqlCreditStore(db);
  await store.addNotification({ userId: 'u', kind: 'k', data: { a: 1 } });
  assert.equal(db.calls[0].params.data, '{"a":1}');
  assert.deepEqual((await store.listNotifications('u'))[0].data, { a: 1 });
  assert.equal(await store.markNotificationRead(1, 'u'), false);
});

test('outbox: payloads round-trip as JSON, ids become numbers, failures count attempts', async () => {
  const db = fakeDb((text) =>
    text.startsWith('SELECT')
      ? [{ id: '12', event_type: 'credits.changed', payload: '{"traineeId":"t"}' }]
      : [],
  );
  const store = createSqlCreditStore(db);
  await store.enqueue('credits.changed', { traineeId: 't' });
  assert.equal(db.calls[0].params.payload, '{"traineeId":"t"}');
  assert.deepEqual(await store.pendingEvents(20, 5), [
    { id: 12, type: 'credits.changed', payload: { traineeId: 't' } },
  ]);
  await store.markEventProcessed(12);
  await store.markEventFailed(12, 'boom');
  assert.match(db.calls.at(-1).text, /attempts = attempts \+ 1/);
  assert.equal(await store.transaction(async (tx) => tx === store || 'bound'), 'bound');
});
