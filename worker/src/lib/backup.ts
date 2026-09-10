/**
 * Turning what D1 holds into something that can be put back.
 *
 * Almost every function here is pure: no D1, no R2, no clock of its own. The
 * job that reads and writes is ../collector/backup.ts, the same split the
 * collectors use, and it is what lets the round trip be tested without either
 * service. `daysPresent` and `latestDay` are the exception - they read R2 -
 * and live here anyway because #115 has both ../collector/backup.ts and
 * ../api/health.ts calling them, and neither is a place the other may import
 * from.
 *
 * The output is SQL rather than a data format, because the completion
 * condition for #111 is being able to restore rather than being able to
 * export. SQL restores with `wrangler d1 execute --file` and nothing else,
 * and that is the path #67 already took to put 6,433 rows into this database.
 * A format of our own would need a program of our own to read it, and the
 * moment that program is needed is the moment nothing else is working.
 */

import { formatTimestamp } from './time';

/** A string literal with its quotes doubled, or NULL. */
export function quote(value: unknown): string {
  return value === null || value === undefined ? 'NULL' : `'${String(value).replaceAll("'", "''")}'`;
}

/**
 * A number unquoted, anything else quoted.
 *
 * The tables are STRICT, so a count written as '12' is text offered to an
 * INTEGER column and 'NULL' is the four-letter word rather than the absence.
 *
 * This repeats scripts/sql.js. That one is plain JavaScript so that node can
 * run it with no build step, this one is TypeScript for workerd, and neither
 * can import the other. What they share is the SQL, which is not either
 * file's to change alone.
 */
export function literal(value: unknown): string {
  return typeof value === 'number' ? String(value) : quote(value);
}

/**
 * How many rows one INSERT names, at most.
 *
 * The same 200 that scripts/legacy-videos.js chose, and for the same reasons:
 * a statement per row is thousands of round trips, and a statement per file is
 * a single line of megabytes. That figure has since carried 6,433 rows into
 * this database, so it is a measured number rather than a guessed one.
 */
export const ROWS_PER_STATEMENT = 200;

/**
 * How many bytes one INSERT may reach, whichever cap it meets first.
 *
 * D1 refuses a statement over 100,000 bytes, and a row cap does not bound
 * bytes. Measured over the 6,433 rows of `video` in production on 2026-09-08:
 * batches of 200 reach 73,687 bytes in the primary-key order this reads them
 * in, and 86,890 bytes over the same rows grouped another way. The margin is
 * a property of how rows happen to fall into batches rather than of how many
 * there are, titles run to 289 bytes against an average of 127, and `video`
 * only grows.
 *
 * What makes that worth capping rather than watching is when it would be
 * found. The job writing the file would not notice; D1 would refuse the
 * statement at the moment somebody was restoring from it.
 */
export const BYTES_PER_STATEMENT = 80_000;

const encoder = new TextEncoder();

/** What D1 counts, which is bytes of UTF-8 rather than characters. */
function byteLength(text: string): number {
  return encoder.encode(text).length;
}

/** A table as the backup writes it: what to select, and what a repeat means. */
export interface TableShape {
  /** The table's name, in the SQL and in the R2 key. */
  readonly name: string;
  /** Every column, in the order the INSERT names them. */
  readonly columns: readonly string[];
  /** The primary key, for ON CONFLICT. */
  readonly conflict: readonly string[];
}

/**
 * The three tables the backup carries, and why the other two are absent.
 *
 * `collect_task` and `chat_author` hold where collection has got to, not what
 * it found. Both rebuild themselves from `channel` and `video` within a tick
 * or two, and restoring them would be worse than losing them: a day-old
 * cursor sends the chat job back through a replay it has already read, and a
 * next_attempt_at from yesterday holds back work that is due now.
 */
