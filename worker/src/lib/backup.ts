/**
 * Turning what D1 holds into something that can be put back.
 *
 * Every function here is pure: no D1, no R2, no clock of its own. The job that
 * reads and writes is ../collector/backup.ts, the same split the collectors
 * use, and it is what lets the round trip be tested without either service.
 *
 * The output is SQL rather than a data format, because the completion
 * condition for #111 is being able to restore rather than being able to
 * export. SQL restores with `wrangler d1 execute --file` and nothing else,
 * and that is the path #67 already took to put 6,433 rows into this database.
 * A format of our own would need a program of our own to read it, and the
 * moment that program is needed is the moment nothing else is working.
 */

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
 * How many rows one INSERT names.
 *
 * The same 200 that scripts/legacy-videos.js chose, and for the same reasons:
 * a statement per row is thousands of round trips, and a statement per file is
 * a single line of megabytes. That figure has since carried 6,433 rows into
 * this database, so it is a measured number rather than a guessed one.
 */
export const ROWS_PER_STATEMENT = 200;

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
  const statements: string[] = [];

  for (let index = 0; index < rows.length; index += ROWS_PER_STATEMENT) {
    const values = rows
      .slice(index, index + ROWS_PER_STATEMENT)
      .map((row) => `  (${table.columns.map((column) => literal(row[column])).join(', ')})`);

    statements.push(
      [
        `INSERT INTO ${table.name} (${table.columns.join(', ')})`,
        'VALUES',
        values.join(',\n'),
        `ON CONFLICT (${table.conflict.join(', ')}) DO NOTHING;`,
      ].join('\n'),
    );
  }

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

/** The date part of a key backupKey produced, or null if it made no key. */
export function dateFromKey(tableName: string, key: string): string | null {
  const prefix = `${tableName}/`;

  if (!key.startsWith(prefix) || !key.endsWith('.sql')) return null;

  const date = key.slice(prefix.length, -'.sql'.length);

  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

/** The UTC day an instant falls in. */
export function dayOf(instant: string): string {
  return instant.slice(0, 10);
}

/** The instants a UTC day covers, as the schema spells them. */
export function dayBounds(date: string): { from: string; to: string } {
  const start = new Date(`${date}T00:00:00Z`);
  const next = new Date(start.getTime() + 86400 * 1000);

  return { from: `${date}T00:00:00Z`, to: `${next.toISOString().slice(0, 10)}T00:00:00Z` };
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
  return new Date(new Date(`${date}T00:00:00Z`).getTime() + 86400 * 1000).toISOString().slice(0, 10);
}

/** The day before this one, in UTC. */
export function previousDay(date: string): string {
  return new Date(new Date(`${date}T00:00:00Z`).getTime() - 86400 * 1000).toISOString().slice(0, 10);
}
