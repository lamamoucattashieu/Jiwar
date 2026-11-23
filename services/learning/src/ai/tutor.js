// Bilingual AI tutor (story #22): answers a trainee's question from the
// course's own notes (retrieval-augmented generation), in the language the
// question was asked in, and says so when the notes do not cover it.
import { z } from 'zod';
import { forbidden, notFound } from '../http/errors.js';
import { parse } from '../http/validate.js';
import { isArabic, retrieve } from './retrieval.js';

const questionInput = z.object({ question: z.string().trim().min(3).max(500) });
const idParam = z.coerce.number().int().positive();

const schema = z.object({
  answer: z.string().describe('The answer, in the language of the question'),
  usedSources: z.array(z.string()).describe('Titles of the notes the answer relies on'),
});

function mock({ question, sources }) {
  const top = sources[0];
  const excerpt = top.body.length > 320 ? `${top.body.slice(0, 320)}…` : top.body;
  return {
    answer: isArabic(question)
      ? `من ملاحظات الدورة «${top.title}»: ${excerpt}`
      : `From the course notes "${top.title}": ${excerpt}`,
    usedSources: [top.title],
  };
}

export const tutorTask = {
  name: 'tutor-v1',
  schema,
  system:
    'You are a patient tutor at Jiwar, a coding school for young Palestinian refugees in Jordan. ' +
    'Answer only from the course notes provided. If they do not contain the answer, say so and suggest asking the instructor. ' +
    'Answer in the same language as the question (Arabic or English), in simple words, in at most 150 words. ' +
    'List the titles of the notes you used.',
  prompt: ({ courseTitle, question, sources }) =>
    [
      `Course: ${courseTitle}`,
      'Course notes:',
      ...sources.map((s, i) => `[${i + 1}] ${s.title}\n${s.body}`),
      '',
      `Question: ${question}`,
    ].join('\n'),
  mock,
};

const NOT_COVERED = {
  en: 'The course notes do not cover this yet. Please ask your instructor.',
  ar: 'ملاحظات الدورة لا تغطي هذا بعد. يرجى سؤال المدرّب.',
};

export function createTutorService({ notes, courses, ai }) {
  return {
    async ask(user, rawCourseId, body) {
      const course = await courses.findById(parse(idParam, rawCourseId));
      if (!course || !course.published) throw notFound('Course not found');
      if (!user.roles.some((r) => ['trainee', 'instructor', 'admin'].includes(r))) throw forbidden();
      const { question } = parse(questionInput, body);

      const found = retrieve(question, await notes.listNotes(course.id));
      // Nothing relevant: answer without calling the model at all.
      if (found.length === 0) {
        return { answer: NOT_COVERED[isArabic(question) ? 'ar' : 'en'], usedSources: [], source: 'none' };
      }
      const sources = found.map((f) => ({ title: f.note.title, body: f.note.body }));
      return ai.run(tutorTask, { courseTitle: course.title, question, sources }, user.id);
    },
  };
}
