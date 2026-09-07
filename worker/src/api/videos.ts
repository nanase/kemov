import type { Env } from '../lib/env';
import {
  isRankingMetric,
  isVideoKind,
  rankingExpression,
  rankingFilter,
  type RankingMetric,
  type VideoKind,
} from '../lib/ranking';
import { BadRequest } from './cache';

/**
 * The endpoints that read `video`: one channel's list, and the ranking that
 * crosses channels.
 *
 * Neither uses an index beyond the ones the schema already has, and that is a
 * measured decision rather than an omission. Ordering 6,426 rows by a count
 * and taking ten takes 4ms as a table scan. An index on the count was tried:
 * the plan changed from SCAN to SEARCH and the query got *slower*, 7-10ms,
 * because every row still has to be fetched for its title and channel. Eight
 * of the eleven metrics are ratios of two columns, which no index on either
 * column can order by, so even a helpful index would have covered three cases.
 */

interface VideoRow {
  video_id: string;
  channel_id: string;
  title: string;
  published_at: string;
  availability: string;
  live_broadcast_content: string;
  type: string | null;
  duration_seconds: number | null;
  view_count: number | null;
  like_count: number | null;
  comment_count: number | null;
  chat_message_count: number | null;
  chat_unique_user_count: number | null;
  scheduled_start_time: string | null;
  actual_start_time: string | null;
  actual_end_time: string | null;
  fetched_at: string;
}

const VIDEO_COLUMNS = `video_id, channel_id, title, published_at, availability, live_broadcast_content,
                       type, duration_seconds, view_count, like_count, comment_count,
                       chat_message_count, chat_unique_user_count,
                       scheduled_start_time, actual_start_time, actual_end_time, fetched_at`;

/** How many videos one page holds unless the caller asks for fewer. */
export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 200;

/** How many rows a ranking returns unless the caller asks for fewer. */
export const DEFAULT_RANKING_SIZE = 10;
export const MAX_RANKING_SIZE = 100;

function present(row: VideoRow) {
  return {
    videoId: row.video_id,
    channelId: row.channel_id,
    title: row.title,
    publishedAt: row.published_at,
    // Spelled in full. The front end reads 'unavalable' today; #70 replaces
    // that reader, and nothing writes the misspelling on this side.
    availability: row.availability,
    liveBroadcastContent: row.live_broadcast_content,
    // Null until video-update has worked out what this video is. Every row the
    // migration wrote starts that way.
    type: row.type,
    durationSeconds: row.duration_seconds,
    viewCount: row.view_count,
    likeCount: row.like_count,
    commentCount: row.comment_count,
    chatMessageCount: row.chat_message_count,
    chatUniqueUserCount: row.chat_unique_user_count,
    // All three null for a video that was never a stream, and the first two
    // are how a stream is described: a scheduled one has only scheduled, a
    // finished one has all three. The detail dialog shows each of them, which
    // is why they travel with the list rather than needing a second request.
    scheduledStartTime: row.scheduled_start_time,
    actualStartTime: row.actual_start_time,
    actualEndTime: row.actual_end_time,
    fetchedAt: row.fetched_at,
  };
}

/**
 * A page's position, as the caller gets it back and hands it in again.
 *
 * Keyset rather than an offset: the collector writes to this table while
 * someone is paging through it, and an offset would skip or repeat rows as
 * they move. The key is the ordering column and the video id together, because
 * two videos can share a published_at and a key that is not unique loses one
 * of them at every page boundary.
 */
function encodeCursor(value: string, videoId: string): string {
  return btoa(unescape(encodeURIComponent(JSON.stringify([value, videoId]))));
}

function decodeCursor(cursor: string): [string, string] | null {
  try {
    const decoded: unknown = JSON.parse(decodeURIComponent(escape(atob(cursor))));

    if (!Array.isArray(decoded) || decoded.length !== 2) return null;
    if (typeof decoded[0] !== 'string' || typeof decoded[1] !== 'string') return null;

    return [decoded[0], decoded[1]];
  } catch {
    return null;
  }
}

/**
 * GET /api/channels/:id/videos
 *
 * Newest first, one page at a time. Ordering is by published_at only: it is
 * the one column every row has, it never changes once written, and a cursor
 * built on it stays valid while the collector updates counts underneath. The
 * rankings are what order by a count, and they are a top-N rather than a
 * pageable list.
 */
