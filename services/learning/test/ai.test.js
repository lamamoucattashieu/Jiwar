// The AI layer: the Claude provider (against a fake SDK client), cache and rate
// limit, retrieval, the tutor and the AI pull request review.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import {
  AI_MODEL,
  createAi,
  createClaudeProvider,
  mockProvider,
  providerFromConfig,
} from '../src/ai/aiClient.js';
import { isArabic, retrieve, tokenize } from '../src/ai/retrieval.js';
import { MAX_DIFF_CHARS, diffAsText, draftAsComment, gradingDraftTask } from '../src/ai/gradingDraft.js';
import { createMemoryCourseRepository } from '../src/courses/courseRepository.memory.js';
import { createMemoryNoteRepository } from '../src/ai/noteRepository.js';
import { HttpError } from '../src/http/errors.js';
import { z } from 'zod';

const echoTask = {
  name: 'echo',
  system: 'sys',
  schema: z.object({ text: z.string() }),
  prompt: (input) => `say ${input.text}`,
  mock: (input) => ({ text: input.text }),
};

// A stand-in for the Anthropic SDK client that records the request.
function fakeAnthropic(response) {
  const calls = [];
  return {
    calls,
    beta: {
      messages: {
        parse: async (params) => {
          calls.push(params);
          if (response instanceof Error) throw response;
          return response;
        },
      },
    },
  };
}

test('the Claude provider asks for low effort, structured output and server-side fallbacks', async () => {
  const client = fakeAnthropic({ stop_reason: 'end_turn', parsed_output: { text: 'hi' } });
  const out = await createClaudeProvider({ client }).run(echoTask, { text: 'hi' });
  assert.deepEqual(out, { text: 'hi' });
  const [params] = client.calls;
  assert.equal(params.model, AI_MODEL);
  assert.equal(params.output_config.effort, 'low');
  assert.equal(params.output_config.format.type, 'json_schema');
  assert.deepEqual([params.fallbacks, params.betas], ['default', ['server-side-fallback-2026-07-01']]);
  assert.deepEqual(params.messages, [{ role: 'user', content: 'say hi' }]);
  assert.equal(params.system, 'sys');
});

test('a refusal or an unreadable answer becomes a clear error', async () => {
  const refused = createClaudeProvider({
    client: fakeAnthropic({ stop_reason: 'refusal', parsed_output: null }),
  });
  await assert.rejects(refused.run(echoTask, { text: 'x' }), (e) => e.status === 422);
  const empty = createClaudeProvider({
    client: fakeAnthropic({ stop_reason: 'end_turn', parsed_output: null }),
  });
  await assert.rejects(empty.run(echoTask, { text: 'x' }), (e) => e.status === 502);
});

test('without a key the product uses the offline rules', () => {
  assert.equal(providerFromConfig(loadConfig({})).name, 'mock');
  assert.equal(providerFromConfig(loadConfig({ ANTHROPIC_API_KEY: 'sk-test' })).name, 'claude');
});

test('answers are cached, so repeating a question costs nothing', async () => {
  let calls = 0;
  const provider = { name: 'counting', run: async (task, input) => (calls++, task.mock(input)) };
  const ai = createAi({ provider });
  const first = await ai.run(echoTask, { text: 'a' }, 'u1');
  const second = await ai.run(echoTask, { text: 'a' }, 'u2');
  assert.deepEqual([first.cached, second.cached, second.source, calls], [false, true, 'counting', 1]);
  await ai.run(echoTask, { text: 'b' }, 'u1');
  assert.equal(calls, 2);
});

test('the cache expires after a day', async () => {
  let clock = 0;
  let calls = 0;
  const provider = { name: 'p', run: async (task, input) => (calls++, task.mock(input)) };
  const ai = createAi({ provider, now: () => clock });
  await ai.run(echoTask, { text: 'a' }, 'u');
  clock += 25 * 60 * 60 * 1000;
  await ai.run(echoTask, { text: 'a' }, 'u');
  assert.equal(calls, 2);
});

test('the cache keeps at most 200 answers, dropping the oldest', async () => {
  let calls = 0;
  const provider = { name: 'p', run: async (task, input) => (calls++, task.mock(input)) };
  const ai = createAi({ provider, limitPerHour: 1000 });
  for (let i = 0; i <= 200; i += 1) await ai.run(echoTask, { text: `q${i}` }, 'u');
  await ai.run(echoTask, { text: 'q0' }, 'u');
  assert.equal(calls, 202, 'the first answer was evicted');
});

