/**
 * Pure logic for ジェネット楽曲一覧's tunes (#141, #144) - `genet_tune`,
 * shared across every stream that performs it. Kept apart from SetsPage.vue
 * so it can be tested without touching the DOM, the same split every other
 * admin screen's own lib file uses.
 */

/** `present()`'s own shape in `worker/src/admin/genet-tunes.ts`. */
export interface AttributePerson {
  personId: number;
  creditedAs: string | null;
  note: string | null;
}

export interface Attribute {
  name: string | null;
  text: string | null;
  people: AttributePerson[];
}

export interface TuneVideo {
  videoId: string;
  title: string;
  startSeconds: number | null;
  description: string | null;
}

export interface TuneScore {
  url: string;
  title: string;
}

export interface GenetTune {
  tuneId: number;
  title: string;
  originalTitle: string | null;
  subtunes: string[];
  attributes: Attribute[];
  videos: TuneVideo[];
  scores: TuneScore[];
  memo: string | null;
}

/**
 * The PUT/POST body `updateTune`/`createTune` (`worker/src/admin/genet-tunes.ts`)
 * reads. A save here is a full replace of `attributes`/`videos`/`scores` -
 * every element is deleted and reinserted wholesale, the same shape
 * footprints.ts gives an event's own members and sources.
 */
export interface TuneFormFields {
  title: string;
  originalTitle: string | null;
  subtunes: string[];
  attributes: Attribute[];
  videos: TuneVideo[];
  scores: TuneScore[];
  memo: string | null;
}

export function toFormFields(tune: GenetTune): TuneFormFields {
  return {
    title: tune.title,
    originalTitle: tune.originalTitle,
    subtunes: [...tune.subtunes],
    attributes: tune.attributes.map((a) => ({ ...a, people: a.people.map((p) => ({ ...p })) })),
    videos: tune.videos.map((v) => ({ ...v })),
    scores: tune.scores.map((s) => ({ ...s })),
    memo: tune.memo,
  };
}

export function emptyFormFields(): TuneFormFields {
  return { title: '', originalTitle: null, subtunes: [], attributes: [], videos: [], scores: [], memo: null };
}

/**
 * Where in the form a tune save's 400 is about - a section alone
 * (`attributes must be an array`), or a section and the row's own index
 * (`` attributes[2].name must not be empty ``). Index-bearing patterns are
 * checked first: `attributes[2] needs...` would also match the bare
 * `attributes` pattern below it if checked in the other order.
 */
export type TuneFieldSection = 'title' | 'originalTitle' | 'subtunes' | 'memo' | 'attributes' | 'videos' | 'scores';

export interface TuneFieldError {
  section: TuneFieldSection;
  index: number | null;
}

const INDEXED_MARKERS: [RegExp, TuneFieldSection][] = [
  [/^attributes\[(\d+)\]/, 'attributes'],
  [/^videos\[(\d+)\]/, 'videos'],
  [/^scores\[(\d+)\]/, 'scores'],
];

const BARE_MARKERS: [RegExp, TuneFieldSection][] = [
  [/^title /, 'title'],
  [/^originalTitle /, 'originalTitle'],
  [/^subtunes /, 'subtunes'],
  [/^memo /, 'memo'],
  [/^attributes? /, 'attributes'],
  [/^videos? /, 'videos'],
  [/^video /, 'videos'],
  [/^scores? /, 'scores'],
  [/^score /, 'scores'],
  [/^each attribute /, 'attributes'],
  [/^each video /, 'videos'],
  [/^each score /, 'scores'],
];

/** Which field (and which row within it, if any) a save's 400 message is about, or null when it names none this screen tracks. */
export function fieldForSaveError(message: string): TuneFieldError | null {
  for (const [pattern, section] of INDEXED_MARKERS) {
    const match = pattern.exec(message);

    if (match !== null) return { section, index: Number(match[1]) };
  }

  for (const [pattern, section] of BARE_MARKERS) {
    if (pattern.test(message)) return { section, index: null };
  }

  return null;
}

// The 17 names streaming.yml's own history actually uses (#141's design
// comment) - a starting point, not a closed list: attrNameOptions below adds
// whatever this browser has learned, and the row's own current value if it
// is neither.
export const ATTR_NAMES = [
  '作曲',
  '作詞',
  '編曲',
  '作詞・作曲',
  '作曲・作詞',
  '作曲・編曲',
  '作詞・作曲・編曲',
  '原詩',
  '日本語訳詞',
  '原曲作曲',
  '弦管編曲',
  'ピアノ編曲',
  'ワルツ編曲',
  '代表作詞',
  'ソネット',
  '企画',
  '音楽',
] as const;

const NAME_STORE = 'kemov-admin-attr-names';

/** Every attribute name this browser has learned beyond ATTR_NAMES - empty when storage is unavailable or empty, never an error. */
export function learnedNames(): string[] {
  try {
    const raw = localStorage.getItem(NAME_STORE);
    const list: unknown = raw === null ? [] : JSON.parse(raw);

    return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/** Remembers `name` in this browser, for `learnedNames` to offer next time. Storage that refuses the write costs nothing beyond that: the name written just now still saves, it only will not be offered again later. */
export function learnName(name: string): void {
  const trimmed = name.trim();

  if (trimmed === '' || (ATTR_NAMES as readonly string[]).includes(trimmed) || learnedNames().includes(trimmed)) return;

  try {
    localStorage.setItem(NAME_STORE, JSON.stringify([...learnedNames(), trimmed]));
  } catch {
    // 覚えられない環境では、この回だけの名前になる。
  }
}

/** The choices one attribute row's name <select> offers, beyond the screen's own sentinel options (「名前なし」「その他…」), which SetsPage.vue adds itself. */
export function attrNameOptions(current: string | null): string[] {
  const names: string[] = [...ATTR_NAMES, ...learnedNames()];

  if (current !== null && current !== '' && !names.includes(current)) names.unshift(current);

  return names;
}
