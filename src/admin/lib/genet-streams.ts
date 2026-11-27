/**
 * Pure logic for ジェネット楽曲一覧's streams (#141, #144) - `genet_stream`,
 * the unit this screen edits and publishes. Kept apart from SetsPage.vue so
 * it can be tested without touching the DOM, the same split every other
 * admin screen's own lib file uses.
 */

/** The 状態 filter of the stream list (#277's decision 3). */
export const STATUS_OPTIONS: readonly { value: string; label: string }[] = [
  { value: 'all', label: 'すべて' },
  { value: 'draft', label: '下書き' },
  { value: 'published', label: '公開中' },
];

export const PLATFORMS = ['youtube', 'tiktok'] as const;
export type Platform = (typeof PLATFORMS)[number];

export const VIDEO_TYPES = ['live', 'video', 'short'] as const;
export type VideoType = (typeof VIDEO_TYPES)[number];

export const SCENE_STYLES = ['play', 'sing', 'bgm', 'talk'] as const;
export type SceneStyle = (typeof SCENE_STYLES)[number];

export const SCENE_STYLE_LABEL: Record<SceneStyle, string> = {
  play: '演奏',
  sing: '歌唱',
  bgm: 'BGM',
  talk: 'トーク',
};

export interface Scene {
  style: string;
  videoId: string;
  startSeconds: number | null;
}

export interface Performance {
  tuneId: number;
  description: string | null;
  scenes: Scene[];
}

/** `present()`'s own shape in `worker/src/admin/genet-streams.ts`. */
export interface GenetStream {
  videoId: string;
  platform: string;
  url: string | null;
  videoType: string;
  title: string;
  shortTitle: string | null;
  publishedAt: string;
  categories: string[];
  keywords: string[];
  status: string;
  memo: string | null;
  createdAt: string;
  updatedAt: string;
  /** The row's version as read, sent back with every write so that one another screen changed meanwhile is refused (#307, lib/editing.ts's `writeBody`). */
  version: number;
  performances: Performance[];
}

/**
 * The PUT/POST body `updateStream`/`createStream`
 * (`worker/src/admin/genet-streams.ts`) reads. A save here is a full replace
 * of `performances` (and each one's `scenes`) - `status` is never part of
 * this body, only `publishStream`/`withdrawStream` change it.
 */
export interface StreamFormFields {
  platform: string;
  url: string | null;
  videoType: string;
  title: string;
  shortTitle: string | null;
  publishedAt: string;
  categories: string[];
  keywords: string[];
  memo: string | null;
  performances: Performance[];
}

export function toFormFields(stream: GenetStream): StreamFormFields {
  return {
    platform: stream.platform,
    url: stream.url,
    videoType: stream.videoType,
    title: stream.title,
    shortTitle: stream.shortTitle,
    publishedAt: stream.publishedAt,
    categories: [...stream.categories],
    keywords: [...stream.keywords],
    memo: stream.memo,
    performances: stream.performances.map((p) => ({ ...p, scenes: p.scenes.map((s) => ({ ...s })) })),
  };
}

export function emptyFormFields(): StreamFormFields {
  return {
    platform: 'youtube',
    url: null,
    videoType: 'live',
    title: '',
    shortTitle: null,
    publishedAt: '',
    categories: [],
    keywords: [],
    memo: null,
    performances: [],
  };
}

export type StreamFieldSection =
  | 'videoId'
  | 'title'
  | 'shortTitle'
  | 'platform'
  | 'url'
  | 'videoType'
  | 'publishedAt'
  | 'categories'
  | 'keywords'
  | 'memo'
  | 'performances';

export interface StreamFieldError {
  section: StreamFieldSection;
  performanceIndex: number | null;
  sceneIndex: number | null;
}

const SCENE_MARKER = /^performances\[(\d+)\]\.scenes\[(\d+)\]/;
const PERFORMANCE_MARKER = /^performances\[(\d+)\]/;

const BARE_MARKERS: [RegExp, StreamFieldSection][] = [
  [/^videoId /, 'videoId'],
  [/^stream \S+ already exists/, 'videoId'],
  [/^title /, 'title'],
  [/^shortTitle /, 'shortTitle'],
  [/^platform /, 'platform'],
  [/^url /, 'url'],
  [/^videoType /, 'videoType'],
  [/^publishedAt /, 'publishedAt'],
  [/^categories /, 'categories'],
  [/^keywords /, 'keywords'],
  [/^memo /, 'memo'],
  [/^performances? /, 'performances'],
  [/^each performance /, 'performances'],
  [/^each scene /, 'performances'],
  [/^scene /, 'performances'],
  [/^unknown tuneIds/, 'performances'],
];