export const BACKED_UP_TABLES: readonly TableShape[] = [
  // Ordered as a restore has to apply them. video and channel_snapshot both
  // carry a foreign key to channel, and the schema refuses a row whose
  // channel is not there yet.
  {
    name: 'channel',
    columns: [
      'channel_id',
      'name',
      'fullname',
      'globalname',
      'twitter',
      'color_key',
      'color_sub',
      'color_light',
      'color_back',
      'activity_start_date',
      'activity_end_date',
      'custom_url',
      'thumbnail_url',
      'fetched_at',
    ],
    conflict: ['channel_id'],
  },
  {
    name: 'video',
    columns: [
      'video_id',
      'channel_id',
      'title',
      'published_at',
      'availability',
      'live_broadcast_content',
      'type',
      'duration_seconds',
      'view_count',
      'like_count',
      'comment_count',
      'chat_message_count',
      'chat_unique_user_count',
      'scheduled_start_time',
      'actual_start_time',
      'actual_end_time',
      'fetched_at',
    ],
    conflict: ['video_id'],
  },
  {
    name: 'channel_snapshot',
    columns: ['channel_id', 'fetched_at', 'subscriber_count', 'view_count', 'video_count'],
    conflict: ['channel_id', 'fetched_at'],
  },
];

/**
 * The SQL for some rows of one table.
 *
 * ON CONFLICT DO NOTHING throughout, so that applying a file twice is the same
 * as applying it once. A restore is not a calm operation and the person doing
 * it should not have to remember which files they have already run.
 */
export function toSql(table: TableShape, rows: readonly Record<string, unknown>[], note: string): string {
  const opening = `INSERT INTO ${table.name} (${table.columns.join(', ')})\nVALUES\n`;
  const closing = `\nON CONFLICT (${table.conflict.join(', ')}) DO NOTHING;`;
  const fixed = byteLength(opening) + byteLength(closing);

  const statements: string[] = [];
  let batch: string[] = [];
  let bytes = fixed;

  for (const row of rows) {
    const tuple = `  (${table.columns.map((column) => literal(row[column])).join(', ')})`;
    const alone = fixed + byteLength(tuple);

    // A row that does not fit even by itself. Nothing here can split it, so
    // the choice is between a file carrying a statement D1 will refuse and no
    // file at all, and the file is worse: it looks like a backup, and a
    // restore that reaches that statement stops there with the rows after it
    // unapplied. Failing instead leaves yesterday's file, which is a day old
    // and works, and says which row it was rather than failing silently.
    if (alone > BYTES_PER_STATEMENT) {
      const key = table.conflict.map((column) => String(row[column])).join(', ');

      throw new Error(`backup: one row of ${table.name} (${key}) is ${alone} bytes of SQL on its own`);
    }

    // The ",\n" joining this tuple to the one before it, which the first
    // tuple of a batch does not have.
    const size = byteLength(tuple) + (batch.length === 0 ? 0 : 2);

    if (batch.length > 0 && (batch.length >= ROWS_PER_STATEMENT || bytes + size > BYTES_PER_STATEMENT)) {
      statements.push(opening + batch.join(',\n') + closing);
      batch = [];
      bytes = fixed + byteLength(tuple);
    } else {
      bytes += size;
    }

    batch.push(tuple);
  }

  if (batch.length > 0) statements.push(opening + batch.join(',\n') + closing);

  // The header is for whoever opens this while something is broken. It says
  // what the file is and the one command that puts it back, so that reading
  // the file is enough and no other document has to be found first.
  return [
    `-- ${rows.length} rows of ${table.name}. ${note}`,
    '-- Written by the backup job in worker/src/collector/backup.ts (#111).',
    '--',
    '-- Restore with:',
    `--   yarn wrangler d1 execute kemov --remote --file <this file>`,
    '--',
    '-- Apply channel before video and channel_snapshot: both carry a foreign',
    '-- key to it. Applying a file more than once changes nothing.',
    '',
    ...statements,
    '',
  ].join('\n');
}

/** The R2 key one day of one table is written to. */
export function backupKey(tableName: string, date: string): string {
  return `${tableName}/${date}.sql`;
}

/**
 * The date part of a key backupKey produced, or null if it made no key.
 *
 * The bucket is not only written by backupKey: a stray object under the same
 * prefix - a typo left over from checking the bucket by hand, say - must not
 * be read back as a date. The regex alone would accept '2026-02-31', which
 * Date rolls over into 2026-03-03 rather than refusing, so the round trip
 * through midnight and back is what actually proves the calendar day is
 * real.
 */
