import type { Env } from '../lib/env';
import {
  BACKED_UP_TABLES,
  backupKey,
  dayBounds,
  daysPresent,
  dayOf,
  MAX_DAYS_PER_RUN,
  missingDays,
  previousDay,
  toSql,
  type TableShape,
  withoutStaleApiValues,
} from '../lib/backup';
import { formatTimestamp } from '../lib/time';

/**
 * Writing D1 out to R2, so that #72 can take the old system away (#111).
 *
 * Two shapes, because the tables are two shapes.
 *
 * Most tables are replaced in place: at most a few thousand rows whose
 * current values are the whole story, so each run writes the lot and the
 * newest file is a complete copy. A table with a `dayColumn` (see
 * `BACKED_UP_TABLES` in ../lib/backup.ts) is not. It is append only - a row
 * is written once and never touched again - and `channel_snapshot` alone
 * grows by 1,584 rows a day for ever. Writing all of it each run would work
 * today and would stop working on a day nobody chose. So a finished day is
 * written once, as its own file, and the work of one run stays the size of
 * one day however long the table gets.
 *
 * No judgement is made here: what the SQL looks like and which days are
 * missing are decided by the pure rules in ../lib/backup.ts.
 */

/**
 * How many rows are read from D1 at a time.
 *
 * A day of snapshots is 1,584 rows and `video` is over six thousand, so
 * neither is read in one query.
 */
const READ_PAGE = 1_000;

/**
 * Every row of a table, primary key order, read a page at a time.
 *
 * Paged by the key rather than by OFFSET. Each page is its own query and D1
 * offers no snapshot across them, so a row inserted while this is reading
 * shifts every OFFSET after it by one and a row that was already there is
 * skipped - silently, and only in the backup. A key cursor cannot skip a row
 * it has not passed yet. Rows inserted behind the cursor are missed either
 * way; those belong to a day this run is not writing, and tomorrow's run has
 * them.
 */
async function readAll(
  db: D1Database,
  table: TableShape,
  where: { clause: string; bindings: unknown[] } = { clause: '', bindings: [] },
): Promise<Record<string, unknown>[]> {
  const key = table.conflict;
  const order = key.join(', ');
  const rows: Record<string, unknown>[] = [];
  let after: unknown[] | null = null;

  for (;;) {
    const bindings = [...where.bindings];
    const conditions = where.clause === '' ? [] : [where.clause];

    if (after !== null) {
      // A row value comparison, so that a composite key pages on the pair
      // rather than on its first column alone.
      conditions.push(`(${order}) > (${after.map((_, index) => `?${bindings.length + index + 1}`).join(', ')})`);
      bindings.push(...after);
    }

    const page = await db
      .prepare(
        `SELECT ${table.columns.join(', ')} FROM ${table.name}
         ${conditions.length === 0 ? '' : `WHERE ${conditions.join(' AND ')}`}
         ORDER BY ${order} LIMIT ?${bindings.length + 1}`,
      )
      .bind(...bindings, READ_PAGE)
      .all<Record<string, unknown>>();

    rows.push(...page.results);

    if (page.results.length < READ_PAGE) return rows;

    const last = page.results[page.results.length - 1];

    after = key.map((column) => last[column]);
  }
}

/**
 * Writes any finished day of a `dayColumn` table that R2 does not have.
 *
 * The first run has every day since the table started being written to, and a
 * run after an outage has the days it was down; both are capped, and the rest
 * are written by the runs that follow. Days are found by asking R2 what it
 * holds rather than by remembering, so nothing has to agree with anything.
 */
async function backUpDayAtATime(env: Env, table: TableShape, dayColumn: string, today: string): Promise<number> {
  const earliest = await env.DB.prepare(`SELECT min(${dayColumn}) AS first FROM ${table.name}`).first<{
    first: string | null;
  }>();

  // Nothing written yet. Not a failure - the table may simply be empty so
  // far - and there is no day to write.
  if (earliest?.first == null) return 0;

  // Yesterday, because today is still being written to. A day's file is
  // written once and never revisited, so it may only be written when the day
  // can no longer change.
  const through = previousDay(today);
  let first = dayOf(earliest.first);

  // A day too late to write is left unwritten rather than written late: see
  // `lateDays` on TableShape.
  if (table.lateDays !== undefined) {
    let oldest = through;

    for (let late = 0; late < table.lateDays; late++) oldest = previousDay(oldest);

    if (first < oldest) first = oldest;
  }

  if (first > through) return 0;

  const days = missingDays(first, through, await daysPresent(env.BACKUP, table.name));

  for (const day of days) {
    const { from, to } = dayBounds(day);
    const rows = await readAll(env.DB, table, {
      clause: `${dayColumn} >= ?1 AND ${dayColumn} < ?2`,
      bindings: [from, to],
    });

    await env.BACKUP.put(backupKey(table.name, day), toSql(table, rows, `The day of ${day}, UTC.`));
    console.log(`backup: wrote ${rows.length} rows of ${table.name} for ${day}`);
  }

  if (days.length === MAX_DAYS_PER_RUN) {
    console.warn(`backup: ${table.name} is behind by more than ${MAX_DAYS_PER_RUN} days; the rest follow tomorrow`);
  }

  return days.length;
}

