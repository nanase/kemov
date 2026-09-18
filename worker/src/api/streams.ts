import type { Env } from '../lib/env';
import { VIDEO_EFFECTIVE } from '../lib/overrides';

/**
 * GET /api/streams: each member's stream spans, for #134's heatmap of when
 * they go live, and their five most recent streams.
 *
 * One query answers every channel, ordered by actual_start_time so spans come
 * out oldest first per channel and the newest five are each channel's tail.
 * video is scanned in full rather than narrowed with an index, for the same
 * reason ../api/videos.ts gives: this table serves too many different
 * orderings for one index to help most of them.
 */

interface StreamRow {
  channel_id: string;
  video_id: string;
  title: string;
  actual_start_time: string;
  actual_end_time: string;
  duration_seconds: number | null;
  view_count: number | null;
  chat_message_count: number | null;
  fetched_at: string;
}

const MINUTE_MS = 60_000;
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** How many minutes a week holds. Also the longest a span may report. */
export const WEEK_MINUTES = 7 * 24 * 60;

/** How many of a channel's most recent streams `recent` carries. */
const RECENT_COUNT = 5;

/**
 * One stream's `[week minute, duration in minutes]`, the pair `spans`
 * flattens.
 *
 * The week minute counts from Sunday 00:00 JST. Shifting the UTC instant by
 * JST's offset and reading the shifted value's UTC fields makes getUTCDay 0
 * for the JST Sunday rather than the UTC one, without a timezone library.
 * Seconds are dropped by flooring to the minute before that shift, which is
 * "the start's second is truncated" in the same step as finding its minute.
 *
 * Duration is the ceiling of the minutes from that floored start to the end,
 * clamped to between 1 and a full week: a span shorter than a minute or
 * longer than the grid it is drawn on would either vanish or overflow it.
 */
export function spanOf(actualStartTime: string, actualEndTime: string): [number, number] {
  const flooredStartMs = Math.floor(new Date(actualStartTime).getTime() / MINUTE_MS) * MINUTE_MS;
  const endMs = new Date(actualEndTime).getTime();

  const shiftedStart = new Date(flooredStartMs + JST_OFFSET_MS);
  const weekMinute =
    shiftedStart.getUTCDay() * 24 * 60 + shiftedStart.getUTCHours() * 60 + shiftedStart.getUTCMinutes();

  const rawMinutes = Math.ceil((endMs - flooredStartMs) / MINUTE_MS);
  const durationMinutes = Math.min(WEEK_MINUTES, Math.max(1, rawMinutes));

  return [weekMinute, durationMinutes];
}

function presentRecent(row: StreamRow) {
  return {
    videoId: row.video_id,
    title: row.title,
    actualStartTime: row.actual_start_time,
    actualEndTime: row.actual_end_time,
    durationSeconds: row.duration_seconds,
    viewCount: row.view_count,
    chatMessageCount: row.chat_message_count,
  };
}

/**
 * GET /api/streams
 *
 * `actual_end_time > actual_start_time` leaves out a stream whose end is not
 * after its start - an anomaly the collector can still write, not a video
 * this endpoint has any use for. Left in, `spanOf` would clamp its duration
 * to one minute rather than report the true, meaningless span.
 */
export async function listStreams(env: Env) {
  const [{ results: channelRows }, { results: streamRows }] = await Promise.all([
    env.DB.prepare(`SELECT channel_id FROM channel ORDER BY display_order, channel_id`).all<{
      channel_id: string;
    }>(),
    env.DB.prepare(
      `WITH ${VIDEO_EFFECTIVE}
       SELECT channel_id, video_id, title, actual_start_time, actual_end_time,
              duration_seconds, view_count, chat_message_count, fetched_at
         FROM video_effective
        WHERE availability = 'public' AND type = 'streaming'
          AND actual_start_time IS NOT NULL AND actual_end_time IS NOT NULL
          AND actual_end_time > actual_start_time
        ORDER BY actual_start_time ASC`,
    ).all<StreamRow>(),
  ]);

  const byChannel = new Map<string, StreamRow[]>();
  // The newest fetched_at among the rows above, so a caller can judge the age
  // of this answer the way /api/months does for the same reason: null when
  // none of them exist yet, rather than the request's own instant.
  let fetchedAt: string | null = null;

  for (const row of streamRows) {
    const forChannel = byChannel.get(row.channel_id);

    if (forChannel === undefined) byChannel.set(row.channel_id, [row]);
    else forChannel.push(row);

    if (fetchedAt === null || row.fetched_at > fetchedAt) fetchedAt = row.fetched_at;
  }

  return {
    fetchedAt,
    channels: channelRows.map(({ channel_id: channelId }) => {
      const rows = byChannel.get(channelId) ?? [];

      return {
        channelId,
        spans: rows.flatMap((row) => spanOf(row.actual_start_time, row.actual_end_time)),
        // rows is oldest first; the newest RECENT_COUNT is its tail, reversed.
        recent: rows.slice(-RECENT_COUNT).reverse().map(presentRecent),
      };
    }),
  };
}
