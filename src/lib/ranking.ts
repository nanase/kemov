import { readProperty, VIDEO_PROPERTIES, type RankableVideo, type VideoProperty } from '@/type/video';
import type { VideoTable, VideoType } from '@/type/api';

/**
 * Ranking `GET /api/videos/table`'s rows in the browser.
 *
 * #144 moved this out of the worker: the columnar response already holds
 * every video, so a ranking narrowed to a period or a kind is a sort over
 * data already in hand rather than a request. What a value means for a given
 * metric is still `readProperty` in @/type/video - this file only decides
 * which rows a ranking counts and what order they come out in.
 */

/**
 * One row of `GET /api/videos/table`, denormalized to one object per video.
 *
 * Every field the endpoint's `columns` object carries except `fetchedAt`,
 * which describes the response rather than a video. @/lib/heatmap.ts reads
 * `actualStartTime` and `actualEndTime` off the same type.
 */
export interface VideoTableRow extends RankableVideo {
  videoId: string;
  channelId: string;
  title: string;
  type: VideoType | null;
  publishedAt: string;
  actualStartTime: string | null;
  actualEndTime: string | null;
}

/**
 * The columnar response as one object per video.
 *
 * Every column is the same length - `readVideoTable` refuses a response where
 * they are not - so the index is the video, and nothing here has to guard
 * against a column running short. It sits beside the ranking because every
 * page that reads the table reads it through this first.
 */
export function tableRows(table: VideoTable): VideoTableRow[] {
  const { columns } = table;

  return columns.videoId.map((videoId, index) => ({
    videoId,
    channelId: columns.channelId[index]!,
    title: columns.title[index]!,
    type: columns.type[index]!,
    publishedAt: columns.publishedAt[index]!,
    actualStartTime: columns.actualStartTime[index]!,
    actualEndTime: columns.actualEndTime[index]!,
    durationSeconds: columns.durationSeconds[index]!,
    viewCount: columns.viewCount[index]!,
    likeCount: columns.likeCount[index]!,
    commentCount: columns.commentCount[index]!,
    chatMessageCount: columns.chatMessageCount[index]!,
    chatUniqueUserCount: columns.chatUniqueUserCount[index]!,
  }));
}

/**
 * The four rolling periods a ranking's row count can be narrowed to, besides
 * one Japan-time calendar year.
 *
 * All four have their origin at `now` rather than at a fixed calendar mark -
 * #136's decision for its member list applies here too, so the same video
 * gets the same rank whichever page asks.
 */
export const RANKING_PERIODS = ['all', 'p30', 'p90', 'p365'] as const;

export type RankingPeriodId = (typeof RANKING_PERIODS)[number];

/**
 * A period a ranking can be narrowed to: one of the four rolling windows, or
 * one Japan-time calendar year.
 *
 * A year is a value rather than a fifth id (`{ year: 2021 }` rather than
 * `'y2021'`) because it carries data no id can: which year. #135's page picks
 * from several past years, not only the current one, so a fixed id per year
 * would mean growing this union every January. Which years exist to pick from,
 * and which one is selected by default, are the caller's business - this file
 * only has to turn whichever year it is handed into a range.
 */
export type RankingPeriod = RankingPeriodId | { year: number };

const DAY_MS = 24 * 60 * 60 * 1000;

/** Japan has no daylight saving, so this offset is exact and unconditional. */
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/**
 * The `[start, end]` a period admits, both inclusive. `start` is null for
 * `all`, which is unbounded on both ends - see `narrow` for why.
 *
 * A rolling window's `end` is always `now`. A calendar year's `end` used to be
 * implied by `now` too, back when the only year on offer was the one `now`
 * falls in: within that year, "up to now" and "up to December 31st" admit the
 * same rows, because nothing published after `now` exists yet. That stopped
 * holding the moment a *past* year became selectable, where "up to now" would
 * silently admit everything published since - so a year's `end` is now its
 * own December 31st in Japan time (23:59:59.999), capped at `now` for the
 * year still running. The boundary is found the same way `/api/months` finds
 * its own month boundary: Japan time's midnight is UTC 15:00 the day before,
 * so a year starts and ends there.
 */
