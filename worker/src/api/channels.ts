import { changeOver, DAY_SECONDS, HOUR_SECONDS, type Delta, type Sample } from '../lib/delta';
import type { Env } from '../lib/env';
import { formatTimestamp } from '../lib/time';

/**
 * The endpoints that read `channel` and `channel_snapshot`.
 *
 * `channel_snapshot` holds readings and no rates, so every change reported
 * here is worked out at read time by ../lib/delta.ts. That is the schema's
 * intent - "nothing here stores a rate of change" - and it is what lets the
 * rule for computing one be corrected without refetching anything.
 */

interface SnapshotRow {
  fetched_at: string;
  subscriber_count: number | null;
  view_count: number;
  video_count: number;
}

interface ChannelRow {
  channel_id: string;
  fetched_at: string | null;
  subscriber_count: number | null;
  view_count: number | null;
  video_count: number | null;
}

/** The counts a change is reported for. */
const COUNTS = ['subscriberCount', 'viewCount', 'videoCount'] as const;

type CountName = (typeof COUNTS)[number];

const COLUMN: Readonly<Record<CountName, keyof SnapshotRow>> = {
  subscriberCount: 'subscriber_count',
  viewCount: 'view_count',
  videoCount: 'video_count',
};

/**
 * Every channel with its newest reading.
 *
 * Each channel is asked for its own newest snapshot rather than for the newest
 * tick across all of them. The two are usually the same value - every channel
 * in one collection run shares a fetched_at - but they part company exactly
 * when it matters. A channel whose fetch failed writes no row for that run
 * (#62), so keying off the global newest tick drops it from this list
 * entirely: the channel would vanish from the site because its statistics
 * could not be collected, which is a worse answer than showing the reading
 * before that one.
 *
 * That is not hypothetical. On the day this was written the API key was
 * missing and channel-stats failed 24 times in a row; the global-tick form
 * would have emptied this endpoint.
 *
 * Driving from `channel` also keeps the query off a table scan. Measured
 * against 578,160 snapshots - a year of ten-minute runs for 11 channels - this
 * shape uses the (channel_id, fetched_at) primary key throughout and runs in
 * 2-3ms, where the same question asked from `channel_snapshot` scans all
 * 578,160 rows.
 */
async function latestPerChannel(db: D1Database): Promise<ChannelRow[]> {
  const { results } = await db
    .prepare(
      `SELECT c.channel_id,
              (SELECT s.fetched_at FROM channel_snapshot s
                WHERE s.channel_id = c.channel_id ORDER BY s.fetched_at DESC LIMIT 1) AS fetched_at,
              (SELECT s.subscriber_count FROM channel_snapshot s
                WHERE s.channel_id = c.channel_id ORDER BY s.fetched_at DESC LIMIT 1) AS subscriber_count,
              (SELECT s.view_count FROM channel_snapshot s
                WHERE s.channel_id = c.channel_id ORDER BY s.fetched_at DESC LIMIT 1) AS view_count,
              (SELECT s.video_count FROM channel_snapshot s
                WHERE s.channel_id = c.channel_id ORDER BY s.fetched_at DESC LIMIT 1) AS video_count
         FROM channel c
        ORDER BY c.channel_id`,
    )
    .all<ChannelRow>();

  return results;
}

/** The newest snapshot at or before `at`, for one channel. */
async function snapshotAt(db: D1Database, channelId: string, at: string): Promise<SnapshotRow | null> {
  return await db
    .prepare(
      `SELECT fetched_at, subscriber_count, view_count, video_count
         FROM channel_snapshot
        WHERE channel_id = ?1 AND fetched_at <= ?2
        ORDER BY fetched_at DESC
        LIMIT 1`,
    )
    .bind(channelId, at)
    .first<SnapshotRow>();
}

function shift(from: string, seconds: number): string {
  return formatTimestamp(new Date(new Date(from).getTime() - seconds * 1000));
}

function sampleOf(row: SnapshotRow | ChannelRow | null, count: CountName): Sample | undefined {
  if (row === null || row.fetched_at === null) return undefined;

  const value = row[COLUMN[count]] as number | null | undefined;

  return { fetchedAt: row.fetched_at, value: value ?? null };
}

async function changesFor(
  db: D1Database,
  latest: ChannelRow,
  periodSeconds: number,
): Promise<Record<CountName, Delta>> {
  const earlier =
    latest.fetched_at === null
      ? null
      : await snapshotAt(db, latest.channel_id, shift(latest.fetched_at, periodSeconds));

  return Object.fromEntries(
    COUNTS.map((count) => [count, changeOver(sampleOf(latest, count), sampleOf(earlier, count), periodSeconds)]),
  ) as Record<CountName, Delta>;
}

function present(row: ChannelRow, perHour: Record<CountName, Delta>, perDay: Record<CountName, Delta>) {
  return {
    channelId: row.channel_id,
    // The instant this channel's numbers were read, not the instant of the
    // request. #70 shows it so a stale figure can be seen to be stale.
    fetchedAt: row.fetched_at,
    latest: {
      // Null is "the channel hides this", never zero - see the schema.
      subscriberCount: row.subscriber_count,
      viewCount: row.view_count,
      videoCount: row.video_count,
    },
    perHour,
    perDay,
  };
}

