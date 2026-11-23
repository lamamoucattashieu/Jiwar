import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_DIFF_LINES, diffLines, diffSnapshots, sameSnapshot } from '../src/workspace/codeDiff.js';

const kinds = (lines) => lines.map((l) => `${l.type[0]}:${l.text}`);

test('unchanged lines are context; a changed line is a deletion then an addition', () => {
  const lines = diffLines('a\nb\nc', 'a\nB\nc');
  assert.deepEqual(kinds(lines), ['c:a', 'd:b', 'a:B', 'c:c']);
  assert.deepEqual(
    lines.map((l) => [l.oldNo, l.newNo]),
    [
      [1, 1],
      [2, null],
      [null, 2],
      [3, 3],
    ],
  );
});

test('insertions and deletions keep the longest common part as context', () => {
  assert.deepEqual(kinds(diffLines('<h1>Hi</h1>', '<main>\n<h1>Hi</h1>\n</main>')), [
    'a:<main>',
    'c:<h1>Hi</h1>',
    'a:</main>',
  ]);
  assert.deepEqual(kinds(diffLines('x\ny\nz', 'x\nz')), ['c:x', 'd:y', 'c:z']);
});

test('empty files and Windows line endings', () => {
  assert.deepEqual(diffLines('', ''), []);
  assert.deepEqual(kinds(diffLines('', 'new')), ['a:new']);
  assert.deepEqual(kinds(diffLines('a\r\nb', 'a\nb')), ['c:a', 'c:b']);
});

test('very long files are shown as replaced instead of running a huge comparison', () => {
  const big = Array.from({ length: MAX_DIFF_LINES + 1 }, (_, i) => `line ${i}`).join('\n');
  const lines = diffLines(big, 'short');
  assert.equal(lines.filter((l) => l.type === 'del').length, MAX_DIFF_LINES + 1);
  assert.equal(lines.at(-1).type, 'add');
});

test('snapshots: added, removed and modified files, sorted, unchanged ones left out', () => {
  const before = [
    { path: 'index.html', content: '<h1>Hi</h1>' },
    { path: 'old.css', content: 'a{}' },
    { path: 'same.js', content: 'x' },
  ];
  const after = [
    { path: 'index.html', content: '<h1>Hello</h1>' },
    { path: 'app.js', content: 'go()' },
    { path: 'same.js', content: 'x' },
  ];
  const diff = diffSnapshots(before, after);
  assert.deepEqual(
    diff.map((f) => [f.path, f.status, f.additions, f.deletions]),
    [
      ['app.js', 'added', 1, 0],
      ['index.html', 'modified', 1, 1],
      ['old.css', 'removed', 0, 1],
    ],
  );
  assert.equal(sameSnapshot(before, [...before].reverse()), true);
  assert.equal(sameSnapshot(before, after), false);
});
