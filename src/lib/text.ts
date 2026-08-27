// Small, dependency-free text utilities used by the natural-language parser and
// the Data Dragon name resolver. Kept pure so they are trivial to unit test.

/** Lowercase, strip punctuation/diacritics-ish noise, collapse whitespace. */
export function normalize(input: string): string {
  return input
    .toLowerCase()
    .replace(/['".,:!?/\\()\-_+%]/g, " ")
    .replace(/&/g, " and ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenize(input: string): string[] {
  const n = normalize(input);
  return n.length ? n.split(" ") : [];
}

/** Levenshtein edit distance. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = new Array<number>(b.length + 1);
  const curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
  }
  return prev[b.length];
}

/** Sorensen-Dice bigram similarity in [0,1]. Good for short-name fuzzy matching. */
export function diceCoefficient(a: string, b: string): number {
  const x = normalize(a).replace(/\s+/g, "");
  const y = normalize(b).replace(/\s+/g, "");
  if (x === y) return 1;
  if (x.length < 2 || y.length < 2) return 0;
  const bigrams = new Map<string, number>();
  for (let i = 0; i < x.length - 1; i++) {
    const bg = x.slice(i, i + 2);
    bigrams.set(bg, (bigrams.get(bg) ?? 0) + 1);
  }
  let intersection = 0;
  for (let i = 0; i < y.length - 1; i++) {
    const bg = y.slice(i, i + 2);
    const count = bigrams.get(bg) ?? 0;
    if (count > 0) {
      bigrams.set(bg, count - 1);
      intersection++;
    }
  }
  return (2 * intersection) / (x.length - 1 + (y.length - 1));
}

/** Combined similarity: max of dice and a length-normalized edit-distance score. */
export function similarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return 0;
  const dice = diceCoefficient(na, nb);
  const maxLen = Math.max(na.length, nb.length);
  const edit = maxLen === 0 ? 1 : 1 - levenshtein(na, nb) / maxLen;
  return Math.max(dice, edit);
}

/** Contiguous word n-grams (1..maxN) from a token list, longest first. */
export function ngrams(tokens: string[], maxN: number): string[] {
  const out: string[] = [];
  const upper = Math.min(maxN, tokens.length);
  for (let n = upper; n >= 1; n--) {
    for (let i = 0; i + n <= tokens.length; i++) {
      out.push(tokens.slice(i, i + n).join(" "));
    }
  }
  return out;
}
