import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitPayout } from '../src/payments/money.js';
import { createMockPaymentProvider } from '../src/payments/mockPaymentProvider.js';
import { allowedActions, nextStatus } from '../src/projects/projectRules.js';
import { createLearningClient } from '../src/learningClient.js';
import { createOutboxDispatcher } from '../src/outbox.js';
import { createMemoryProjectStore } from '../src/projects/projectStore.memory.js';

test('the trainee gets 80% and Jiwar 20%, in exact cents', () => {
  assert.deepEqual(splitPayout(150), { traineeJd: 120, jiwarJd: 30 });
  assert.deepEqual(splitPayout(220.55), { traineeJd: 176.44, jiwarJd: 44.11 });
  const { traineeJd, jiwarJd } = splitPayout(99.99);
  assert.equal(Math.round((traineeJd + jiwarJd) * 100), 9999, 'no cent is created or lost');
});

test('the mock payment provider succeeds, or declines when asked', async () => {
  const pay = createMockPaymentProvider();
  assert.match((await pay.charge({ amountJd: 30, reference: 'p1-setup' })).paymentRef, /^mock-p1-setup-/);
  await assert.rejects(
    pay.charge({ amountJd: 30, reference: 'x', simulateDecline: true }),
    (e) => e.status === 402,
  );
  await assert.rejects(pay.charge({ amountJd: 0, reference: 'x' }), (e) => e.status === 400);
});

test('the workflow offers each role only its own next steps', () => {
  const project = {
    companyId: 'company-zaytoun',
    traineeId: 'trainee-ahmad',
    status: 'in_review',
    revisionsUsed: 0,
    maxRevisions: 2,
  };
  const user = (id, ...roles) => ({ id, roles });
  assert.deepEqual(allowedActions(user('company-zaytoun', 'company'), project), [
    'request_revision',
    'approve',
  ]);
  assert.deepEqual(allowedActions(user('trainee-ahmad', 'trainee'), project), []);
  assert.deepEqual(allowedActions(user('admin-rania', 'admin'), { ...project, status: 'requested' }), [
    'quote',
    'cancel',
  ]);
  assert.throws(
    () => nextStatus('submit', user('trainee-ahmad', 'trainee'), project),
    /cannot submit a project that is in review/,
  );
  assert.equal(
    nextStatus('submit', user('trainee-ahmad', 'trainee'), { ...project, status: 'in_progress' }),
    'in_review',
  );
  assert.equal(allowedActions(null, project).length, 0);
});

// A fake fetch and clock for the learning client.
function fakeFetch(responses) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    const next = responses.shift();
    if (next instanceof Error) throw next;
    return { ok: next.status < 400, status: next.status, json: async () => next.body ?? {} };
  };
  fn.calls = calls;
  return fn;
}

test('the learning client sends the internal key and returns the answer', async () => {
  const fetchImpl = fakeFetch([
    { status: 200, body: { level: 1 } },
    { status: 201, body: { amount: 5 } },
  ]);
  const client = createLearningClient({ baseUrl: 'http://learning', internalKey: 'k', fetchImpl });
  assert.equal((await client.eligibility('trainee-ahmad')).level, 1);
  assert.equal(fetchImpl.calls[0].url, 'http://learning/internal/trainees/trainee-ahmad/eligibility');
  assert.equal(fetchImpl.calls[0].init.headers['X-Internal-Key'], 'k');
  assert.equal((await client.awardProjectCredit({ projectId: 1 })).amount, 5);
  assert.equal(fetchImpl.calls[1].init.method, 'POST');
});

test('a 4xx from learning is a real answer, not an outage', async () => {
  const client = createLearningClient({
    baseUrl: 'http://l',
    fetchImpl: fakeFetch([{ status: 400, body: { error: 'not a trainee' } }, { status: 404 }]),
  });
  await assert.rejects(client.eligibility('x'), (e) => e.status === 400 && /not a trainee/.test(e.message));
  await assert.rejects(client.eligibility('x'), (e) => e.status === 404);
  assert.deepEqual(client.state(), { failures: 0, open: false });
});

test('after 3 failures the circuit opens: calls fail fast for 30 s, then try again', async () => {
  let clock = 1000;
  const down = new Error('ECONNREFUSED');
  const fetchImpl = fakeFetch([down, { status: 503 }, down, { status: 200, body: { level: 2 } }]);
  const client = createLearningClient({ baseUrl: 'http://l', fetchImpl, now: () => clock });

  for (let i = 0; i < 3; i += 1) await assert.rejects(client.eligibility('t'), (e) => e.status === 503);
  assert.equal(client.state().open, true);
  await assert.rejects(client.eligibility('t'), /not reachable/);
  assert.equal(fetchImpl.calls.length, 3, 'no call while the circuit is open');

  clock += 30_001;
  assert.equal((await client.eligibility('t')).level, 2);
  assert.deepEqual(client.state(), { failures: 0, open: false });
});

test('a slow learning service times out instead of hanging', async () => {
  // A request that would answer only after 5 s. Its timer also keeps the test
  // process alive: Node does not wait for AbortSignal.timeout's own timer.
  const fetchImpl = (url, { signal }) =>
    new Promise((resolve, reject) => {
      const slow = setTimeout(resolve, 5000);
      signal.addEventListener('abort', () => {
        clearTimeout(slow);
        reject(signal.reason);
      });
    });
  const client = createLearningClient({ baseUrl: 'http://l', fetchImpl, timeoutMs: 20 });
  await assert.rejects(client.eligibility('t'), (e) => e.status === 503);
});

test('outbox: unknown events and failures are recorded and retried later', async () => {
  const store = createMemoryProjectStore();
  await store.enqueue('unknown', {});
  const lines = [];
  const outbox = createOutboxDispatcher({ store, handlers: {}, log: (l) => lines.push(l) });
  assert.equal(await outbox.drain(), 0);
  assert.match(lines[0], /No handler for unknown/);
  assert.equal((await store.pendingEvents(10, 8))[0].attempts, 1);
});

test('the memory store rolls back a failed transaction and refuses a second invoice of a kind', async () => {
  const store = createMemoryProjectStore();
  await assert.rejects(
    store.transaction(async (tx) => {
      await tx.insertProject({ companyId: 'c', title: 't', status: 'requested' });
      throw new Error('boom');
    }),
  );
  assert.equal((await store.listProjects({})).length, 0);
  await store.addInvoice({ projectId: 1, kind: 'setup_fee', amountJd: 1, paymentRef: 'r' });
  await assert.rejects(store.addInvoice({ projectId: 1, kind: 'setup_fee', amountJd: 1, paymentRef: 'r' }));
});
