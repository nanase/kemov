import type { Env } from '../lib/env';
import { errorResponse, jsonResponse } from '../lib/json';
import { isSchemaDate, japanDateEndUtc, japanDateOf, japanDateStartUtc } from '../lib/time';

/**
 * Reading `channel_snapshot` and `channel_snapshot_exclusion` together
 * (#144's data screens task, added on top of task 9's handoff after review
 * found no read口 for the raw values the 統計 screen needs to judge an
 * exclusion by). Read-only: nothing here logs a `revision`, the same as
 * every other GET in this admin API. Saving and deleting an exclusion is
 * still snapshot-exclusions.ts's own job - this file only lets the screen
 * see what it is deciding about.
 */

// A day of ticks across every channel is 11 * 144 = 1,584 rows. 2,000 leaves
// headroom for that without admitting a range wide enough to scan a
// meaningful slice of the table on every request - D1's own limits
// (developers.cloudflare.com/d1/platform/limits/) cap a query at 100,000
// rows, well above what this screen has any use for regardless.
const TICK_ROW_LIMIT = 2000;

interface SnapshotRow {
  channel_id: string;
  fetched_at: string;
  subscriber_count: number | null;
  view_count: number;
  video_count: number;
}

interface ExclusionRow {
  channel_id: string;
  fetched_at: string;
  reason: string;
}

export interface SnapshotTick {
  channelId: string;
  fetchedAt: string;
  subscriberCount: number | null;
  viewCount: number;
  videoCount: number;
  excluded: boolean;
  reason: string | null;
}

export interface SnapshotDay {
  date: string;
  ticks: number;
  excluded: number;
}

/**
 * GET /admin/api/snapshots - `channelId` (omitted: every channel), `from`
 * and `to` (Japan-time dates, both inclusive; omitted: the same single day).
 *
 * `days` is derived from `ticks` in JS rather than a second SQL query: once
 * `ticks` itself is within `TICK_ROW_LIMIT`, grouping what is already in
 * hand costs nothing another round trip to D1 would not.
 *
 * An unknown `channelId` is refused with 400 rather than answered with an
 * empty list - the same choice footprints.ts's `unknownChannelIds` makes for
 * a body naming one, so a typo reads as a mistake here too, not as "this
 * channel simply has no ticks in range".
 */
export async function listSnapshots(
  env: Env,
  channelId: string | null,
  fromParam: string | null,
  toParam: string | null,
  now: Date = new Date(),
): Promise<Response> {
  if (channelId !== null) {
    const known = await env.DB.prepare('SELECT 1 FROM channel WHERE channel_id = ?1').bind(channelId).first();

    if (known === null) return errorResponse(400, `unknown channelId: ${channelId}`);
  }

  const to = toParam ?? japanDateOf(now.toISOString());
  const from = fromParam ?? to;

  if (!isSchemaDate(from)) return errorResponse(400, 'from must be YYYY-MM-DD');
  if (!isSchemaDate(to)) return errorResponse(400, 'to must be YYYY-MM-DD');
  if (from > to) return errorResponse(400, 'from is after to');

  const startUtc = japanDateStartUtc(from);
  const endUtc = japanDateEndUtc(to);
  const params: unknown[] = [startUtc, endUtc];
  const channelCondition = channelId === null ? '' : ' AND channel_id = ?3';

  if (channelId !== null) params.push(channelId);

  const { results: rows } = await env.DB.prepare(
    `SELECT channel_id, fetched_at, subscriber_count, view_count, video_count
       FROM channel_snapshot
      WHERE fetched_at >= ?1 AND fetched_at < ?2${channelCondition}
      ORDER BY fetched_at, channel_id
      LIMIT ${TICK_ROW_LIMIT + 1}`,
  )
    .bind(...params)
    .all<SnapshotRow>();

  if (rows.length > TICK_ROW_LIMIT) {
    return errorResponse(400, `more than ${TICK_ROW_LIMIT} ticks in range - narrow channelId or from/to`);
  }

  const { results: exclusionRows } = await env.DB.prepare(
    `SELECT channel_id, fetched_at, reason
       FROM channel_snapshot_exclusion
      WHERE fetched_at >= ?1 AND fetched_at < ?2${channelCondition}`,
  )
    .bind(...params)
    .all<ExclusionRow>();

  const reasonByKey = new Map(exclusionRows.map((row) => [`${row.channel_id}/${row.fetched_at}`, row.reason]));

  const ticks: SnapshotTick[] = rows.map((row) => {
    const reason = reasonByKey.get(`${row.channel_id}/${row.fetched_at}`) ?? null;

    return {
      channelId: row.channel_id,
      fetchedAt: row.fetched_at,
      subscriberCount: row.subscriber_count,
      viewCount: row.view_count,
      videoCount: row.video_count,
      excluded: reason !== null,
      reason,
    };
  });

  const dayByDate = new Map<string, SnapshotDay>();

  for (const tick of ticks) {
    const date = japanDateOf(tick.fetchedAt);
    const day = dayByDate.get(date) ?? { date, ticks: 0, excluded: 0 };

    day.ticks += 1;
    if (tick.excluded) day.excluded += 1;
    dayByDate.set(date, day);
  }

  const days = [...dayByDate.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  return jsonResponse({ ticks, days });
}