export function dateFromKey(tableName: string, key: string): string | null {
  const prefix = `${tableName}/`;

  if (!key.startsWith(prefix) || !key.endsWith('.sql')) return null;

  const date = key.slice(prefix.length, -'.sql'.length);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;

  return dayOf(formatTimestamp(midnight(date))) === date ? date : null;
}

/**
 * The days one table already has a file for in R2.
 *
 * Read from the bucket rather than remembered anywhere, so nothing has to
 * agree with anything (#115's decision on the bucket over `collect_task`: an
 * R2 listing cannot go stale the way `collect_task` rows can, because it is
 * the write itself rather than a record of having written).
 *
 * Shared by the backup job, which uses it to find what is missing, and by
 * `/api/health`, which uses it to find what is newest.
 */
export async function daysPresent(bucket: R2Bucket, tableName: string): Promise<Set<string>> {
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

/** The newest day one table has a file for in R2, or null if it has none. */
export async function latestDay(bucket: R2Bucket, tableName: string): Promise<string | null> {
  let latest: string | null = null;

  for (const day of await daysPresent(bucket, tableName)) {
    if (latest === null || day > latest) latest = day;
  }

  return latest;
}

/**
 * How many days after `date` the given `today` is, both UTC calendar days.
 *
 * Raw, not adjusted for what a table's newest file is expected to be:
 * `channel_snapshot` writes yesterday's day even when nothing is wrong (see
 * `BACKED_UP_TABLES`), so a healthy value here is 0 for `channel`/`video` and
 * 1 for `channel_snapshot`. Reading that difference belongs to whoever
 * decides a threshold (#110), not to this function.
 */
export function daysBetween(date: string, today: string): number {
  return Math.round((midnight(today).getTime() - midnight(date).getTime()) / 86_400_000);
}

/** The UTC day an instant falls in. */
export function dayOf(instant: string): string {
  return instant.slice(0, 10);
}

/** Midnight of a UTC day, as a Date. */
function midnight(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

/**
 * The instants a UTC day covers, as the schema spells them.
 *
 * Half open: the instant midnight names belongs to the day that starts rather
 * than the one that ends, so no snapshot falls in two files or in neither.
 *
 * Through formatTimestamp like every other instant this code compares against
 * a fetched_at, rather than being assembled here out of string pieces.
 */
export function dayBounds(date: string): { from: string; to: string } {
  const start = midnight(date);

  return { from: formatTimestamp(start), to: formatTimestamp(new Date(start.getTime() + 86400 * 1000)) };
}

/**
 * How many days one run may write.
 *
 * A cap rather than "whatever is missing", because what is missing is
 * unbounded: nothing has run for a fortnight is a state this has to survive,
 * and reading a fortnight of snapshots in one invocation is how it would
 * fail to. Missing days are written oldest first and the rest wait for the
 * next run, so a gap closes at a bounded rate instead of not at all.
 */
export const MAX_DAYS_PER_RUN = 7;

/**
 * The days that still need writing, oldest first.
 *
 * `present` is what R2 already holds, which is the only record of what has
 * been written. Nothing is remembered anywhere else on purpose: a note in D1
 * saying a day was written could outlive the write that failed, and the day
 * it names would never be written again.
 */
export function missingDays(earliest: string, through: string, present: ReadonlySet<string>): string[] {
  const days: string[] = [];

  for (let day = earliest; day <= through; day = nextDay(day)) {
    if (!present.has(day)) days.push(day);

    if (days.length === MAX_DAYS_PER_RUN) break;
  }

  return days;
}

/** The day after this one, in UTC. */
export function nextDay(date: string): string {
  return dayOf(formatTimestamp(new Date(midnight(date).getTime() + 86400 * 1000)));
}

/** The day before this one, in UTC. */
export function previousDay(date: string): string {
  return dayOf(formatTimestamp(new Date(midnight(date).getTime() - 86400 * 1000)));
}
