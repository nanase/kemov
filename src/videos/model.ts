import { RANKING_PERIODS, rankByMetric, type RankingPeriod, type VideoTableRow } from '@/lib/ranking';
import { COUNT_PROPERTIES, getPropertyName, RATE_PROPERTIES, readProperty, type VideoProperty } from '@/type/video';
import type { VideoTable, VideoType } from '@/type/api';

/**
 * What #135's page computes from `GET /api/videos/table` and `GET
 * /api/channels`, kept apart from the components so it can be checked
 * without a DOM.
 *
 * The one rule everything here answers to is #135's own: species and period
 * decide the ranking's denominator and re-rank it when they change; title,
 * length and channel only hide rows, and never touch a rank. Nothing in this
 * file may compute a rank a second way - `universeOf` is the only place a
 * rank is assigned, and every other function here either narrows its output
 * or reads a field off it.
 */

/** `GET /api/videos/table`'s columns, denormalized to one row per video. */
export function rowsFrom(table: VideoTable): VideoTableRow[] {
  const c = table.columns;

  return c.videoId.map((videoId, i) => ({
    videoId,
    channelId: c.channelId[i]!,
    title: c.title[i]!,
    type: c.type[i]!,
    publishedAt: c.publishedAt[i]!,
    durationSeconds: c.durationSeconds[i]!,
    viewCount: c.viewCount[i]!,
    likeCount: c.likeCount[i]!,
    commentCount: c.commentCount[i]!,
    chatMessageCount: c.chatMessageCount[i]!,
    chatUniqueUserCount: c.chatUniqueUserCount[i]!,
    actualStartTime: c.actualStartTime[i]!,
    actualEndTime: c.actualEndTime[i]!,
  }));
}

/** The three kinds a ranking can be narrowed to, in the order #135 places them. */
export const KINDS: readonly { id: VideoType; name: string }[] = [
  { id: 'streaming', name: '配信' },
  { id: 'video', name: '動画' },
  { id: 'shorts', name: 'ショート' },
];

export function kindName(id: VideoType): string {
  return KINDS.find((k) => k.id === id)?.name ?? id;
}

/** The eleven measures, split the way #135 keeps them apart: six counts, five rates. */
export const COUNT_METRICS: readonly { id: VideoProperty; name: string }[] = COUNT_PROPERTIES.map((id) => ({
  id,
  name: getPropertyName(id),
}));
export const RATE_METRICS: readonly { id: VideoProperty; name: string }[] = RATE_PROPERTIES.map((id) => ({
  id,
  name: getPropertyName(id),
}));

export const DEFAULT_METRIC: VideoProperty = 'viewCountPerSecond';
export const DEFAULT_KIND: VideoType = 'streaming';

/** A row's length narrows the list without ever moving a rank. */
export interface LengthBand {
  id: string;
  name: string;
  lo?: number;
  hi?: number;
}

export const LENGTH_BANDS: readonly LengthBand[] = [
  { id: 'any', name: 'すべて' },
  { id: 'a', name: '〜10 分', hi: 600 },
  { id: 'b', name: '10 分〜1 時間', lo: 600, hi: 3600 },
  { id: 'c', name: '1〜3 時間', lo: 3600, hi: 10800 },
  { id: 'd', name: '3 時間〜', lo: 10800 },
];

export function lengthBandOf(id: string): LengthBand {
  return LENGTH_BANDS.find((b) => b.id === id) ?? LENGTH_BANDS[0]!;
}

export function passesLength(durationSeconds: number | null, band: LengthBand): boolean {
  if (band.lo === undefined && band.hi === undefined) return true;
  if (durationSeconds === null) return false;
  if (band.lo !== undefined && durationSeconds < band.lo) return false;
  if (band.hi !== undefined && durationSeconds >= band.hi) return false;

  return true;
}

/** How many rows a page shows before "もっと見る" is pressed again. */
export const PAGE_SIZE = 100;

/** Japan has no daylight saving, so this offset is exact and unconditional. */
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

function jstYear(iso: string): number {
  return new Date(new Date(iso).getTime() + JST_OFFSET_MS).getUTCFullYear();
}