test('each user gets a limited number of calls per hour', async () => {
  let clock = 0;
  const ai = createAi({ provider: mockProvider, now: () => clock, limitPerHour: 2 });
  await ai.run(echoTask, { text: '1' }, 'u');
  await ai.run(echoTask, { text: '2' }, 'u');
  await assert.rejects(ai.run(echoTask, { text: '3' }, 'u'), (e) => e.status === 429);
  assert.equal((await ai.run(echoTask, { text: '1' }, 'u')).cached, true, 'cached answers are still served');
  assert.equal((await ai.run(echoTask, { text: '3' }, 'other')).text, '3', 'other users are not affected');
  clock += 61 * 60 * 1000;
  assert.equal((await ai.run(echoTask, { text: '3' }, 'u')).text, '3', 'the limit resets after an hour');
});

test('a provider outage is a clear 503; deliberate errors pass through', async () => {
  const lines = [];
  const down = createAi({
    provider: { name: 'p', run: async () => Promise.reject(new Error('ECONNRESET')) },
    log: (l) => lines.push(l),
  });
  await assert.rejects(
    down.run(echoTask, { text: 'a' }, 'u'),
    (e) => e.status === 503 && /keeps working/.test(e.message),
  );
  assert.match(lines[0], /ECONNRESET/);
  const refusing = createAi({
    provider: { name: 'p', run: async () => Promise.reject(new HttpError(422, 'declined')) },
  });
  await assert.rejects(refusing.run(echoTask, { text: 'a' }, 'u'), (e) => e.status === 422);
});

test('retrieval: Arabic and English words, best note first', () => {
  assert.deepEqual(tokenize('How do I style the page with CSS?'), ['style', 'page', 'css']);
  assert.deepEqual(tokenize('كيف أصمم الصفحة؟'), ['أصمم', 'الصفحة']);
  assert.equal(isArabic('ما هو الفرع؟'), true);
  assert.equal(isArabic('What is a branch? فرع'), false);

  const notes = [
    { title: 'Styling with CSS', body: 'CSS controls colours, fonts and layout.' },
    { title: 'Branches', body: 'Create a branch for each change.' },
    { title: 'الفروع', body: 'أنشئ فرعًا لكل تغيير' },
  ];
  assert.equal(retrieve('how do I change colours with css', notes)[0].note.title, 'Styling with CSS');
  assert.equal(retrieve('ما هي الفروع', notes)[0].note.title, 'الفروع');
  assert.deepEqual(retrieve('quantum physics', notes), []);
});

test('the diff sent for review is capped, and the model is told what was left out', () => {
  const file = (path, n) => ({
    path,
    status: 'added',
    additions: n,
    deletions: 0,
    lines: Array.from({ length: n }, (_, i) => ({ type: 'add', text: `line ${i}` })),
  });
  const { text, omitted } = diffAsText([file('small.html', 2), file('huge.js', 5000)]);
  assert.match(text, /\+ line 1/);
  assert.ok(text.length <= MAX_DIFF_CHARS);
  assert.deepEqual(omitted, ['huge.js']);
  assert.match(
    gradingDraftTask.prompt({
      courseTitle: 'C',
      courseDescription: '',
      passMark: 60,
      prTitle: 'T',
      diff: [file('huge.js', 5000)],
    }),
    /Not shown for length.*huge\.js/,
  );
  assert.match(
    gradingDraftTask.prompt({
      courseTitle: 'C',
      courseDescription: 'd',
      passMark: 60,
      prTitle: 'T',
      diff: [],
    }),
    /no changes/,
  );
});

test('the grading draft comment is labelled as a suggestion and the grade is clamped', () => {
  const text = draftAsComment({ suggestedGrade: 140, summary: 'Good.', strengths: ['a'], improvements: [] });
  assert.match(text, /^AI suggestion \(the instructor decides\): grade 100%/);
  assert.equal(gradingDraftTask.clampGrade(-3), 0);
  const mock = gradingDraftTask.mock({
    passMark: 60,
    diff: [{ path: 'a.css', additions: 3, deletions: 0, lines: [] }],
  });
  assert.ok(mock.suggestedGrade >= 60 && mock.strengths.length > 0);
});

