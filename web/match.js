// Compares what the recognizer heard with the phrase. Children speak unclearly and recognizers guess,
// so we check every alternative, match word by word, and allow small slips depending on strictness.

export function normalize(s) {
  return s
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^а-яa-z0-9\s-]/g, ' ')
    .replace(/-/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

export function levenshtein(a, b) {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

/** How many letter slips a word may have. Short words must be exact. */
export function allowedSlips(word, strictness) {
  if (word.length <= 3) return 0;
  if (strictness === 'strict') return 0;
  if (strictness === 'soft') return word.length >= 7 ? 2 : 1;
  return word.length >= 6 ? 1 : 0; // normal
}

/**
 * @param {string} target phrase without stress marks
 * @param {string[]} heard recognizer alternatives, best first
 * @param {'soft'|'normal'|'strict'} strictness
 * @returns {{ ok: boolean, near: boolean, words: { word: string, hit: boolean }[], heard: string }}
 */
export function evaluate(target, heard, strictness = 'normal') {
  const want = normalize(target);
  let best = { score: -1, hits: want.map(() => false), heard: heard[0] ?? '' };
  for (const alt of heard) {
    const got = normalize(alt);
    const used = new Set();
    const hits = want.map((w) => {
      const j = got.findIndex((g, k) => !used.has(k) && levenshtein(w, g) <= allowedSlips(w, strictness));
      if (j < 0) return false;
      used.add(j);
      return true;
    });
    const score = hits.filter(Boolean).length;
    if (score > best.score) best = { score, hits, heard: alt };
  }
  const total = want.length;
  const ok = best.score === total;
  return {
    ok,
    near: !ok && best.score >= Math.ceil((total * 2) / 3),
    words: want.map((word, i) => ({ word, hit: best.hits[i] })),
    heard: best.heard,
  };
}