export interface YearOption {
  year: number;
  period: RankingPeriod;
  name: string;
}

/**
 * The years `rows` has a video published in, newest first.
 *
 * Not narrowed by kind: the selector that offers these is independent of the
 * kind chip, the same way it is independent of the metric. Which years exist
 * to choose from is this page's business, not `@/lib/ranking.ts`'s - #151 was
 * built before a second consumer existed, and a year is only ever meaningful
 * with a "which years" list beside it.
 */
export function yearsIn(rows: readonly VideoTableRow[]): YearOption[] {
  const seen = new Set<number>();

  for (const row of rows) seen.add(jstYear(row.publishedAt));

  return [...seen].sort((a, b) => b - a).map((year) => ({ year, period: { year }, name: `${year} 年` }));
}

export function periodLabel(period: RankingPeriod): string {
  if (typeof period === 'object') return `${period.year} 年`;

  switch (period) {
    case 'all':
      return '全期間';
    case 'p365':
      return '1 年';
    case 'p90':
      return '90 日';
    case 'p30':
      return '30 日';
  }
}

/** The four period chips #135 places beside "年で選ぶ", in the order shown. */
export const PERIOD_CHIPS = RANKING_PERIODS;

export function scopeName(kind: VideoType, period: RankingPeriod): string {
  return `${kindName(kind)}・${periodLabel(period)}`;
}

/** One video's place in the ranking that decides #135's denominator. */
export interface UniverseEntry {
  row: VideoTableRow;
  value: number;
  rank: number;
}

export interface Universe {
  entries: readonly UniverseEntry[];
  byId: ReadonlyMap<string, UniverseEntry>;
  /** The ranking's denominator: how many videos this kind, period and metric admit. */
  total: number;
  /** The best value in the ranking, for scaling a share bar. Zero when there are none. */
  top: number;
}

/**
 * The ranking `metric`, `kind` and `period` produce - #135's denominator.
 *
 * The only function in this file that assigns a rank. Everything past this
 * point either narrows `entries` or reads a field off one - narrowing must
 * never call this again with a different `metric`, `kind` or `period`, or it
 * would be building a second, disagreeing ranking rather than hiding rows in
 * this one.
 */
export function universeOf(
  rows: readonly VideoTableRow[],
  metric: VideoProperty,
  kind: VideoType,
  period: RankingPeriod,
  now: Date,
): Universe {
  const byRow = new Map(rows.map((row) => [row.videoId, row]));
  const entries: UniverseEntry[] = rankByMetric(rows, metric, kind, period, now).map((ranked) => ({
    row: byRow.get(ranked.videoId)!,
    value: ranked.value,
    rank: ranked.rank,
  }));

  return {
    entries,
    byId: new Map(entries.map((entry) => [entry.row.videoId, entry])),
    total: entries.length,
    top: entries[0]?.value ?? 0,
  };
}

/**
 * How many of `kind`'s videos exist, and how many of those can supply
 * `metric`, before a period narrows either count further.
 *
 * The top two rungs of the 0-count funnel: `kindStages(...).kind` is who a
 * ranking's "母数が 0" alternatives compare against, and `.metric` is what a
 * ranking loses when it has to leave out a video with no value for the
 * chosen measure - not for lacking a value, but for the archive not
 * recording one for a video that old.
 */
export function kindStages(
  rows: readonly VideoTableRow[],
  metric: VideoProperty,
  kind: VideoType,
): { kind: number; metric: number } {
  let kindCount = 0;
  let metricCount = 0;

  for (const row of rows) {
    if (row.type !== kind) continue;
    kindCount += 1;
    if (readProperty(row, metric) !== undefined) metricCount += 1;
  }

  return { kind: kindCount, metric: metricCount };
}

/**
 * Folds full-width and half-width forms together and katakana onto hiragana,
 * so a search matches a title regardless of which width or kana it was typed
 * in.
 */
