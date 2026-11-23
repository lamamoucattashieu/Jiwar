// AI draft review of a pull request (story #21). The instructor sees a
// suggested grade and feedback, edits it, and decides; nothing is graded here.
import { z } from 'zod';

// The diff sent to the model is capped to keep each call cheap; the model is
// told which files were left out, so it does not review what it cannot see.
export const MAX_DIFF_CHARS = 40_000;

const schema = z.object({
  suggestedGrade: z.number().describe('A whole number from 0 to 100'),
  summary: z.string().describe('Two or three sentences on the submission as a whole'),
  strengths: z.array(z.string()).describe('Up to 3 specific things done well'),
  improvements: z.array(z.string()).describe('Up to 3 specific, actionable changes'),
});

/** The diff as text for the prompt, file by file, until the cap; returns what was left out. */
export function diffAsText(diff) {
  let text = '';
  const omitted = [];
  for (const file of diff) {
    const block = [
      `--- ${file.path} (${file.status}, +${file.additions} -${file.deletions})`,
      ...file.lines.map((l) => `${l.type === 'add' ? '+' : l.type === 'del' ? '-' : ' '} ${l.text}`),
      '',
    ].join('\n');
    if (text.length + block.length > MAX_DIFF_CHARS) omitted.push(file.path);
    else text += block;
  }
  return { text, omitted };
}

const clampGrade = (n) => Math.max(0, Math.min(100, Math.round(n)));

// Offline rules for the mock provider: a rough, explainable first draft.
function mock({ diff, passMark }) {
  const added = diff.reduce((n, f) => n + f.additions, 0);
  const files = diff.length;
  const hasHtml = diff.some((f) => f.path.endsWith('.html'));
  const hasStyles = diff.some((f) => f.path.endsWith('.css'));
  const grade = clampGrade(
    passMark + Math.min(20, added) + (hasStyles ? 5 : 0) - (files === 0 ? passMark : 0),
  );
  return {
    suggestedGrade: grade,
    summary: `The submission changes ${files} file(s) with ${added} added line(s). This draft is based on the size and kind of the changes only; please read the code before grading.`,
    strengths: [
      ...(hasHtml ? ['The page structure is in HTML that a browser can render.'] : []),
      ...(hasStyles ? ['Styles are kept in a separate CSS file.'] : []),
      ...(added > 0 ? ['Work was committed on a branch and submitted through a pull request.'] : []),
    ].slice(0, 3),
    improvements: [
      ...(hasStyles ? [] : ['Move visual styling into a CSS file.']),
      'Check that the page reads well on a 360 px phone screen.',
      'Write a commit message that says why, not only what.',
    ].slice(0, 3),
  };
}

export const gradingDraftTask = {
  name: 'grading-draft-v1',
  schema,
  system:
    'You are a teaching assistant at Jiwar, a coding school for young Palestinian refugees in Jordan. ' +
    'You draft feedback on a trainee’s pull request for their instructor, who makes the final decision. ' +
    'Be specific and kind, refer to files and lines, and judge against the course and its pass mark. ' +
    'Give at most 3 strengths and 3 improvements. Write in English.',
  prompt: ({ courseTitle, courseDescription, passMark, prTitle, diff }) => {
    const { text, omitted } = diffAsText(diff);
    return [
      `Course: ${courseTitle}`,
      `About the course: ${courseDescription || '(no description)'}`,
      `Pass mark: ${passMark}%`,
      `Pull request: ${prTitle}`,
      omitted.length ? `Not shown for length (do not review them): ${omitted.join(', ')}` : '',
      '',
      'Changes (+ added, - removed):',
      text || '(no changes)',
    ].join('\n');
  },
  mock,
  clampGrade,
};

/** The draft as a review comment, labelled as an AI suggestion. */
export function draftAsComment(draft) {
  return [
    `AI suggestion (the instructor decides): grade ${clampGrade(draft.suggestedGrade)}%.`,
    draft.summary,
    draft.strengths.length ? `Strengths: ${draft.strengths.slice(0, 3).join(' · ')}` : '',
    draft.improvements.length ? `To improve: ${draft.improvements.slice(0, 3).join(' · ')}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}
