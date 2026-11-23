// The brief-to-quote assistant and the trained matching model.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createMemoryProjectStore } from '../src/projects/projectStore.memory.js';
import { createAi, createClaudeProvider, mockProvider, providerFromConfig } from '../src/ai/aiClient.js';
import { MODEL_INFO, featuresFor, matchScore } from '../src/matching/matchScore.js';
import { briefTask } from '../src/ai/briefToQuote.js';
import { createSqlProjectStore } from '../src/projects/projectStore.sql.js';

const learning = {
  async eligibility(traineeId) {
    const table = {
      'trainee-ahmad': {
        level: 2,
        permitValid: true,
        projectsPaused: false,
        credits: 90,
        projectsCompleted: 3,
      },
      'trainee-mariam': {
        level: 1,
        permitValid: true,
        projectsPaused: false,
        credits: 35,
        projectsCompleted: 0,
      },
      'trainee-yousef': {
        level: 0,
        permitValid: false,
        projectsPaused: false,
        credits: 10,
        projectsCompleted: 0,
      },
    };
    return { traineeId, name: traineeId, ...table[traineeId] };
  },
  awardProjectCredit: async () => ({}),
};

function setup() {
  const store = createMemoryProjectStore();
  const app = createApp(loadConfig({}), {
    log: () => {},
    repos: { projects: store },
    learning,
    ai: createAi({ provider: mockProvider }),
  });
  const as = (user) => ({
    get: (url) => request(app).get(url).set('X-Demo-User', user),
    post: (url, body = {}) => request(app).post(url).set('X-Demo-User', user).send(body),
  });
  return { app, as, store };
}

const brief = (as, description) => as('company-zaytoun').post('/ai/brief', { description });

test('a description becomes a draft brief with a suggested pack, in English or Arabic', async () => {
  const { as } = setup();
  const bot = await brief(as, 'Customers should send their bakery orders on WhatsApp and get the menu.');
  assert.equal(bot.status, 200);
  assert.deepEqual([bot.body.packCode, bot.body.source], ['whatsapp-bot', 'mock']);
  assert.match(bot.body.reason, /whatsapp/i);

  const site = await brief(as, 'نريد موقع بسيط يعرض صور الكعك ومواعيد العمل');
  assert.equal(site.body.packCode, 'website');

  const custom = await brief(as, 'A loyalty card app for our regular customers with points.');
  assert.equal(custom.body.packCode, null, 'custom: an admin will quote it');
});

test('only businesses use the brief assistant, with a real description', async () => {
  const { as } = setup();
  assert.equal(
    (await as('trainee-ahmad').post('/ai/brief', { description: 'A website for my shop please' })).status,
    403,
  );
  assert.equal((await brief(as, 'short')).status, 400);
});

test('the brief prompt lists the packs and the description', () => {
  const text = briefTask.prompt({
    description: 'Orders on WhatsApp',
    packs: [{ code: 'website', name: 'Site', summary: 's', priceJd: 150, deliveryDays: 7 }],
  });
  assert.match(text, /website: Site\. s \(150 JD, 7 days\)/);
  assert.match(text, /Orders on WhatsApp$/);
});

test('the projects service has its own AI client: Claude with a key, offline rules without', async () => {
  assert.equal(providerFromConfig(loadConfig({})).name, 'mock');
  assert.equal(providerFromConfig(loadConfig({ ANTHROPIC_API_KEY: 'sk-test' })).name, 'claude');
  const client = {
    beta: {
      messages: { parse: async () => ({ stop_reason: 'end_turn', parsed_output: { packCode: 'website' } }) },
    },
  };
  assert.deepEqual(await createClaudeProvider({ client }).run(briefTask, { description: 'x', packs: [] }), {
    packCode: 'website',
  });
  const { as } = setup();
  const status = (await as('company-zaytoun').get('/ai/status')).body;
  assert.deepEqual([status.mode, status.matchingModel.version], ['mock', 'matching-v1']);
});

test('the matching model rewards experience and penalises a full workload', () => {
  const base = {
    eligibility: { level: 1, credits: 40, projectsCompleted: 1 },
    stats: { avgRating: 4, activeProjects: 0 },
    levelRequired: 1,
    preferred: false,
  };
  const score = (over) => matchScore(featuresFor({ ...base, ...over }));
  assert.ok(score({}) > 0 && score({}) < 1);
  assert.ok(score({ eligibility: { level: 2, credits: 120, projectsCompleted: 4 } }) > score({}));
  assert.ok(score({ stats: { avgRating: 4, activeProjects: 3 } }) < score({}));
  assert.ok(score({ preferred: true }) > score({}));
  assert.ok(MODEL_INFO.auc >= 0.75, 'the committed model met the training threshold');
  assert.deepEqual(
    featuresFor({ eligibility: { level: 0 }, stats: {}, levelRequired: 1, preferred: false }),
    {
      level_margin: 0,
      credits: 0,
      projects_completed: 0,
      avg_rating: 0,
      active_projects: 0,
      preferred: 0,
    },
  );
});

