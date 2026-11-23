// Retrieval for the tutor (the "R" in RAG): finds the course notes most
// relevant to a question with TF-IDF and cosine similarity. Pure functions,
// no vector database (the brief allows no other databases), and it works for
// Arabic and English because it splits on Unicode letters.
const STOP_WORDS = new Set(
  'a an and are as at be but by do does for from how i in is it of on or the to what when where which who why with you your في من على عن ما هل كيف لماذا هو هي أن إن ثم أو'.split(
    ' ',
  ),
);

export function tokenize(text) {
  return (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter(
    (w) => w.length > 1 && !STOP_WORDS.has(w),
  );
}

/** True when the text is mostly Arabic letters. */
export const isArabic = (text) =>
  /[؀-ۿ]/.test(text) && (text.match(/[؀-ۿ]/g) ?? []).length * 2 > (text.match(/\p{L}/gu) ?? []).length;

/** The `k` notes most similar to the question (score > 0), best first. */
export function retrieve(question, notes, k = 3) {
  const docs = notes.map((n) => tokenize(`${n.title} ${n.title} ${n.body}`)); // titles count double
  const df = new Map();
  for (const words of docs) for (const w of new Set(words)) df.set(w, (df.get(w) ?? 0) + 1);
  const idf = (w) => Math.log((notes.length + 1) / ((df.get(w) ?? 0) + 1)) + 1;

  const vector = (words) => {
    const v = new Map();
    for (const w of words) v.set(w, (v.get(w) ?? 0) + 1);
    for (const [w, n] of v) v.set(w, n * idf(w));
    return v;
  };
  const norm = (v) => Math.sqrt([...v.values()].reduce((s, x) => s + x * x, 0)) || 1;

  const q = vector(tokenize(question));
  const qNorm = norm(q);
  return notes
    .map((note, i) => {
      const d = vector(docs[i]);
      let dot = 0;
      for (const [w, x] of q) dot += x * (d.get(w) ?? 0);
      return { note, score: dot / (qNorm * norm(d)) };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}
