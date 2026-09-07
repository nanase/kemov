import type { Env } from '../lib/env';
import { isFreeChatPlaceholder } from '../lib/video';

/**
 * GET /api/live
 *
 * What is on air and what is announced. The list of what this returns was
 * settled in #64, which built the collector that fills these columns; this is
 * the caller that #64's isFreeChatPlaceholder was written for and left waiting
 * on.
 */

interface LiveRow {
  video_id: string;
  channel_id: string;
  title: string;
  live_broadcast_content: string;
  scheduled_start_time: string | null;
  actual_start_time: string | null;
  fetched_at: string;
}

export async function listLive(env: Env, now: Date = new Date()) {
  // The partial index video_live covers exactly this predicate - the schema
  // added it because live and upcoming rows are a handful among thousands.
  const { results } = await env.DB.prepare(
    `SELECT video_id, channel_id, title, live_broadcast_content,
            scheduled_start_time, actual_start_time, fetched_at
       FROM video
      WHERE live_broadcast_content <> 'none'
      ORDER BY live_broadcast_content DESC, scheduled_start_time ASC, video_id ASC`,
  ).all<LiveRow>();

  const excluded: string[] = [];
  const streams = [];

  for (const row of results) {
    // A free chat is a real upcoming stream and its row says so. What it must
    // not be is the stream this endpoint names as a channel's next one: the
    // scraper being replaced took the one it found and never let go, so those
    // channels have read "upcoming" continuously ever since.
    if (isFreeChatPlaceholder(row.scheduled_start_time, now)) {
      excluded.push(row.video_id);
      continue;
    }

    streams.push({
      videoId: row.video_id,
      // The id only. The channel's name and colours come from channels.yml,
      // which the front end already holds; repeating them per stream would be
      // a second copy to disagree with the first.
      channelId: row.channel_id,
      title: row.title,
      // 'live' or 'upcoming'. Never 'none' - that is what the filter removes.
      state: row.live_broadcast_content,
      // Both, because an upcoming stream has only the first and a live one is
      // described by the second. Collapsing them into one field loses whichever
      // the other kind needed.
      scheduledStartTime: row.scheduled_start_time,
      actualStartTime: row.actual_start_time,
      fetchedAt: row.fetched_at,
    });
  }

  return {
    streams,
    // Named rather than merely absent. A channel whose only upcoming stream is
    // a free chat looks identical to a channel with nothing scheduled, and the
    // difference is the whole reason this endpoint exists.
    excludedFreeChats: excluded.length,
  };
}