export async function listVideos(env: Env, channelId: string, options: { limit: number; cursor: string | null }) {
  const after = options.cursor === null ? null : decodeCursor(options.cursor);

  if (options.cursor !== null && after === null) throw new BadRequest('cursor is not one this API issued');

  const rows =
    after === null
      ? await env.DB.prepare(
          `SELECT ${VIDEO_COLUMNS} FROM video WHERE channel_id = ?1
          ORDER BY published_at DESC, video_id DESC LIMIT ?2`,
        )
          .bind(channelId, options.limit + 1)
          .all<VideoRow>()
      : await env.DB.prepare(
          `SELECT ${VIDEO_COLUMNS} FROM video
          WHERE channel_id = ?1 AND (published_at, video_id) < (?2, ?3)
          ORDER BY published_at DESC, video_id DESC LIMIT ?4`,
        )
          .bind(channelId, after[0], after[1], options.limit + 1)
          .all<VideoRow>();

  // One more than asked for, so that "is there another page" is answered
  // without a second query and without claiming there is one when the count
  // happens to divide evenly.
  const page = rows.results.slice(0, options.limit);
  const last = page[page.length - 1];

  return {
    channelId,
    videos: page.map(present),
    nextCursor: rows.results.length > options.limit && last ? encodeCursor(last.published_at, last.video_id) : null,
  };
}

/**
 * GET /api/videos/ranking
 *
 * The same metrics the front end already ranks by, across every channel.
 * Rows that cannot supply the metric are left out rather than ordered as if
 * the missing part were zero - which for a per-second metric means the archive
 * is short until video-update has filled in its durations.
 *
 * `kind` narrows it to one sort of video, and a caller that wants a per-second
 * metric to mean anything has to use it - see VIDEO_KINDS for the measurements.
 * It is bound rather than interpolated: unlike the metric, this value could
 * come from anywhere, and the pair of functions returning SQL above says why
 * that difference matters.
 *
 * Narrowing here rather than in the caller is deliberate. Asking for a hundred
 * and keeping the streams would answer "no streams" and "none arrived in the
 * hundred" the same way, which is the defect #70 spent a pull request removing.
 */
export async function rankVideos(env: Env, metric: RankingMetric, limit: number, kind: VideoKind | null = null) {
  const expression = rankingExpression(metric);
  const { results } = await env.DB.prepare(
    `SELECT ${VIDEO_COLUMNS}, ${expression} AS metric_value
       FROM video
      WHERE availability = 'public'
        AND type IS NOT NULL
        AND (?2 IS NULL OR type = ?2)
        AND ${rankingFilter(metric)}
      ORDER BY metric_value DESC, video_id DESC
      LIMIT ?1`,
  )
    .bind(limit, kind)
    .all<VideoRow & { metric_value: number }>();

  return {
    metric,
    // Echoed so a caller can tell "this ranking is streams only" from "this
    // ranking happens to hold only streams".
    kind,
    videos: results.map((row) => ({ ...present(row), metricValue: row.metric_value })),
  };
}

/**
 * The metric a query string asks for: viewCount when it asks for none, and
 * null when it names one this API does not offer.
 *
 * Refused rather than defaulted, unlike a missing parameter. Asking for a
 * ranking by something that does not exist and being handed a ranking by views
 * would look like an answer.
 */
export function readMetric(value: string | null): RankingMetric | null {
  if (value === null) return 'viewCount';

  return isRankingMetric(value) ? value : null;
}

/**
 * The kind a query string asks for: null when it asks for none, and undefined
 * when it names one this API does not have.
 *
 * Absent and unreadable are answered differently, the way readMetric and
 * readHistoryRange both do. Not asking means every kind; asking for a kind
 * that does not exist and being handed every kind would look like an answer.
 */
export function readKind(value: string | null): VideoKind | null | undefined {
  if (value === null) return null;

  return isVideoKind(value) ? value : undefined;
}

/** A limit from a query string, clamped rather than refused. */
export function readLimit(value: string | null, fallback: number, max: number): number {
  const parsed = value === null ? fallback : Number(value);

  if (!Number.isInteger(parsed) || parsed < 1) return fallback;

  return Math.min(parsed, max);
}
