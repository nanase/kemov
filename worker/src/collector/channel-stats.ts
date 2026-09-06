import type { Env } from '../lib/env';
import { formatTimestamp } from '../lib/time';
import { callYouTubeApi } from '../lib/youtube';

interface ChannelsListItem {
  id: string;
  snippet?: {
    customUrl?: string;
    thumbnails?: {
      default?: { url: string };
    };
  };
  statistics?: {
    viewCount: string;
    subscriberCount: string;
    hiddenSubscriberCount: boolean;
    videoCount: string;
  };
}

interface ChannelsListResponse {
  items?: ChannelsListItem[];
}

// Matches the */10 cron this job runs on (see jobsByCron in ../collector):
// the next tick will attempt this channel again regardless, so there is no
// reason for collect_task to ask for a retry any sooner.
const RETRY_AFTER_MINUTES = 10;

function nextAttemptAfter(fetchedAt: string): string {
  const next = new Date(fetchedAt);

  next.setUTCMinutes(next.getUTCMinutes() + RETRY_AFTER_MINUTES);

  return formatTimestamp(next);
}

/**
 * Records that one channel's stats did not land this tick, whether because
 * the whole call failed, Channels.list did not return the channel, or
 * writing its row to D1 failed.
 *
 * Always 'failed', never 'unavailable': a single missing tick cannot tell a
 * deleted or private channel apart from a transient gap, and 'unavailable'
 * per the schema comment means confirmed absence. Deciding that needs
 * looking across several ticks, which is out of scope here - see the PR
 * description.
 *
 * `collect_task` is never cleared here on a later success: nothing in #62
 * reads it back, so there is nothing yet for a cleared row to feed. #66,
 * which checks this data against the old system, is the first likely reader.
 */
async function recordMissing(db: D1Database, channelId: string, fetchedAt: string): Promise<void> {
  await db
    .prepare(
      `INSERT INTO collect_task (kind, target_id, state, attempts, next_attempt_at, updated_at)
       VALUES ('channel_stats', ?1, 'failed', 1, ?2, ?2)
       ON CONFLICT (kind, target_id) DO UPDATE SET
         state = 'failed',
         attempts = attempts + 1,
         next_attempt_at = excluded.next_attempt_at,
         updated_at = excluded.updated_at`,
    )
    .bind(channelId, nextAttemptAfter(fetchedAt))
    .run();
}

/**
 * Writes one returned channel's result: the columns `channel` leaves to the
 * collector, plus its `channel_snapshot` row. Paired in one batch so the two
 * never disagree on fetched_at for this channel.
 *
 * A channel with no statistics part, or a D1 failure while writing either
 * statement, falls back to recordMissing - the same trace a channel
 * Channels.list omitted entirely gets - so every way a channel can end this
 * tick without a snapshot ends up in collect_task, not just some of them.
 */
async function writeSnapshot(db: D1Database, item: ChannelsListItem, fetchedAt: string): Promise<void> {
  const statistics = item.statistics;

  if (!statistics) {
    await recordMissing(db, item.id, fetchedAt);
    return;
  }

  // YouTube reports 0 for a channel that hides its subscriber count, which
  // cannot be told apart from a channel that truly has none. NULL can.
  const subscriberCount = statistics.hiddenSubscriberCount ? null : Number(statistics.subscriberCount);

  try {
    await db.batch([
      db
        .prepare('UPDATE channel SET custom_url = ?1, thumbnail_url = ?2, fetched_at = ?3 WHERE channel_id = ?4')
        .bind(item.snippet?.customUrl ?? null, item.snippet?.thumbnails?.default?.url ?? null, fetchedAt, item.id),
      db
        .prepare(
          'INSERT INTO channel_snapshot (channel_id, fetched_at, subscriber_count, view_count, video_count) VALUES (?1, ?2, ?3, ?4, ?5)',
        )
        .bind(item.id, fetchedAt, subscriberCount, Number(statistics.viewCount), Number(statistics.videoCount)),
    ]);
  } catch (error) {
    console.error(`channel-stats: writing ${item.id} failed`, error);
    await recordMissing(db, item.id, fetchedAt);
  }
}

/**
 * The channel-stats job (#62): one Channels.list call for every channel D1
 * knows about, written as one channel_snapshot row per channel plus the three
 * columns of `channel` the collector owns.
 *
 * fetchedAt is read once, before the call, and shared by every row this run
 * writes. It names the tick, not when the response happened to arrive, so a
 * query can line channels up by it - see the schema's comment on
 * channel_snapshot.fetched_at.
 */
export async function runChannelStats(env: Env, fetchImpl: typeof fetch = fetch): Promise<void> {
  const fetchedAt = formatTimestamp(new Date());

  const { results: channels } = await env.DB.prepare('SELECT channel_id FROM channel').all<{ channel_id: string }>();
  const channelIds = channels.map((row) => row.channel_id);

  if (channelIds.length === 0) {
    console.warn('channel-stats: no channels in D1 to collect');
    return;
  }

  let items: ChannelsListItem[];

  try {
    // maxResults defaults to 5 even when id lists more than that, so without
    // it Channels.list would silently drop channels past the 5th and the
    // quota section's "one call for all 11" would stop being true. 50 is the
    // API's own ceiling on both maxResults and the id list; channelIds is
    // nowhere near it today, so batching across multiple calls isn't here yet.
    const response = await callYouTubeApi<ChannelsListResponse>(
      'channels',
      env.YOUTUBE_API_KEY,
      { part: 'snippet,statistics', id: channelIds.join(','), maxResults: '50' },
      fetchImpl,
    );

    items = response.items ?? [];
  } catch (error) {
    // The whole call failed, so every channel this tick wanted is missing -
    // not just some of them.
    console.error('channel-stats: Channels.list failed', error);
    await Promise.all(channelIds.map((channelId) => recordMissing(env.DB, channelId, fetchedAt)));
    return;
  }

  const returnedIds = new Set(items.map((item) => item.id));
  const missingIds = channelIds.filter((channelId) => !returnedIds.has(channelId));

  if (missingIds.length > 0) {
    // A channel Channels.list did not return - deleted or made private, most
    // often - loses only its own row this tick. The rest still land.
    console.warn(
      `channel-stats: ${missingIds.length} of ${channelIds.length} channels were not returned: ${missingIds.join(', ')}`,
    );
  }

  await Promise.all([
    ...items.map((item) => writeSnapshot(env.DB, item, fetchedAt)),
    ...missingIds.map((channelId) => recordMissing(env.DB, channelId, fetchedAt)),
  ]);
}
