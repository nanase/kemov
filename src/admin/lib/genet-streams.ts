/**
 * Pure logic for ジェネット楽曲一覧's streams (#141, #144) - `genet_stream`,
 * the unit this screen edits and publishes. Kept apart from SetsPage.vue so
 * it can be tested without touching the DOM, the same split every other
 * admin screen's own lib file uses.
 */

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
  talk: '話',
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

/** Which field (and which performance/scene row within it, if any) a save's 400 message is about, or null when it names none this screen tracks. */
export function fieldForSaveError(message: string): StreamFieldError | null {
  const sceneMatch = SCENE_MARKER.exec(message);

  if (sceneMatch !== null) {
    return { section: 'performances', performanceIndex: Number(sceneMatch[1]), sceneIndex: Number(sceneMatch[2]) };
  }

  const performanceMatch = PERFORMANCE_MARKER.exec(message);

  if (performanceMatch !== null) {
    return { section: 'performances', performanceIndex: Number(performanceMatch[1]), sceneIndex: null };
  }

  for (const [pattern, section] of BARE_MARKERS) {
    if (pattern.test(message)) return { section, performanceIndex: null, sceneIndex: null };
  }

  return null;
}

/** A chip-row's items with one removed, for `categories`/`keywords` - the field itself has no "which index" concept worth naming, only its current list. */
export function withoutItem(items: readonly string[], index: number): string[] {
  return items.filter((_, i) => i !== index);
}
