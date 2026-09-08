import type { Env } from '../lib/env';
import {
  BACKED_UP_TABLES,
  backupKey,
  dateFromKey,
  dayBounds,
  dayOf,
  MAX_DAYS_PER_RUN,
  missingDays,
  previousDay,
  toSql,
  type TableShape,
} from '../lib/backup';
import { formatTimestamp } from '../lib/time';

/**
 * Writing D1 out to R2, so that #72 can take the old system away (#111).
 *
 * Two shapes, because the tables are two shapes.
 *
 * `channel` and `video` are replaced in place: a few thousand rows whose
 * current values are the whole story, so each run writes the lot and the
 * newest file is a complete copy. `channel_snapshot` is not. It is append
 * only - a row at (channel_id, fetched_at) is written once and never touched
 * again - and it grows by 1,584 rows a day for ever. Writing all of it each
 * run would work today, at some 1,700 rows, and would stop working on a day
 * nobody chose. So a finished day is written once, as its own file, and the
 * work of one run stays the size of one day however long the table gets.
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

/** The days already in R2 for one table. */
async function daysPresent(bucket: R2Bucket, tableName: string): Promise<Set<string>> {
  const present = new Set<string>();
  let cursor: string | undefined;

  for (;;) {
    const listed = await bucket.list({ prefix: `${tableName}/`, cursor });

    for (const object of listed.objects) {
      const date = dateFromKey(tableName, object.key);

      if (date !== null) present.add(date);
    }

    if (!listed.truncated) return present;

    cursor = listed.cursor;
  }
}

/** The table the day-at-a-time rule applies to. */
const SNAPSHOT = BACKED_UP_TABLES.find((table) => table.name === 'channel_snapshot');

/**
 * Writes any finished day of `channel_snapshot` that R2 does not have.
 *
 * The first run has every day since collection began to write, and a run after
 * an outage has the days it was down; both are capped, and the rest are
 * written by the runs that follow. Days are found by asking R2 what it holds
 * rather than by remembering, so nothing has to agree with anything.
 */
async function backUpSnapshots(env: Env, today: string): Promise<number> {
  if (SNAPSHOT === undefined) throw new Error('channel_snapshot is not in BACKED_UP_TABLES');

  const earliest = await env.DB.prepare('SELECT min(fetched_at) AS first FROM channel_snapshot').first<{
    first: string | null;
  }>();

  // Nothing collected yet. Not a failure - the collector may simply not have
  // run - and there is no day to write.
  if (earliest?.first == null) return 0;

  // Yesterday, because today is still being written to. A day's file is
  // written once and never revisited, so it may only be written when the day
  // can no longer change.
  const through = previousDay(today);
  const first = dayOf(earliest.first);

  if (first > through) return 0;

  const days = missingDays(first, through, await daysPresent(env.BACKUP, SNAPSHOT.name));

  for (const day of days) {
    const { from, to } = dayBounds(day);
    const rows = await readAll(env.DB, SNAPSHOT, {
      clause: 'fetched_at >= ?1 AND fetched_at < ?2',
      bindings: [from, to],
    });

    await env.BACKUP.put(backupKey(SNAPSHOT.name, day), toSql(SNAPSHOT, rows, `The day of ${day}, UTC.`));
    console.log(`backup: wrote ${rows.length} rows of ${SNAPSHOT.name} for ${day}`);
  }

  if (days.length === MAX_DAYS_PER_RUN) {
    console.warn(`backup: ${SNAPSHOT.name} is behind by more than ${MAX_DAYS_PER_RUN} days; the rest follow tomorrow`);
  }

  return days.length;
}

/** Writes a whole table under today's date, replacing any file already there. */
async function backUpWholeTable(env: Env, table: TableShape, today: string): Promise<number> {
  const rows = await readAll(env.DB, table);

  await env.BACKUP.put(backupKey(table.name, today), toSql(table, rows, `Every row, as of ${today}.`));
  console.log(`backup: wrote ${rows.length} rows of ${table.name} for ${today}`);

  return rows.length;
}

/**
 * The backup job.
 *
 * Each table is written independently and one failing does not stop the
 * others: a backup that carries two tables of three is worth more than no
 * backup, and the one that failed is written by the next run.
 *
 * A failure reaches the worker's log and nothing else. /api/health reports a
 * job by reading its own `collect_task` rows (see the JOBS list in
 * ../api/health.ts), and this job writes none, so a backup that fails every
 * night looks the same from outside as one that works. Whoever gives this job
 * a place there has to give it something to read: either rows of its own,
 * which needs the kind CHECK in migrations/0001 widened, or the bucket's
 * newest key per prefix, which is the record this job already keeps.
 */
export async function runBackup(env: Env, now: Date = new Date()): Promise<void> {
  const today = dayOf(formatTimestamp(now));

  for (const table of BACKED_UP_TABLES) {
    try {
      if (table.name === SNAPSHOT?.name) {
        await backUpSnapshots(env, today);
      } else {
        await backUpWholeTable(env, table, today);
      }
    } catch (error) {
      console.error(`backup: ${table.name} failed`, error);
    }
  }
}