/** Writes a whole table under today's date, replacing any file already there. */
async function backUpWholeTable(env: Env, table: TableShape, now: Date): Promise<number> {
  const today = dayOf(formatTimestamp(now));
  // Two filters, one per issue: `keep` leaves rows out of the file (#223),
  // and withoutStaleApiValues clears columns in the rows that stay (#224).
  const rows = withoutStaleApiValues(table, await readAll(env.DB, table, table.keep?.(now)), now);

  await env.BACKUP.put(
    backupKey(table.name, today),
    toSql(
      table,
      rows,
      table.keep === undefined
        ? `Every row, as of ${today}.`
        : `Every row as of ${today} but the ones #223 keeps out of R2 - see keep in BACKED_UP_TABLES.`,
    ),
  );
  console.log(`backup: wrote ${rows.length} rows of ${table.name} for ${today}`);

  return rows.length;
}

/**
 * How many days `channel.custom_url` and `channel.thumbnail_url` may go
 * without being fetched again before this job clears them from D1 (#224).
 *
 * Both come from the YouTube API, which lets this site keep them for 30 days
 * at most (#222). The collector overwrites them on every run, but only for a
 * channel `Channels.list` returns: one it stops returning keeps its old values
 * for as long as nothing clears them. This job runs once a day, so a value is
 * cleared within a day of passing this age, before it is 28 days old, and the
 * channel goes without an icon and a handle until the collector fetches it
 * again.
 */
export const CHANNEL_API_VALUE_MAX_AGE_DAYS = 27;

/**
 * Clears the YouTube API values of every channel last fetched more than
 * `CHANNEL_API_VALUE_MAX_AGE_DAYS` before `now`, or never, and returns how
 * many rows it cleared. `fetched_at` is left alone: it still says when the
 * channel was last fetched.
 *
 * Here rather than in the collector because this job is the one that runs
 * daily whether or not the YouTube API is answering, and it has to run
 * before the tables are read: it keeps the values out of D1, while
 * `withoutStaleApiValues` keeps younger ones out of the file.
 */
export async function clearStaleChannelApiValues(db: D1Database, now: Date): Promise<number> {
  const cutoff = formatTimestamp(new Date(now.getTime() - CHANNEL_API_VALUE_MAX_AGE_DAYS * 86_400_000));
  const { results } = await db
    .prepare(
      `UPDATE channel SET custom_url = NULL, thumbnail_url = NULL
        WHERE (custom_url IS NOT NULL OR thumbnail_url IS NOT NULL)
          AND (fetched_at IS NULL OR fetched_at < ?1)
        RETURNING channel_id`,
    )
    .bind(cutoff)
    .all<{ channel_id: string }>();

  if (results.length > 0) {
    console.log(`backup: cleared stale API values of ${results.map((row) => row.channel_id).join(', ')}`);
  }

  return results.length;
}

/**
 * The backup job.
 *
 * Each table is written independently and one failing does not stop the
 * others: a backup that carries most of `BACKED_UP_TABLES` is worth more than
 * no backup, and the one that failed is written by the next run.
 *
 * A failure reaches the worker's log, and, since #115, `/api/health` as well:
 * that endpoint's `backup` field reads the bucket's newest key per prefix
 * through `latestDay` in ../lib/backup.ts, built on the same `daysPresent`
 * this job uses to find what is missing. A `collect_task` row of this job's
 * own was the other option; it was not taken, because #115's completion
 * condition is noticing by result rather than by whether a write succeeded,
 * and a `collect_task` row records the latter.
 */
export async function runBackup(env: Env, now: Date = new Date()): Promise<void> {
  const today = dayOf(formatTimestamp(now));

  try {
    await clearStaleChannelApiValues(env.DB, now);
  } catch (error) {
    console.error('backup: clearing stale channel API values failed', error);
  }

  for (const table of BACKED_UP_TABLES) {
    try {
      if (table.dayColumn !== undefined) {
        await backUpDayAtATime(env, table, table.dayColumn, today);
      } else {
        await backUpWholeTable(env, table, now);
      }
    } catch (error) {
      console.error(`backup: ${table.name} failed`, error);
    }
  }
}