/** GET /api/channels */
export async function listChannels(env: Env) {
  const rows = await latestPerChannel(env.DB);

  const channels = await Promise.all(
    rows.map(async (row) =>
      present(row, await changesFor(env.DB, row, HOUR_SECONDS), await changesFor(env.DB, row, DAY_SECONDS)),
    ),
  );

  return {
    // The newest reading anywhere, so a caller can judge the age of the set
    // without reading every channel's own.
    fetchedAt: channels.reduce<string | null>(
      (newest, channel) =>
        channel.fetchedAt !== null && (newest === null || channel.fetchedAt > newest) ? channel.fetchedAt : newest,
      null,
    ),
    channels,
  };
}

/** GET /api/channels/:id, or null when there is no such channel. */
export async function getChannel(env: Env, channelId: string) {
  const rows = await latestPerChannel(env.DB);
  const row = rows.find((candidate) => candidate.channel_id === channelId);

  if (row === undefined) return null;

  return present(row, await changesFor(env.DB, row, HOUR_SECONDS), await changesFor(env.DB, row, DAY_SECONDS));
}

/**
 * The buckets a history request may ask for, by the name it asks with.
 *
 * Named here rather than in the router, so that what this endpoint accepts
 * sits beside what it does with it - the same place ../api/videos.ts keeps
 * readLimit and readMetric.
 */
export const HISTORY_BUCKETS: Readonly<Record<string, number>> = {
  '10m': 10 * 60,
  hour: 60 * 60,
  day: 24 * 60 * 60,
};

/**
 * The longest span one request may ask for.
 *
 * A year and a bit. Longer than any question the site asks, and short enough
 * that a request cannot ask this worker to read every snapshot ever taken.
 */
export const MAX_HISTORY_DAYS = 400;

/** How far back a request reaches when it does not say. */
export const DEFAULT_HISTORY_DAYS = 7;

/** What a history request asked for, or why it could not be honoured. */
export type HistoryRange = { from: string; to: string; bucketSeconds: number } | { error: string };

/**
 * Reads a history request's query string.
 *
 * Refuses rather than clamps, unlike readLimit next door. A limit outside the
 * range has an obvious sensible reading and a date range does not: silently
 * moving `from` would answer a different question from the one asked and look
 * like an answer to the original.
 */
export function readHistoryRange(params: URLSearchParams, now: Date): HistoryRange {
  const bucketName = params.get('bucket') ?? 'hour';
  const bucketSeconds = HISTORY_BUCKETS[bucketName];

  if (bucketSeconds === undefined) {
    return { error: `bucket must be one of ${Object.keys(HISTORY_BUCKETS).join(', ')}` };
  }

  // Absent and unreadable are answered differently. Absent means the caller
  // did not ask, so the default stands in. Unreadable means the caller asked
  // for something this cannot honour, and standing a default in there would
  // answer a week's question as though it were the one that was sent.
  const readInstant = (name: string, fallback: Date): string | { error: string } => {
    const value = params.get(name);

    if (value === null) return formatTimestamp(fallback);

    const date = new Date(value);

    return Number.isNaN(date.getTime()) ? { error: `${name} is not an instant` } : formatTimestamp(date);
  };

  const to = readInstant('to', now);

  if (typeof to !== 'string') return to;

  const from = readInstant('from', new Date(now.getTime() - DEFAULT_HISTORY_DAYS * 86400 * 1000));

  if (typeof from !== 'string') return from;

  if (from > to) return { error: 'from is after to' };

  if ((new Date(to).getTime() - new Date(from).getTime()) / 86400 / 1000 > MAX_HISTORY_DAYS) {
    return { error: `from and to are more than ${MAX_HISTORY_DAYS} days apart` };
  }

  return { from, to, bucketSeconds };
}

/**
 * GET /api/channels/:id/history
 *
 * Readings between two instants, thinned to at most one per bucket so that a
 * year of ten-minute runs does not arrive as 52,560 points. The thinning takes
 * the newest reading in each bucket rather than averaging, because these are
 * cumulative totals: an average of two totals is not a total anything ever
 * had.
 */
export async function getHistory(env: Env, channelId: string, from: string, to: string, bucketSeconds: number) {
  const { results } = await env.DB.prepare(
    `SELECT fetched_at, subscriber_count, view_count, video_count
       FROM channel_snapshot
      WHERE channel_id = ?1 AND fetched_at >= ?2 AND fetched_at <= ?3
      ORDER BY fetched_at ASC`,
  )
    .bind(channelId, from, to)
    .all<SnapshotRow>();

  const buckets = new Map<number, SnapshotRow>();

  for (const row of results) {
    const bucket = Math.floor(new Date(row.fetched_at).getTime() / 1000 / bucketSeconds);

    buckets.set(bucket, row);
  }

  return {
    channelId,
    from,
    to,
    bucketSeconds,
    samples: [...buckets.values()].map((row) => ({
      fetchedAt: row.fetched_at,
      subscriberCount: row.subscriber_count,
      viewCount: row.view_count,
      videoCount: row.video_count,
    })),
  };
}