/** Which field (and which performance/scene row within it, if any) a save's 400 is about, read from its detail (`errorDetail`), or null when it names none this screen tracks. */
export function fieldForSaveError(detail: string): StreamFieldError | null {
  const sceneMatch = SCENE_MARKER.exec(detail);

  if (sceneMatch !== null) {
    return { section: 'performances', performanceIndex: Number(sceneMatch[1]), sceneIndex: Number(sceneMatch[2]) };
  }

  const performanceMatch = PERFORMANCE_MARKER.exec(detail);

  if (performanceMatch !== null) {
    return { section: 'performances', performanceIndex: Number(performanceMatch[1]), sceneIndex: null };
  }

  for (const [pattern, section] of BARE_MARKERS) {
    if (pattern.test(detail)) return { section, performanceIndex: null, sceneIndex: null };
  }

  return null;
}

/** A chip-row's items with one removed, for `categories`/`keywords` - the field itself has no "which index" concept worth naming, only its current list. */
export function withoutItem(items: readonly string[], index: number): string[] {
  return items.filter((_, i) => i !== index);
}

/**
 * Where each performance goes when a stream's performances, as the tune IDs
 * `before`, are replaced by `after` read from the worker: old index to new
 * index, the k-th performance of a tune to the k-th performance of the same
 * tune. A performance whose tune `after` no longer holds that many times has
 * no entry.
 *
 * The open tunes are cached by index, so a new order - saved by someone else
 * between this page's 保存 and its reload - would otherwise hand one tune's
 * typed fields to another's 保存.
 */
export function performanceMoves(before: readonly number[], after: readonly number[]): Map<number, number> {
  const freeByTune = new Map<number, number[]>();

  after.forEach((tuneId, index) => {
    freeByTune.set(tuneId, [...(freeByTune.get(tuneId) ?? []), index]);
  });

  const moves = new Map<number, number>();

  before.forEach((tuneId, index) => {
    const next = freeByTune.get(tuneId)?.shift();

    if (next !== undefined) moves.set(index, next);
  });

  return moves;
}

/** `byIndex` with each key moved by `moves`; keys `moves` has no entry for are left out. */
export function moveEntries<T>(byIndex: ReadonlyMap<number, T>, moves: ReadonlyMap<number, number>): Map<number, T> {
  const moved = new Map<number, T>();

  for (const [index, value] of byIndex) {
    const next = moves.get(index);

    if (next !== undefined) moved.set(next, value);
  }

  return moved;
}

/**
 * `GET /admin/api/genet/streams`'s query string for a status and a title
 * substring - '' when neither narrows anything. The same shape as あしあと's
 * `footprintsQuery`.
 */
export function streamsQuery(status: string, q: string): string {
  const params = new URLSearchParams();

  if (status !== 'all') params.set('status', status);
  if (q.trim() !== '') params.set('q', q.trim());

  const query = params.toString();

  return query === '' ? '' : `?${query}`;
}

/**
 * Whether a stream that becomes `status`, titled `title`, drops out of the
 * list under the status filter `filter` and the title filter `q`, which
 * closes its editor and the tunes open in it. `q` is matched as the worker's
 * `LIKE` matches it: a substring, ignoring the case of ASCII letters alone.
 */
export function leavesFilter(filter: string, status: string, q = '', title = ''): boolean {
  if (filter !== 'all' && filter !== status) return true;

  const needle = q.trim();
  const asciiLower = (text: string) => text.replace(/[A-Z]/g, (c) => c.toLowerCase());

  return needle !== '' && !asciiLower(title).includes(asciiLower(needle));
}

/**
 * `byIndex` with entry `index` taken out and every later one moved up by one,
 * for the open tunes when a performance is taken off: each entry must stay
 * with the performance it belongs to, not with the index it had.
 */
export function withoutIndex<T>(byIndex: ReadonlyMap<number, T>, index: number): Map<number, T> {
  const reindexed = new Map<number, T>();

  for (const [i, value] of byIndex) {
    if (i < index) reindexed.set(i, value);
    else if (i > index) reindexed.set(i - 1, value);
  }

  return reindexed;
}

/**
 * Whether the open tune needs a read sent for it: it is open, nothing read of
 * it is in `loaded`, and no read is on its way for its index in `reading`. A
 * read names the index it was sent for, so a performance taken off above it,
 * or a new order of them, drops its answer, and the tune would otherwise stay
 * open with nothing read (#284).
 */
export function openTuneUnread(
  openIndex: number | null,
  loaded: ReadonlyMap<number, unknown>,
  reading: ReadonlyMap<number, unknown>,
): boolean {
  return openIndex !== null && !loaded.has(openIndex) && !reading.has(openIndex);
}

/**
 * `rows` with `kept` put back at `index` when they no longer hold it, as
 * lib/footprints.ts's `withKeptRow` keeps an event. A stream whose 保存 was
 * refused stays in the list with its editor open, even when another screen's
 * change took it out of the filter: closing it would throw away what is
 * typed into it and its tunes (#304).
 */
export function withKeptStream(rows: GenetStream[], kept: GenetStream, index: number): GenetStream[] {
  if (rows.some((s) => s.videoId === kept.videoId)) return rows;

  const at = Math.min(Math.max(index, 0), rows.length);

  return [...rows.slice(0, at), kept, ...rows.slice(at)];
}
