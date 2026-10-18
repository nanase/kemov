/**
 * Looking words up in the site's own text: the matching rules every page that
 * searches shares, so that a word finds the same things wherever it is typed.
 *
 * A term is folded before it is compared - full width to half, upper case to
 * lower, katakana to hiragana - and a few kana that are written either way
 * (ヴァ and バ, ィ and イ) match each other. Several words are several terms,
 * and a text has to hold every one of them.
 */

/** Kana folded to hiragana, full-width folded via NFKC, case folded. */
export function normalize(value: string): string {
  let text = value;

  try {
    text = text.normalize('NFKC');
  } catch {
    // Not every runtime implements String#normalize; matching without it is still better than throwing.
  }

  return text.toLowerCase().replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

const KANA_PAIRS: [string, string][] = [
  ['バ', 'ヴァ'],
  ['ビ', 'ヴィ'],
  ['ブ', 'ヴ'],
  ['ベ', 'ヴェ'],
  ['ボ', 'ヴォ'],
  ['ア', 'ァ'],
  ['イ', 'ィ'],
  ['ウ', 'ゥ'],
  ['エ', 'ェ'],
  ['オ', 'ォ'],
  ['ツ', 'ッ'],
  ['イ', 'ウィ'],
];

/** Every normalized spelling that reads as the same kana, grouped - イ・ィ・ウィ end up one group, since both pairs share イ. */
function buildAlternateGroups(): Map<string, string[]> {
  const groups = new Map<string, string[]>();

  for (const [a, b] of KANA_PAIRS) {
    const na = normalize(a);
    const nb = normalize(b);
    const group = groups.get(na) ?? groups.get(nb) ?? [];

    for (const k of [na, nb]) if (!group.includes(k)) group.push(k);
    for (const k of group) groups.set(k, group);
  }

  return groups;
}

const ALTERNATE_GROUPS = buildAlternateGroups();

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** One search term's own pattern, matching every kana-variant spelling of it. */
function termPattern(term: string): string {
  const normalized = normalize(term);
  let pattern = '';
  let i = 0;

  while (i < normalized.length) {
    const two = normalized.slice(i, i + 2);
    const one = normalized.charAt(i);
    let group = ALTERNATE_GROUPS.get(two);
    let length = 2;

    if (!group) {
      group = ALTERNATE_GROUPS.get(one);
      length = 1;
    }

    if (group) {
      const alternatives = [...group].sort((a, b) => b.length - a.length).map(escapeRegExp);

      pattern += `(?:${alternatives.join('|')})`;
      i += length;
    } else {
      pattern += escapeRegExp(one);
      i += 1;
    }
  }

  return pattern;
}

export interface SearchTerm {
  /** Matches once, anywhere. */
  test(normalizedText: string): boolean;
  /** The index of the first match in `normalizedText`, or -1. */
  indexOf(normalizedText: string): number;
  /** Every `[start, end)` span this term matches in `normalizedText` - for marking hits, not just finding them. */
  matchRanges(normalizedText: string): [number, number][];
}

function makeTerm(word: string): SearchTerm {
  const pattern = termPattern(word);
  const re = new RegExp(pattern);
  const globalRe = new RegExp(pattern, 'g');

  return {
    test: (text) => re.test(text),
    indexOf: (text) => {
      const m = re.exec(text);

      return m ? m.index : -1;
    },
    matchRanges: (text) => {
      globalRe.lastIndex = 0;
      const ranges: [number, number][] = [];
      let m: RegExpExecArray | null;

      while ((m = globalRe.exec(text))) {
        if (m[0].length === 0) {
          globalRe.lastIndex += 1;
          continue;
        }
        ranges.push([m.index, m.index + m[0].length]);
      }

      return ranges;
    },
  };
}

/**
 * `text` with every span any of `terms` matches wrapped in `<mark>` - HTML
 * output, already escaped. `normalize(text)` must have the same length as
 * `text` for the ranges to line up (true for this data: kana-folding and
 * case-folding never change a string's length); a query where that fails
 * falls back to plain escaped text rather than mismarking it.
 */
export function highlightRanges(text: string, terms: readonly SearchTerm[], esc: (s: string) => string): string {
  if (terms.length === 0) return esc(text);

  const normalized = normalize(text);

  if (normalized.length !== text.length) return esc(text);

  const marked = new Array<boolean>(text.length).fill(false);

  for (const term of terms) {
    for (const [start, end] of term.matchRanges(normalized)) {
      for (let i = start; i < end; i++) marked[i] = true;
    }
  }

  // A match's own start/end is a UTF-16 code unit offset, and an emoji right
  // against one (nothing else about it matched) can leave only half of its
  // surrogate pair marked - keep every pair fully marked or fully unmarked,
  // or <mark> would open or close in the middle of one character.
  for (let i = 0; i < text.length - 1; i++) {
    const high = text.charCodeAt(i);
    const low = text.charCodeAt(i + 1);

    if (high >= 0xd800 && high <= 0xdbff && low >= 0xdc00 && low <= 0xdfff) marked[i + 1] = marked[i];
  }

  if (!marked.includes(true)) return esc(text);

  let html = '';
  let open = false;

  for (let i = 0; i < text.length; i++) {
    if (marked[i] && !open) {
      html += '<mark>';
      open = true;
    } else if (!marked[i] && open) {
      html += '</mark>';
      open = false;
    }

    html += esc(text.charAt(i));
  }

  if (open) html += '</mark>';

  return html;
}

/** `query` split on whitespace into one term per word - an empty query is zero terms, which every text passes. */
export function parseQuery(query: string): SearchTerm[] {
  return query
    .split(/[\s\u3000]+/)
    .filter((w) => w !== '')
    .map(makeTerm);
}

/** `text` with `&<>"'` escaped, for HTML built as a string. */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