test('candidates come back ranked: eligible first, then by match score', async () => {
  const { as } = setup();
  const { body: p } = await as('company-zaytoun').post('/projects', {
    packCode: 'website',
    title: 'Bakery site',
    goals: 'Show our cakes and opening hours.',
  });
  await as('company-zaytoun').post(`/projects/${p.id}/accept`);
  const items = (await as('admin-rania').get(`/projects/${p.id}/candidates`)).body.items;
  assert.deepEqual(
    items.map((c) => c.traineeId),
    ['trainee-ahmad', 'trainee-mariam', 'trainee-yousef'],
  );
  assert.ok(items[0].score > items[1].score);
  assert.equal(items[2].eligible, false);
  assert.ok(items.every((c) => Number.isInteger(c.score) && c.score >= 0 && c.score <= 100));
});

test('trainee stats: average rating of approved work and current workload', async () => {
  const store = createMemoryProjectStore();
  const make = async (status, rating) => {
    const p = await store.insertProject({ companyId: 'c', title: 't', status: 'requested' });
    await store.updateProject(p.id, { status, traineeId: 'trainee-ahmad', rating });
  };
  await make('approved', 5);
  await make('approved', 3);
  await make('in_progress', null);
  assert.deepEqual(await store.traineeStats('trainee-ahmad'), { avgRating: 4, activeProjects: 1 });
  assert.deepEqual(await store.traineeStats('nobody'), { avgRating: 0, activeProjects: 0 });

  const sql = createSqlProjectStore({ query: async () => [{ avg_rating: 4.5, active: 2 }] });
  assert.deepEqual(await sql.traineeStats('t'), { avgRating: 4.5, activeProjects: 2 });
  const none = createSqlProjectStore({ query: async () => [{ avg_rating: null, active: null }] });
  assert.deepEqual(await none.traineeStats('t'), { avgRating: 0, activeProjects: 0 });
});

test('the AI client caches, limits each user and turns outages into a clear 503', async () => {
  let calls = 0;
  let clock = 0;
  const provider = { name: 'p', run: async (task, input) => (calls++, task.mock(input)) };
  const ai = createAi({ provider, now: () => clock, limitPerHour: 1 });
  const input = { description: 'A website for our bakery with photos', packs: [] };
  await ai.run(briefTask, input, 'c');
  assert.equal((await ai.run(briefTask, input, 'c')).cached, true);
  await assert.rejects(
    ai.run(briefTask, { ...input, description: 'Another site for us' }, 'c'),
    (e) => e.status === 429,
  );
  clock += 25 * 60 * 60 * 1000;
  await ai.run(briefTask, input, 'c');
  assert.equal(calls, 2, 'expired after a day');

  const lines = [];
  const down = createAi({
    provider: { name: 'p', run: () => Promise.reject(new Error('down')) },
    log: (l) => lines.push(l),
  });
  await assert.rejects(down.run(briefTask, input, 'c'), (e) => e.status === 503);
  assert.equal(lines.length, 1);

  const refusing = createClaudeProvider({
    client: { beta: { messages: { parse: async () => ({ stop_reason: 'refusal', parsed_output: null }) } } },
  });
  await assert.rejects(refusing.run(briefTask, input), (e) => e.status === 422);
  const unreadable = createClaudeProvider({
    client: { beta: { messages: { parse: async () => ({ stop_reason: 'end_turn', parsed_output: null }) } } },
  });
  await assert.rejects(unreadable.run(briefTask, input), (e) => e.status === 502);
  const many = createAi({ provider: mockProvider, limitPerHour: 1000 });
  for (let i = 0; i <= 200; i += 1)
    await many.run(briefTask, { ...input, description: `Shop number ${i} site` }, 'c');
});

test('English keywords match whole words only: "maintain" is not "ai"', async () => {
  const { as } = setup();
  const res = await brief(as, 'We need someone to maintain our booking system for the clinic.');
  assert.equal(res.body.packCode, null);
  const ai = await brief(as, 'An AI assistant that drafts replies to customer messages.');
  assert.equal(ai.body.packCode, 'ai-assistant');
});

test('completed but unrated projects count as a neutral rating, not as zero', () => {
  const f = (projectsCompleted, avgRating) =>
    featuresFor({
      eligibility: { level: 1, credits: 35, projectsCompleted },
      stats: { avgRating, activeProjects: 0 },
      levelRequired: 1,
      preferred: false,
    });
  assert.equal(f(1, 0).avg_rating, 3.5);
  assert.equal(f(0, 0).avg_rating, 0);
  assert.equal(f(2, 4.5).avg_rating, 4.5);
  assert.ok(matchScore(f(1, 0)) > matchScore(f(0, 0)), 'one finished project beats none');
});
