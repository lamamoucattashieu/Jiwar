import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryCreditStore } from '../src/credits/creditStore.memory.js';
import { createOutboxDispatcher, MAX_ATTEMPTS } from '../src/credits/events.js';

test('an event that fails stays in the outbox and is retried on a later drain', async () => {
  const store = createMemoryCreditStore();
  await store.enqueue('thing.happened', { n: 1 });
  let calls = 0;
  const handlers = {
    'thing.happened': async () => {
      calls += 1;
      if (calls === 1) throw new Error('learning DB paused');
    },
  };
  const lines = [];
  const outbox = createOutboxDispatcher({ store, handlers, log: (l) => lines.push(l) });

  assert.equal(await outbox.drain(), 0, 'first attempt fails, and is not retried in the same drain');
  assert.equal(calls, 1);
  assert.match(lines[0], /learning DB paused/);
  assert.equal(await outbox.drain(), 1, 'the next drain delivers it');
  assert.equal(await outbox.drain(), 0, 'and it is not delivered again');
});

test('an event is given up after MAX_ATTEMPTS failures', async () => {
  const store = createMemoryCreditStore();
  await store.enqueue('always.fails', {});
  const outbox = createOutboxDispatcher({
    store,
    handlers: {
      'always.fails': async () => {
        throw new Error('nope');
      },
    },
  });
  for (let i = 0; i < MAX_ATTEMPTS + 2; i += 1) await outbox.drain();
  assert.deepEqual(await store.pendingEvents(10, MAX_ATTEMPTS), []);
});

test('an event with no handler is recorded as failed, not lost silently', async () => {
  const store = createMemoryCreditStore();
  await store.enqueue('unknown.event', {});
  const lines = [];
  await createOutboxDispatcher({ store, handlers: {}, log: (l) => lines.push(l) }).drain();
  assert.match(lines[0], /No handler for unknown.event/);
});

test('events added by a handler are delivered in the same drain', async () => {
  const store = createMemoryCreditStore();
  await store.enqueue('first', {});
  const seen = [];
  const handlers = {
    first: async () => {
      seen.push('first');
      await store.enqueue('second', {});
    },
    second: async () => seen.push('second'),
  };
  assert.equal(await createOutboxDispatcher({ store, handlers }).drain(), 2);
  assert.deepEqual(seen, ['first', 'second']);
});

test('a notification from a redelivered event is stored once', async () => {
  const store = createMemoryCreditStore();
  const note = { userId: 'trainee-yousef', kind: 'levelReached', data: { level: 1 }, eventId: 7 };
  await store.addNotification(note);
  await store.addNotification(note);
  assert.equal((await store.listNotifications('trainee-yousef')).length, 1);
});

test('a failed transaction leaves nothing behind', async () => {
  const store = createMemoryCreditStore();
  await assert.rejects(
    store.transaction(async (tx) => {
      await tx.appendLedger({ traineeId: 'trainee-yousef', amount: 10, sourceType: 'course', reason: 'x' });
      await tx.enqueue('credits.changed', {});
      throw new Error('boom');
    }),
  );
  assert.equal(await store.creditTotal('trainee-yousef'), 0);
  assert.deepEqual(await store.pendingEvents(10, MAX_ATTEMPTS), []);
});