// The tutor and the AI review through the API, with the offline rules.
function setup() {
  const courses = createMemoryCourseRepository([
    {
      title: 'Web basics',
      description: 'HTML and CSS',
      type: 'module',
      credits: 10,
      passMark: 60,
      published: true,
      instructorId: 'instructor-omar',
      requiredForLevel: 1,
    },
    {
      title: 'Draft',
      description: '',
      type: 'module',
      credits: 1,
      passMark: 60,
      published: false,
      instructorId: 'instructor-omar',
      requiredForLevel: null,
    },
  ]);
  const notes = createMemoryNoteRepository([
    {
      id: 1,
      courseId: 1,
      title: 'Styling with CSS',
      body: 'Put CSS in a separate file and link it in the head.',
    },
    { id: 2, courseId: 1, title: 'النماذج', body: 'النموذج يجمع معلومات من الزائر مثل الاسم ورقم الهاتف.' },
  ]);
  let modelCalls = 0;
  const provider = { name: 'mock', run: async (task, input) => (modelCalls++, task.mock(input)) };
  const app = createApp(loadConfig({}), {
    log: () => {},
    repos: { courses, notes },
    ai: createAi({ provider }),
    today: () => '2026-11-23',
  });
  const as = (user) => ({
    get: (url) => request(app).get(url).set('X-Demo-User', user),
    post: (url, body = {}) => request(app).post(url).set('X-Demo-User', user).send(body),
  });
  return { as, calls: () => modelCalls };
}

test('the tutor answers from the course notes, in the language of the question', async () => {
  const { as } = setup();
  const en = await as('trainee-yousef').post('/courses/1/tutor', { question: 'Where do I put my CSS file?' });
  assert.equal(en.status, 200);
  assert.match(en.body.answer, /^From the course notes "Styling with CSS"/);
  assert.deepEqual([en.body.usedSources, en.body.source], [['Styling with CSS'], 'mock']);

  const ar = await as('trainee-mariam').post('/courses/1/tutor', {
    question: 'كيف أجمع رقم الهاتف في النموذج؟',
  });
  assert.match(ar.body.answer, /^من ملاحظات الدورة «النماذج»/);
});

test('the tutor says when the notes do not cover a question, without calling the model', async () => {
  const { as, calls } = setup();
  const res = await as('trainee-yousef').post('/courses/1/tutor', { question: 'Explain quantum computing' });
  assert.deepEqual([res.body.source, calls()], ['none', 0]);
  const ar = await as('trainee-yousef').post('/courses/1/tutor', { question: 'اشرح الفيزياء الكمية' });
  assert.match(ar.body.answer, /لا تغطي/);
});

test('the tutor checks the course, the role and the question', async () => {
  const { as } = setup();
  assert.equal(
    (await as('trainee-yousef').post('/courses/2/tutor', { question: 'Where is CSS?' })).status,
    404,
  );
  assert.equal(
    (await as('company-zaytoun').post('/courses/1/tutor', { question: 'Where is CSS?' })).status,
    403,
  );
  assert.equal((await as('trainee-yousef').post('/courses/1/tutor', { question: '?' })).status, 400);
  assert.equal((await as('trainee-yousef').get('/ai/status')).body.mode, 'mock');
});

test('the AI review posts a suggestion on the pull request; only reviewers can ask for it', async () => {
  const { as } = setup();
  const t = as('trainee-yousef');
  const { body: repo } = await t.post('/courses/1/workspace');
  await t.post(`/repos/${repo.id}/branches`, { name: 'hw' });
  await t.post(`/repos/${repo.id}/commits`, {
    branch: 'hw',
    message: 'My page',
    files: [
      { path: 'index.html', content: '<h1>Hi</h1>\n' },
      { path: 'style.css', content: 'h1 { color: green; }\n' },
    ],
  });
  const { body: pull } = await t.post(`/repos/${repo.id}/pulls`, { source: 'hw', title: 'Homework' });

  assert.equal((await t.post(`/pulls/${pull.id}/ai-review`)).status, 403);
  const res = await as('instructor-omar').post(`/pulls/${pull.id}/ai-review`);
  assert.equal(res.status, 200);
  assert.ok(res.body.draft.suggestedGrade >= 60 && res.body.draft.suggestedGrade <= 100);
  assert.equal(res.body.comment.authorId, 'ai-assistant');

  const view = (await as('instructor-omar').get(`/pulls/${pull.id}`)).body;
  assert.match(view.comments.at(-1).body, /^AI suggestion/);
  assert.equal(view.status, 'open', 'the AI does not approve or grade');
});

test('the tutor prompt holds the course, numbered notes and the question; long notes are shortened offline', async () => {
  const { tutorTask } = await import('../src/ai/tutor.js');
  const text = tutorTask.prompt({
    courseTitle: 'Web',
    question: 'Why CSS?',
    sources: [{ title: 'CSS', body: 'Styles.' }],
  });
  assert.equal(text, 'Course: Web\nCourse notes:\n[1] CSS\nStyles.\n\nQuestion: Why CSS?');
  const long = tutorTask.mock({ question: 'Why?', sources: [{ title: 'Long', body: 'x'.repeat(400) }] });
  assert.ok(long.answer.endsWith('…'));
});
