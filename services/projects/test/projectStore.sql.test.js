// Checks the SQL adapter's queries and row mapping with a fake executor.
// Real SQL Server runs them through docker compose and the deployed smoke test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSqlProjectStore } from '../src/projects/projectStore.sql.js';

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

const projectRow = {
  id: 1,
  company_id: 'company-zaytoun',
  pack_code: 'website',
  title: 'Site',
  goals: 'g',
  features: '',
  examples: '',
  deadline: new Date('2026-12-01T00:00:00Z'),
  status: 'quoted',
  level_required: 1,
  setup_fee_jd: '30.00',
  price_jd: '150.00',
  preferred_trainee_id: null,
  trainee_id: null,
  revisions_used: 0,
  max_revisions: 2,
  rating: null,
  testimonial: null,
  testimonial_public: 0,
  created_at: 'c',
  updated_at: 'u',
};

test('projects map to camelCase with numbers for money and ISO days for dates', async () => {
  const store = createSqlProjectStore(fakeDb(() => [projectRow]));
  const p = await store.findProject(1);
  assert.deepEqual(
    [p.priceJd, p.setupFeeJd, p.deadline, p.testimonialPublic],
    [150, 30, '2026-12-01', false],
  );
  assert.equal((await store.insertProject({})).id, 1);
  assert.equal(await createSqlProjectStore(fakeDb()).findProject(9), null);
});

test('list only adds the filters it is given', async () => {
  const db = fakeDb(() => [projectRow]);
  const store = createSqlProjectStore(db);
  await store.listProjects({});
  assert.doesNotMatch(db.calls[0].text, /WHERE/);
  await store.listProjects({ companyId: 'c', status: 'approved' });
  assert.match(db.calls[1].text, /WHERE company_id = @companyId AND status = @status/);
});

test('updateProject turns only known fields into columns, always as parameters', async () => {
  const db = fakeDb(() => [projectRow]);
  await createSqlProjectStore(db).updateProject(1, {
    status: 'accepted',
    traineeId: 't',
    hacker: 'x; DROP TABLE',
  });
  const { text, params } = db.calls[0];
  assert.match(text, /SET status = @status, trainee_id = @traineeId, updated_at/);
  assert.doesNotMatch(text, /hacker|DROP/);
  assert.deepEqual(params, { status: 'accepted', traineeId: 't', id: 1 });
});

test('packs, events, messages, invoices and payouts', async () => {
  const db = fakeDb((text) => {
    if (text.includes('FROM packs'))
      return [
        {
          code: 'website',
          name: 'W',
          summary: 's',
          delivery_days: 7,
          setup_fee_jd: '30.00',
          price_jd: '150.00',
          level_required: 1,
        },
      ];
    if (text.includes('FROM project_events'))
      return [
        {
          id: 1,
          action: 'quote',
          from_status: 'requested',
          to_status: 'quoted',
          actor_id: 'a',
          note: null,
          created_at: 'c',
        },
      ];
    if (text.includes('messages')) return [{ id: 3, author_id: 'a', body: 'hi', created_at: 'c' }];
    if (text.includes('FROM invoices'))
      return [
        {
          id: 1,
          project_id: 1,
          title: 'Site',
          kind: 'setup_fee',
          amount_jd: '30.00',
          payment_ref: 'r',
          paid_at: 'p',
        },
      ];
    if (text.includes('FROM payouts o'))
      return [
        {
          id: 1,
          project_id: 1,
          title: 'Site',
          trainee_id: 't',
          amount_jd: '120.00',
          jiwar_share_jd: '30.00',
          created_at: 'c',
        },
      ];
    if (text.includes('FROM payouts'))
      return [{ amount_jd: '120.00', jiwar_share_jd: '30.00', created_at: 'c' }];
    return [];
  });
  const store = createSqlProjectStore(db);
  assert.equal((await store.listPacks())[0].priceJd, 150);
  assert.equal((await store.findPack('website')).levelRequired, 1);
  await store.addEvent({ projectId: 1, action: 'quote', from: 'requested', to: 'quoted', actorId: 'a' });
  assert.equal(db.calls.at(-1).params.note, null);
  assert.equal((await store.listEvents(1))[0].to, 'quoted');
  assert.equal((await store.addMessage({ projectId: 1, authorId: 'a', body: 'hi' })).body, 'hi');
  assert.equal((await store.listMessages(1))[0].authorId, 'a');
  await store.addInvoice({});
  assert.equal((await store.listInvoices({ projectId: 1, companyId: 'c' }))[0].amountJd, 30);
  assert.match(db.calls.at(-1).text, /i.project_id = @projectId AND p.company_id = @companyId/);
  await store.listInvoices({});
  await store.addPayout({});
  assert.equal((await store.findPayout(1)).amountJd, 120);
  assert.equal((await store.listPayouts({ traineeId: 't' }))[0].jiwarShareJd, 30);
  await store.listPayouts({});
  assert.doesNotMatch(db.calls.at(-1).text, /WHERE/);
});

test('outbox round-trips JSON and counts failed attempts', async () => {
  const db = fakeDb((text) =>
    text.startsWith('SELECT')
      ? [{ id: '4', event_type: 'project.approved', payload: '{"projectId":1}' }]
      : [],
  );
  const store = createSqlProjectStore(db);
  await store.enqueue('project.approved', { projectId: 1 });
  assert.deepEqual(await store.pendingEvents(20, 8), [
    { id: 4, type: 'project.approved', payload: { projectId: 1 } },
  ]);
  await store.markEventProcessed(4);
  await store.markEventFailed(4, 'down');
  assert.match(db.calls.at(-1).text, /attempts = attempts \+ 1/);
  assert.equal(await store.transaction(async () => 'ok'), 'ok');
  assert.equal(await createSqlProjectStore(fakeDb()).findPack('x'), null);
  assert.equal(await createSqlProjectStore(fakeDb()).findPayout(1), null);
});
