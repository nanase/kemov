import type { Env } from '../lib/env';

/**
 * GET /api/months: each member's month-by-month series, and their sum.
 *
 * This is task 3 of the aggregate endpoints (#144) and leaves out
 * `subscribers` - that series reads `channel_snapshot` rather than `video`,
 * and lands in task 4.
 *
 * Everything is read with one grouped query over the whole of `video` rather
 * than one query per channel or per month. The design decided against a
 * UNION ALL per month after D1 refused one built of 13 (#144), and a table
 * scan is the same cost as a narrower one anyway - ../lib/ranking.ts measured
 * that once already, and no index is added here for the same reason.
 */

interface ChannelRow {
  channel_id: string;
  activity_start_date: string;
}

interface AggregateRow {
  channel_id: string;
  month: string;
  streams: number;
  videos: number;
  shorts: number;
  stream_seconds: number;
  chat_messages: number;
  chat_unique_users: number;
  views: number;
}

/** The seven series this endpoint returns. `subscribers` is task 4's. */
const SERIES = ['streams', 'videos', 'shorts', 'streamSeconds', 'chatMessages', 'chatUniqueUsers', 'views'] as const;

type SeriesName = (typeof SERIES)[number];

const COLUMN: Readonly<Record<SeriesName, keyof AggregateRow>> = {
  streams: 'streams',
  videos: 'videos',
  shorts: 'shorts',
  streamSeconds: 'stream_seconds',
  chatMessages: 'chat_messages',
  chatUniqueUsers: 'chat_unique_users',
  views: 'views',
};

/**
 * The month an instant falls in, Japan time.
 *
 * Shifting by nine hours and reading the UTC calendar fields off the result
 * is the same trick `strftime(..., '+9 hours')` plays in the query below, so
 * a video either side of JST midnight lands in the same month here as it does
 * there.
 */
function jstMonth(date: Date): string {
  return new Date(date.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 7);
}

function nextMonth(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number) as [number, number];

  return monthNumber === 12 ? `${year + 1}-01` : `${year}-${String(monthNumber + 1).padStart(2, '0')}`;
}

/** Every 'YYYY-MM' from `first` to `last`, inclusive of both. */
function monthRange(first: string, last: string): string[] {
  const months: string[] = [];

  for (let month = first; month <= last; month = nextMonth(month)) months.push(month);

  return months;
}

async function listChannels(db: D1Database): Promise<ChannelRow[]> {
  const { results } = await db
    .prepare(`SELECT channel_id, activity_start_date FROM channel ORDER BY display_order, channel_id`)
    .all<ChannelRow>();

  return results;
}

/**
 * One row per channel per month it published something counted here, for
 * every video the design's "対象にする動画" rule covers.
 *
 * `COALESCE` inside each `SUM` keeps a month that has rows but nothing to
 * count in one of them - a video with no `view_count` yet, say - from summing
 * to NULL. Left as NULL it would be indistinguishable from a month `video`
 * never mentions at all, which the caller is entitled to read as an honest
 * zero once the channel has debuted.
 */
async function monthlyTotals(db: D1Database): Promise<AggregateRow[]> {
  const { results } = await db
    .prepare(
      `SELECT channel_id,
              strftime('%Y-%m', published_at, '+9 hours') AS month,
              SUM(CASE WHEN type = 'streaming' THEN 1 ELSE 0 END) AS streams,
              SUM(CASE WHEN type = 'video' THEN 1 ELSE 0 END) AS videos,
              SUM(CASE WHEN type = 'shorts' THEN 1 ELSE 0 END) AS shorts,
              SUM(CASE WHEN type = 'streaming' THEN COALESCE(duration_seconds, 0) ELSE 0 END) AS stream_seconds,
              SUM(COALESCE(chat_message_count, 0)) AS chat_messages,
              SUM(COALESCE(chat_unique_user_count, 0)) AS chat_unique_users,
              SUM(COALESCE(view_count, 0)) AS views
         FROM video
        WHERE availability = 'public' AND type IS NOT NULL
        GROUP BY channel_id, month`,
    )
    .all<AggregateRow>();

  return results;
}

/** The newest `fetched_at` among the videos this endpoint counts, or null when there are none. */
async function newestFetch(db: D1Database): Promise<string | null> {
  const row = await db
    .prepare(`SELECT MAX(fetched_at) AS fetched_at FROM video WHERE availability = 'public' AND type IS NOT NULL`)
    .first<{ fetched_at: string | null }>();

  return row?.fetched_at ?? null;
}

function emptyResponse() {
  return {
    fetchedAt: null,
    months: [] as string[],
    channels: [] as unknown[],
    total: Object.fromEntries(SERIES.map((name) => [name, [] as number[]])),
  };
}

/** GET /api/months */
export async function monthsSeries(env: Env, now: Date = new Date()) {
  const channels = await listChannels(env.DB);

  // No channel means no earliest debut to start the axis from.
  if (channels.length === 0) return emptyResponse();

  const [totals, fetchedAt] = await Promise.all([monthlyTotals(env.DB), newestFetch(env.DB)]);

  const firstMonth = channels
    .reduce(
      (earliest, channel) => (channel.activity_start_date < earliest ? channel.activity_start_date : earliest),
      channels[0].activity_start_date,
    )
    .slice(0, 7);
  const months = monthRange(firstMonth, jstMonth(now));

  const byChannel = new Map<string, Map<string, AggregateRow>>();

  for (const row of totals) {
    if (!byChannel.has(row.channel_id)) byChannel.set(row.channel_id, new Map());

    byChannel.get(row.channel_id)?.set(row.month, row);
  }

  const channelSeries = channels.map((channel) => {
    const debutMonth = channel.activity_start_date.slice(0, 7);
    const rows = byChannel.get(channel.channel_id);

    const series = Object.fromEntries(
      SERIES.map((name) => [
        name,
        // Before the member debuted, this axis has no meaning for them.
        // From debut on, a month `video` has no row for is a real zero: the
        // member existed and simply did not publish that month.
        months.map((month) =>
          month < debutMonth ? null : ((rows?.get(month)?.[COLUMN[name]] as number | undefined) ?? 0),
        ),
      ]),
    ) as Record<SeriesName, (number | null)[]>;

    return { channelId: channel.channel_id, ...series };
  });

  const total = Object.fromEntries(
    SERIES.map((name) => [
      name,
      // A null here means "not yet a member", so it counts as nothing rather
      // than as a hole in the sum - the design's rule for every series but
      // `subscribers`, which task 4 adds.
      months.map((_, index) => channelSeries.reduce((sum, channel) => sum + (channel[name][index] ?? 0), 0)),
    ]),
  );

  return { fetchedAt, months, channels: channelSeries, total };
}
