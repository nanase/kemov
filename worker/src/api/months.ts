import type { Env } from '../lib/env';

/**
 * GET /api/months: each member's month-by-month series, and their sum.
 *
 * Everything but `subscribers` is read with one grouped query over the whole
 * of `video` rather than one query per channel or per month. The design
 * decided against a UNION ALL per month after D1 refused one built of 13
 * (#144), and a table scan is the same cost as a narrower one anyway -
 * ../lib/ranking.ts measured that once already, and no index is added here
 * for the same reason. `subscribers` reads `channel_snapshot` instead, for
 * the same reason and with the same UNION ALL avoided a different way - see
 * subscriberSnapshots below.
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

interface SubscriberRow {
  channel_id: string;
  month: string;
  // Both null together, when no snapshot exists yet at or before this
  // month's end. Never null one without the other - the same row supplies
  // both.
  subscriber_count: number | null;
  fetched_at: string | null;
}

/**
 * The series summed the same way: null before a member exists counts as
 * nothing, and 0 after is a real answer. `subscribers` is summed differently
 * - see the `total` object below - so it stays out of this list.
 */
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

/** One channel's row in the response: the seven counted series, plus `subscribers`. */
type ChannelSeries = { channelId: string } & Record<SeriesName, (number | null)[]> & {
    subscribers: (number | null)[];
  };

/** The `total` object's shape: the seven series summed as numbers, `subscribers` summed as `number | null`. */
type Total = Record<SeriesName, number[]> & { subscribers: (number | null)[] };

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

/**
 * Every channel's subscriber count as of the end of every axis month - the
 * newest `channel_snapshot` at or before the JST month's boundary, carried
 * forward from an earlier month when none arrived during this one.
 *
 * `month_offset` generates the row count the design calls for - member count
 * x month count - without a UNION ALL per month, which D1 refused at 13
 * branches (#144). It is a `WITH RECURSIVE` of two branches evaluated
 * repeatedly, not one branch per month, so the count that trips the limit
 * never appears in this query's text.
 *
 * The carried value and the month it actually landed in travel together: a
 * carried-forward count is exactly what `total.subscribers` needs below, and
 * exactly what a single member's own series must not show, so callers here
 * compare `fetched_at`'s own month against the row's month before deciding
 * which one they want.
 */
async function subscriberSnapshots(db: D1Database, months: readonly string[]): Promise<SubscriberRow[]> {
  if (months.length === 0) return [];

  const firstMonthDate = `${months[0]}-01`;

  const { results } = await db
    .prepare(
      `WITH RECURSIVE month_offset(n) AS (
         SELECT 0
         UNION ALL
         SELECT n + 1 FROM month_offset WHERE n < ?1 - 1
       )
       SELECT c.channel_id,
              strftime('%Y-%m', date(?2, '+' || month_offset.n || ' months')) AS month,
              (SELECT s.subscriber_count FROM channel_snapshot s
                WHERE s.channel_id = c.channel_id
                  AND s.fetched_at < strftime('%Y-%m-%dT%H:%M:%SZ', ?2, '+' || (month_offset.n + 1) || ' months', '-9 hours')
                ORDER BY s.fetched_at DESC LIMIT 1) AS subscriber_count,
              (SELECT s.fetched_at FROM channel_snapshot s
                WHERE s.channel_id = c.channel_id
                  AND s.fetched_at < strftime('%Y-%m-%dT%H:%M:%SZ', ?2, '+' || (month_offset.n + 1) || ' months', '-9 hours')
                ORDER BY s.fetched_at DESC LIMIT 1) AS fetched_at
         FROM channel c CROSS JOIN month_offset`,
    )
    .bind(months.length, firstMonthDate)
    .all<SubscriberRow>();

  return results;
}

/** The newest `fetched_at` among the videos this endpoint counts, or null when there are none. */
async function newestFetch(db: D1Database): Promise<string | null> {
  const row = await db
    .prepare(`SELECT MAX(fetched_at) AS fetched_at FROM video WHERE availability = 'public' AND type IS NOT NULL`)
    .first<{ fetched_at: string | null }>();

  return row?.fetched_at ?? null;
}

interface MonthsResponse {
  fetchedAt: string | null;
  months: string[];
  channels: ChannelSeries[];
  total: Total;
}

function emptyResponse(): MonthsResponse {
  return {
    fetchedAt: null,
    months: [],
    channels: [],
    total: {
      ...(Object.fromEntries(SERIES.map((name) => [name, [] as number[]])) as Record<SeriesName, number[]>),
      subscribers: [],
    },
  };
}

/** GET /api/months */
export async function monthsSeries(env: Env, now: Date = new Date()): Promise<MonthsResponse> {
  const channels = await listChannels(env.DB);

  // No channel means no earliest debut to start the axis from.
  if (channels.length === 0) return emptyResponse();

  const firstMonth = channels
    .reduce(
      (earliest, channel) => (channel.activity_start_date < earliest ? channel.activity_start_date : earliest),
      channels[0].activity_start_date,
    )
    .slice(0, 7);
  const months = monthRange(firstMonth, jstMonth(now));

  const [totals, fetchedAt, subscriberRows] = await Promise.all([
    monthlyTotals(env.DB),
    newestFetch(env.DB),
    subscriberSnapshots(env.DB, months),
  ]);

  const byChannel = new Map<string, Map<string, AggregateRow>>();

  for (const row of totals) {
    if (!byChannel.has(row.channel_id)) byChannel.set(row.channel_id, new Map());

    byChannel.get(row.channel_id)?.set(row.month, row);
  }

  const subscribersByChannel = new Map<string, Map<string, SubscriberRow>>();

  for (const row of subscriberRows) {
    if (!subscribersByChannel.has(row.channel_id)) subscribersByChannel.set(row.channel_id, new Map());

    subscribersByChannel.get(row.channel_id)?.set(row.month, row);
  }

  const channelSeries = channels.map((channel) => {
    const debutMonth = channel.activity_start_date.slice(0, 7);
    const rows = byChannel.get(channel.channel_id);
    const subscriberRow = subscribersByChannel.get(channel.channel_id);

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

    const subscribers = months.map((month) => {
      const row = subscriberRow?.get(month);

      // Carried forward from an earlier month, not read this one: this
      // member's own series says so, even though the same carried count is
      // exactly what `total.subscribers` wants from this cell.
      if (row?.fetched_at == null || row.subscriber_count === null) return null;

      return jstMonth(new Date(row.fetched_at)) === month ? row.subscriber_count : null;
    });

    return { channelId: channel.channel_id, ...series, subscribers };
  }) satisfies ChannelSeries[];

  const total: Total = {
    ...(Object.fromEntries(
      SERIES.map((name) => [
        name,
        // A null here means "not yet a member", so it counts as nothing
        // rather than as a hole in the sum.
        months.map((_, index) => channelSeries.reduce((sum, channel) => sum + (channel[name][index] ?? 0), 0)),
      ]),
    ) as Record<SeriesName, number[]>),
    // Unlike the other series, this carries each member's last known count
    // forward rather than reading `channelSeries`' own `subscribers` - an
    // ended member's count must keep counting rather than drop to zero
    // (#134), which is exactly what their own series is not allowed to show.
    subscribers: months.map((month) => {
      const counts = channels
        .map((channel) => subscribersByChannel.get(channel.channel_id)?.get(month)?.subscriber_count ?? null)
        .filter((count): count is number => count !== null);

      return counts.length === 0 ? null : counts.reduce((sum, count) => sum + count, 0);
    }),
  };

  return { fetchedAt, months, channels: channelSeries, total };
}
