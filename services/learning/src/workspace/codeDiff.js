// Line diff between two snapshots of a repository, for pull request review.
// Pure functions. The line diff is the classic longest-common-subsequence
// method: lines in the LCS are unchanged context, the rest were removed from
// the old file or added in the new one.
export const MAX_DIFF_LINES = 1500; // above this, show the file as replaced

const splitLines = (text) => (text === '' ? [] : text.replace(/\r\n/g, '\n').split('\n'));

/** Line-by-line changes between two texts, with old and new line numbers. */
export function diffLines(oldText, newText) {
  const a = splitLines(oldText);
  const b = splitLines(newText);

  if (a.length > MAX_DIFF_LINES || b.length > MAX_DIFF_LINES) {
    return [
      ...a.map((text, i) => ({ type: 'del', oldNo: i + 1, newNo: null, text })),
      ...b.map((text, i) => ({ type: 'add', oldNo: null, newNo: i + 1, text })),
    ];
  }

  // lcs[i][j] = length of the longest common subsequence of a[i..] and b[j..]
  const lcs = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const out = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      out.push({ type: 'context', oldNo: i + 1, newNo: j + 1, text: a[i] });
      i += 1;
      j += 1;
    } else if (i < a.length && (j === b.length || lcs[i + 1][j] >= lcs[i][j + 1])) {
      // Removed lines first, then added ones, as in a GitHub diff.
      out.push({ type: 'del', oldNo: i + 1, newNo: null, text: a[i] });
      i += 1;
    } else {
      out.push({ type: 'add', oldNo: null, newNo: j + 1, text: b[j] });
      j += 1;
    }
  }
  return out;
}

/** Files added, removed or modified between two snapshots ([{ path, content }]), by path. */
export function diffSnapshots(oldFiles, newFiles) {
  const before = new Map(oldFiles.map((f) => [f.path, f.content]));
  const after = new Map(newFiles.map((f) => [f.path, f.content]));
  const paths = [...new Set([...before.keys(), ...after.keys()])].sort();

  return paths
    .filter((path) => before.get(path) !== after.get(path))
    .map((path) => {
      const status = !before.has(path) ? 'added' : !after.has(path) ? 'removed' : 'modified';
      const lines = diffLines(before.get(path) ?? '', after.get(path) ?? '');
      return {
        path,
        status,
        additions: lines.filter((l) => l.type === 'add').length,
        deletions: lines.filter((l) => l.type === 'del').length,
        lines,
      };
    });
}

/** True when two snapshots hold exactly the same files. */
export const sameSnapshot = (a, b) => diffSnapshots(a, b).length === 0;