function normalizeForSearch(text: string): string {
  const normalized = text.normalize ? text.normalize('NFKC') : text;

  return normalized.toLowerCase().replace(/[\u30a1-\u30f6]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

/** A search phrase split on whitespace, each word required to match (AND, not OR). */
export function searchTokens(query: string): string[] {
  return normalizeForSearch(query)
    .split(/[\s\u3000]+/)
    .filter((token) => token.length > 0);
}

function matchesAllTokens(title: string, tokens: readonly string[]): boolean {
  const normalized = normalizeForSearch(title);

  return tokens.every((token) => normalized.includes(token));
}

/** Where a search phrase's words were found in `title`, merged where they overlap. */
export interface MatchRange {
  start: number;
  end: number;
}

export function matchRanges(title: string, tokens: readonly string[]): MatchRange[] {
  if (tokens.length === 0) return [];

  const normalized = normalizeForSearch(title);

  // Normalizing can change a string's length (full-width to half-width is not
  // always 1:1). When it does, the offsets found in the normalized text would
  // not line up with the original, so nothing is highlighted rather than
  // highlighting the wrong slice.
  if (normalized.length !== title.length) return [];

  const hits: [number, number][] = [];

  for (const token of tokens) {
    let from = 0;
    let at: number;

    while ((at = normalized.indexOf(token, from)) >= 0) {
      hits.push([at, at + token.length]);
      from = at + token.length;
    }
  }

  if (hits.length === 0) return [];

  hits.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [hits[0]!];

  for (let i = 1; i < hits.length; i += 1) {
    const last = merged[merged.length - 1]!;

    if (hits[i]![0] <= last[1]) last[1] = Math.max(last[1], hits[i]![1]);
    else merged.push(hits[i]!);
  }

  return merged.map(([start, end]) => ({ start, end }));
}

/** One run of a title, marked or not - what a template loops over to draw the highlight. */
export interface TitleSegment {
  text: string;
  marked: boolean;
}

/** `title` cut at `matchRanges`' boundaries, alternating marked and unmarked runs. */
export function titleSegments(title: string, tokens: readonly string[]): TitleSegment[] {
  const ranges = matchRanges(title, tokens);

  if (ranges.length === 0) return [{ text: title, marked: false }];

  const segments: TitleSegment[] = [];
  let at = 0;

  for (const range of ranges) {
    if (range.start > at) segments.push({ text: title.slice(at, range.start), marked: false });
    segments.push({ text: title.slice(range.start, range.end), marked: true });
    at = range.end;
  }
  if (at < title.length) segments.push({ text: title.slice(at), marked: false });

  return segments;
}

/** The three filters that narrow a ranking's rows without ever re-ranking it. */
export interface Filters {
  lengthBandId: string;
  channelIds: ReadonlySet<string>;
  query: string;
}

export const NO_FILTERS: Filters = { lengthBandId: 'any', channelIds: new Set(), query: '' };

export interface FilteredView {
  rows: readonly UniverseEntry[];
  /** How many remained after the length band alone. */
  afterLength: number;
  /** How many remained after the length band and the channel selection. */
  afterChannel: number;
}

/**
 * `universe`'s entries, narrowed by `filters` - in the fixed order length,
 * then channel, then title, which is also the order the funnel reports them
 * in. Narrowing a filter can only shrink `rows`; it never changes an entry's
 * `rank`, which stays whatever `universeOf` assigned it.
 */
export function filterUniverse(universe: Universe, filters: Filters): FilteredView {
  const band = lengthBandOf(filters.lengthBandId);
  const tokens = searchTokens(filters.query);
  let afterLength = 0;
  let afterChannel = 0;
  const rows: UniverseEntry[] = [];

  for (const entry of universe.entries) {
    if (!passesLength(entry.row.durationSeconds, band)) continue;
    afterLength += 1;

    if (filters.channelIds.size > 0 && !filters.channelIds.has(entry.row.channelId)) continue;
    afterChannel += 1;

    if (tokens.length > 0 && !matchesAllTokens(entry.row.title, tokens)) continue;
    rows.push(entry);
  }

  return { rows, afterLength, afterChannel };
}

/** Which filters are hiding rows right now - the count the "絞り込み" button shows. */
export function activeFilterKeys(filters: Filters): readonly ('length' | 'channel' | 'query')[] {
  const keys: ('length' | 'channel' | 'query')[] = [];

  if (filters.lengthBandId !== 'any') keys.push('length');
  if (filters.channelIds.size > 0) keys.push('channel');
  if (filters.query !== '') keys.push('query');

  return keys;
}

/** Filters counted on the shelf badge - the title search has its own "消す" and is not one of them. */
export function shelfFilterCount(filters: Filters): number {
  return (filters.lengthBandId !== 'any' ? 1 : 0) + (filters.channelIds.size > 0 ? 1 : 0);
}

export function shownCountOf(totalRows: number, shown: number): number {
  return Math.min(shown, totalRows);
}

/** One rung of the 0-result funnel: what it narrows by, and how many rows survive it. */
export interface FunnelStep {
  key: 'kind' | 'metric' | 'period' | 'length' | 'channel' | 'query';
  /** `[before, the narrowing word, after]`, assembled around an `<em>` in the component. */
  words: readonly [string, string, string];
  count: number;
}

/**
 * The funnel `buildFunnel` in #135's mock draws when a ranking's rows are
 * empty but its denominator is not: species, then whether the metric can be
 * read for that species at all (regardless of period), then the period-narrowed
 * denominator, then only the filters currently in effect.
 */
export function funnelSteps(
  rows: readonly VideoTableRow[],
  metric: VideoProperty,
  kind: VideoType,
  period: RankingPeriod,
  filters: Filters,
  universe: Universe,
  view: FilteredView,
): FunnelStep[] {
  const stages = kindStages(rows, metric, kind);
  const band = lengthBandOf(filters.lengthBandId);

  const steps: FunnelStep[] = [
    { key: 'kind', words: ['種別「', kindName(kind), '」'], count: stages.kind },
    { key: 'metric', words: ['', `${getPropertyName(metric)}を出せる`, ''], count: stages.metric },
    { key: 'period', words: ['期間「', periodLabel(period), '」'], count: universe.total },
  ];

  if (filters.lengthBandId !== 'any') {
    steps.push({ key: 'length', words: ['再生時間「', band.name, '」'], count: view.afterLength });
  }
  if (filters.channelIds.size > 0) {
    steps.push({ key: 'channel', words: ['配信者 ', `${filters.channelIds.size} 人`, ''], count: view.afterChannel });
  }
  if (filters.query !== '') {
    steps.push({ key: 'query', words: ['タイトル「', filters.query, '」'], count: view.rows.length });
  }

  return steps;
}

/** One other kind-and-period combination that is not empty, offered when this one is. */
export interface Alternative {
  kind: VideoType;
  period: RankingPeriod;
  label: string;
  count: number;
}

/**
 * Up to `limit` other kind-and-period combinations with at least one video,
 * best-stocked first - what "母数が 0" offers instead of this ranking.
 *
 * `candidatePeriods` is handed in rather than built here: which periods (and
 * which years) are worth offering is #135's own choice, not something this
 * shared function should decide on every caller's behalf.
 */
export function nonEmptyAlternatives(
  rows: readonly VideoTableRow[],
  metric: VideoProperty,
  kind: VideoType,
  period: RankingPeriod,
  candidatePeriods: readonly RankingPeriod[],
  now: Date,
  limit = 3,
): Alternative[] {
  const samePeriod = (a: RankingPeriod, b: RankingPeriod) =>
    typeof a === 'object' || typeof b === 'object' ? JSON.stringify(a) === JSON.stringify(b) : a === b;

  const candidates: { kind: VideoType; period: RankingPeriod; label: string }[] = [];

  for (const other of KINDS) {
    if (other.id !== kind) candidates.push({ kind: other.id, period, label: `種別を「${other.name}」にする` });
  }
  for (const other of candidatePeriods) {
    if (!samePeriod(other, period)) {
      candidates.push({ kind, period: other, label: `期間を「${periodLabel(other)}」にする` });
    }
  }

  return candidates
    .map((c) => ({ ...c, count: universeOf(rows, metric, c.kind, c.period, now).total }))
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}