function periodRange(period: RankingPeriod, now: Date): { start: Date | null; end: Date } {
  if (typeof period === 'object') {
    const start = new Date(Date.UTC(period.year, 0, 1) - JST_OFFSET_MS);
    const end = new Date(Date.UTC(period.year + 1, 0, 1) - JST_OFFSET_MS - 1);

    return { start, end: end.getTime() < now.getTime() ? end : now };
  }

  switch (period) {
    case 'all':
      return { start: null, end: now };
    case 'p30':
      return { start: new Date(now.getTime() - 30 * DAY_MS), end: now };
    case 'p90':
      return { start: new Date(now.getTime() - 90 * DAY_MS), end: now };
    case 'p365':
      return { start: new Date(now.getTime() - 365 * DAY_MS), end: now };
  }
}

/**
 * The rows a ranking counts, before a metric decides which of them have a
 * value.
 *
 * A bounded period also excludes a `publishedAt` after its end: the collector
 * stores whatever YouTube reports with no upper check against the request
 * time, and a premiere's `publishedAt` can be a schedule read ahead of the
 * clock a ranking is asked for. `all` stays unbounded on both ends - it is
 * answering "everything", not "everything up to today".
 */
function narrow(rows: readonly VideoTableRow[], kind: VideoType | null, period: RankingPeriod, now: Date) {
  const { start, end } = periodRange(period, now);

  return rows.filter((row) => {
    if (kind !== null && row.type !== kind) return false;
    if (start === null) return true;

    const publishedAt = new Date(row.publishedAt).getTime();

    return publishedAt >= start.getTime() && publishedAt <= end.getTime();
  });
}

/** One video's place in a ranking. */
export interface Ranked {
  videoId: string;
  value: number;
  rank: number;
}

/**
 * Every video with a value for `metric`, best first.
 *
 * Ties break on `videoId` descending, the same rule `/api/videos/ranking`
 * orders by - both read `video_id DESC` off the same table, and a ranking
 * that broke ties the other way here would put a different video on top of a
 * tie than the cross-channel page does.
 */
export function rankByMetric(
  rows: readonly VideoTableRow[],
  metric: VideoProperty,
  kind: VideoType | null,
  period: RankingPeriod,
  now: Date,
): Ranked[] {
  const withValue = narrow(rows, kind, period, now)
    .map((row) => ({ videoId: row.videoId, value: readProperty(row, metric) }))
    .filter((entry): entry is { videoId: string; value: number } => entry.value !== undefined)
    .sort((a, b) => {
      if (a.value !== b.value) return b.value - a.value;

      return a.videoId === b.videoId ? 0 : a.videoId < b.videoId ? 1 : -1;
    });

  return withValue.map((entry, index) => ({ ...entry, rank: index + 1 }));
}

/** A video's rank for one metric, and how many videos it was ranked against. */
export interface MetricRank {
  /** Null when the video has no value for this metric, and so no rank. */
  rank: number | null;
  total: number;
}

/**
 * One video's rank in every metric, against the same kind and period.
 *
 * The detail and member pages show a video's standing across all eleven
 * measures at once, which is this run eleven times over rather than a
 * eleventh function: nothing here computes a rank differently from
 * `rankByMetric`, so the two cannot drift apart the way the worker's SQL and
 * this file's arithmetic could without test/lib/ranking.test.ts.
 */
export function rankVideo(
  rows: readonly VideoTableRow[],
  videoId: string,
  kind: VideoType | null,
  period: RankingPeriod,
  now: Date,
): Record<VideoProperty, MetricRank> {
  return Object.fromEntries(
    VIDEO_PROPERTIES.map((metric) => {
      const ranked = rankByMetric(rows, metric, kind, period, now);
      const found = ranked.find((entry) => entry.videoId === videoId);

      return [metric, { rank: found?.rank ?? null, total: ranked.length }];
    }),
  ) as Record<VideoProperty, MetricRank>;
}
