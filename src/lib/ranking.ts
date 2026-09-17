import { readProperty, VIDEO_PROPERTIES, type RankableVideo, type VideoProperty } from '@/type/video';
import type { VideoType } from '@/type/api';

/**
 * Ranking `GET /api/videos/table`'s rows in the browser.
 *
 * #144 moved this out of the worker: the columnar response already holds
 * every video, so a ranking narrowed to a period or a kind is a sort over
 * data already in hand rather than a request. What a value means for a given
 * metric is still `readProperty` in @/type/video - this file only decides
 * which rows a ranking counts and what order they come out in.
 */

/** One row of `GET /api/videos/table`, denormalized to one object per video. */
export interface VideoTableRow extends RankableVideo {
  videoId: string;
  type: VideoType | null;
  publishedAt: string;
}

/**
 * The periods a ranking's row count can be narrowed to.
 *
 * All five have their origin at `now` rather than at a fixed calendar mark -
 * #136's decision for its member list applies here too, so the same video
 * gets the same rank whichever page asks. `calendarYear` is the one exception
 * inside a period: it still runs to `now`, but it starts at this year's
 * January 1st in Japan time, not 365 days back.
 */
export const RANKING_PERIODS = ['all', 'p30', 'p90', 'p365', 'calendarYear'] as const;

export type RankingPeriod = (typeof RANKING_PERIODS)[number];

const DAY_MS = 24 * 60 * 60 * 1000;

/** Japan has no daylight saving, so this offset is exact and unconditional. */
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/**
 * The earliest `publishedAt` a period admits, or null for `all`.
 *
 * `calendarYear` follows the same rule `/api/months` uses for its own month
 * boundary: Japan time's midnight is UTC 15:00 the day before, found by
 * shifting `now` forward nine hours to read its Japanese year and then
 * shifting the result back.
 */
function periodStart(period: RankingPeriod, now: Date): Date | null {
  switch (period) {
    case 'all':
      return null;
    case 'p30':
      return new Date(now.getTime() - 30 * DAY_MS);
    case 'p90':
      return new Date(now.getTime() - 90 * DAY_MS);
    case 'p365':
      return new Date(now.getTime() - 365 * DAY_MS);
    case 'calendarYear': {
      const jstYear = new Date(now.getTime() + JST_OFFSET_MS).getUTCFullYear();
      return new Date(Date.UTC(jstYear, 0, 1) - JST_OFFSET_MS);
    }
  }
}

/** The rows a ranking counts, before a metric decides which of them have a value. */
function narrow(rows: readonly VideoTableRow[], kind: VideoType | null, period: RankingPeriod, now: Date) {
  const start = periodStart(period, now);

  return rows.filter((row) => {
    if (kind !== null && row.type !== kind) return false;

    return start === null || new Date(row.publishedAt).getTime() >= start.getTime();
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
