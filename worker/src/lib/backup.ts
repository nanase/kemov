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

import { backupVideoCutoff, R2_RETENTION_DAYS } from './retention';
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

/** What D1 counts, which is bytes of UTF-8 rather than characters. Exported for `publication.byte_length` (footprints-publish.ts), which counts the same way. */
export function byteLength(text: string): number {
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
  /**
   * The column that marks which day a row belongs to, for a table backed up
   * one finished day at a time rather than replaced whole every night (see
   * `backUpDayAtATime` in ../collector/backup.ts). Undefined for a table
   * replaced whole, which is every table below but `channel_snapshot` and
   * `revision`.
   */
  readonly dayColumn?: string;
  /**
   * The file empties the table before it inserts, instead of only adding what
   * is missing. For a table whose rows are one set as a whole - a list a
   * person edits, where a row's absence is itself part of the answer - and
   * not for one that only accumulates: with this set, restoring a file
   * removes every row it does not name, so on a table of records it would
   * throw away whatever was written since. Written even when the table has no
   * rows, since "everything was removed" has to survive a restore too.
   * Meaningful only for a table replaced whole, never one with a `dayColumn`.
   */
  readonly replace?: boolean;
  /**
   * Which rows of a table replaced whole go into its file, given when the
   * file is written: `clause`, a SQL condition for the rows it keeps, and
   * `alarming`, one picking out the rows it leaves out that it should not have
   * had to. Only `video` has one: its values are held to 30 days in R2 as well
   * as in D1 (#223, `BACKUP_VIDEO_MAX_AGE_DAYS` in ./retention.ts), and an
   * available video left out means video-update has fallen behind.
   */
  readonly keep?: (now: Date) => { clause: string; bindings: unknown[]; alarming: string };
  /**
   * For a `dayColumn` table, how many days before yesterday a run may still
   * write when it finds them missing. Unset means as many as are missing, up
   * to `MAX_DAYS_PER_RUN` a run. `channel_snapshot` has 0 (#223): a day
   * written late lives in R2 for as long as one written on time, and its
   * rows are a day older when it starts.
   */
  readonly lateDays?: number;
  /**
   * How many days after the date in its key a file of this table is deleted
   * by the backup job itself, for a table holding YouTube API data (#223).
   * The key names the day written for a table replaced whole, and the day
   * the rows are from for a `dayColumn` table, which is written the day
   * after - hence a day more there. Unset keeps files for the bucket's
   * lifecycle rule alone.
   */
  readonly expireDays?: number;
  /**
   * The table whose row each row here needs, by foreign key, and which of
   * this table's columns name it. A row whose parent the restored database
   * does not have is left out of the restore rather than failing it (#223):
   * retention keeps some parents out of R2 - an unavailable video's copy
   * after 2 days, a snapshot day that was never written or has expired - and
   * the rows pointing at them are still in their tables' files. Without this,
   * a foreign key refusing one row would refuse every row of its statement.
   */
  readonly parent?: { readonly table: string; readonly columns: Readonly<Record<string, string>> };
  /**
   * Columns holding values fetched from the YouTube API, which this site may
   * keep for 30 days at most (#222), and the column saying when they were
   * fetched. A row whose values are older than `BACKED_UP_API_VALUE_MAX_AGE_MS`
   * is written with those columns as NULL - see `withoutStaleApiValues`.
   */
  readonly apiValues?: { readonly columns: readonly string[]; readonly fetchedAt: string };
}

/**
 * The tables the backup carries, and why `collect_task` and `chat_author` are
 * absent.
 *
 * Those two hold where collection has got to, not what it found. Both
 * rebuild themselves from `channel` and `video` within a tick or two, and
 * restoring them would be worse than losing them: a day-old cursor sends the
 * chat job back through a replay it has already read, and a next_attempt_at
 * from yesterday holds back work that is due now.
 */
export const BACKED_UP_TABLES: readonly TableShape[] = [
  // Ordered as a restore has to apply them: a table with a foreign key to
  // another comes after it, so the schema never refuses a row for a parent
  // that is not there yet.
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
      // Added by migrations 0002 and 0004, after this list was first written,
      // and missed here until it was: display_order and twitch are both data
      // a person can now edit through the admin site, with no source but D1
      // to recover either from - see #152 and #144, and
      // docs/reference/data.md.
      'display_order',
      'twitch',
    ],
    conflict: ['channel_id'],
    apiValues: { columns: ['custom_url', 'thumbnail_url'], fetchedAt: 'fetched_at' },
    expireDays: R2_RETENTION_DAYS,
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
      'last_available_at',
    ],
    conflict: ['video_id'],
    // An unavailable video's values are from its last_available_at, and a
    // NULL there is unknown, so left out.
    keep: (now) => ({
      clause: `(CASE WHEN availability = 'unavailable' THEN last_available_at ELSE fetched_at END) >= ?1`,
      bindings: [backupVideoCutoff(now)],
      alarming: `availability <> 'unavailable'`,
    }),
    expireDays: R2_RETENTION_DAYS,
  },
  {
    name: 'channel_snapshot',
    columns: ['channel_id', 'fetched_at', 'subscriber_count', 'view_count', 'video_count'],
    conflict: ['channel_id', 'fetched_at'],
    dayColumn: 'fetched_at',
    lateDays: 0,
    expireDays: R2_RETENTION_DAYS + 1,
  },
  {
    name: 'channel_snapshot_exclusion',
    columns: ['channel_id', 'fetched_at', 'reason', 'created_at'],
    conflict: ['channel_id', 'fetched_at'],
    parent: { table: 'channel_snapshot', columns: { channel_id: 'channel_id', fetched_at: 'fetched_at' } },
  },
  {
    name: 'video_override',
    columns: ['video_id', 'title', 'type', 'availability', 'memo', 'updated_at'],
    conflict: ['video_id'],
    parent: { table: 'video', columns: { video_id: 'video_id' } },
  },
  {
    // A list a person edits by hand (#175), so nothing but this file can bring
    // it back. A restore applies the migrations first, and migration 0008
    // seeds the original 13 rows. A prefix somebody removed since is not in
    // the file, so DO NOTHING alone would leave the seeded copy in place and
    // the restored list would accept a source the backed-up one refused: it
    // is a gate on what gets published. `replace` empties the table first.
    name: 'source_whitelist',
    columns: ['prefix', 'note', 'created_at', 'updated_at'],
    conflict: ['prefix'],
    replace: true,
  },
  {
    name: 'footprints_event',
    columns: [
      'event_id',
      'date_precision',
      'start_date',
      'starts_at',
      'end_date',
      'kind',
      'emphasized',
      'title',
      'place',
      'supplement',
      'video_id',
      'source_pending',
      'status',
      'memo',
      'created_via',
      'created_at',
      'updated_at',
    ],
    conflict: ['event_id'],
  },
  {
    name: 'footprints_event_member',
    columns: ['event_id', 'channel_id'],
    conflict: ['event_id', 'channel_id'],
  },
  {
    name: 'footprints_event_source',
    columns: ['event_id', 'position', 'url', 'title'],
    conflict: ['event_id', 'position'],
  },
  // After channel and footprints_event, which it names by foreign key (#225).
  {
    name: 'subscriber_milestone',
    columns: [
      'milestone_id',
      'channel_id',
      'date_precision',
      'reached_date',
      'subscriber_count',
      'announced_by',
      'event_id',
      'status',
      'memo',
      'created_via',
      'created_at',
      'updated_at',
    ],
    conflict: ['milestone_id'],
  },
  {
    name: 'subscriber_milestone_source',
    columns: ['milestone_id', 'position', 'url', 'title'],
    conflict: ['milestone_id', 'position'],
  },
  {
    name: 'genet_person',
    columns: ['person_id', 'name', 'link', 'memo'],
    conflict: ['person_id'],
  },
  {
    name: 'genet_tune',
    columns: ['tune_id', 'title', 'original_title', 'subtunes', 'memo'],
    conflict: ['tune_id'],
  },
  {
    name: 'genet_tune_attribute',
    columns: ['tune_id', 'position', 'name', 'text'],
    conflict: ['tune_id', 'position'],
  },
  {
    name: 'genet_tune_attribute_person',
    columns: ['tune_id', 'attribute_position', 'position', 'person_id', 'credited_as', 'note'],
    conflict: ['tune_id', 'attribute_position', 'position'],
  },
  {
    name: 'genet_tune_video',
    columns: ['tune_id', 'position', 'video_id', 'title', 'start_seconds', 'description'],
    conflict: ['tune_id', 'position'],
  },
  {
    name: 'genet_tune_score',
    columns: ['tune_id', 'position', 'url', 'title'],
    conflict: ['tune_id', 'position'],
  },
  {
    name: 'genet_stream',
    columns: [
      'video_id',
      'platform',
      'url',
      'video_type',
      'title',
      'short_title',
      'published_at',
      'categories',
      'keywords',
      'status',
      'memo',
      'created_via',
      'created_at',
      'updated_at',
    ],
    conflict: ['video_id'],
  },
  {
    name: 'genet_performance',
    columns: ['video_id', 'position', 'tune_id', 'description'],
    conflict: ['video_id', 'position'],
  },
  {
    name: 'genet_scene',
    columns: ['video_id', 'position', 'scene_position', 'style', 'scene_video_id', 'start_seconds'],
    conflict: ['video_id', 'position', 'scene_position'],
  },
  // Before publication, which references it by revision_id: applying
  // publication's file first would refuse a row whose revision is not there
  // yet.
  {
    name: 'revision',
    columns: ['revision_id', 'entity', 'entity_key', 'action', 'body', 'created_via', 'created_at'],
    conflict: ['revision_id'],
    dayColumn: 'created_at',
  },
  {
    name: 'publication',
    columns: ['publication_id', 'target', 'last_revision_id', 'object_key', 'byte_length', 'published_at'],
    conflict: ['publication_id'],
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
  const { opening, closing } = statementEnds(table);
  const fixed = byteLength(opening) + byteLength(closing);

  // Ahead of every INSERT of this table, so that whichever statement a
  // restore reaches first, the rows it adds land in an emptied table.
  const statements: string[] = table.replace === true ? [`DELETE FROM ${table.name};`] : [];
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
    `--   bun wrangler d1 execute kemov --remote --file <this file>`,
    '--',
    '-- Apply tables in the order BACKED_UP_TABLES lists them: a table with a',
    '-- foreign key to another must be applied after it. Applying a file more',
    '-- than once changes nothing.',
    ...(table.parent !== undefined
      ? [
          '--',
          `-- A row whose ${table.parent.table} row is not in the database is skipped, not`,
          '-- refused: retention keeps some of those out of the backup (#223).',
        ]
      : []),
    ...(table.replace === true
      ? [
          '--',
          `-- This file REPLACES ${table.name}: it deletes every row there first, so apply`,
          '-- only the newest file of the table, not one after another.',
        ]
      : []),
    '',
    ...statements,
    '',
  ].join('\n');
}

/**
 * What goes before and after the rows of one INSERT.
 *
 * A table with a `parent` selects its rows out of a VALUES list, so that
 * the EXISTS can leave out the ones whose parent is not there. SQLite names
 * the columns of a VALUES list column1, column2 and so on, in order.
 */
function statementEnds(table: TableShape): { opening: string; closing: string } {
  const conflict = `ON CONFLICT (${table.conflict.join(', ')}) DO NOTHING;`;
  const into = `INSERT INTO ${table.name} (${table.columns.join(', ')})`;

  if (table.parent === undefined) return { opening: `${into}\nVALUES\n`, closing: `\n${conflict}` };

  const matches = Object.entries(table.parent.columns)
    .map(([column, parentColumn]) => `p.${parentColumn} = v.column${table.columns.indexOf(column) + 1}`)
    .join(' AND ');

  return {
    opening: `${into}\nSELECT * FROM (VALUES\n`,
    closing: `\n) AS v\nWHERE EXISTS (SELECT 1 FROM ${table.parent.table} p WHERE ${matches})\n${conflict}`,
  };
}

/**
 * How old a YouTube API value may be and still be written into a backup file
 * (#224).
 *
 * The 30 days #222 allows have to cover the file's whole life, not only the
 * value's age when it is written. The file itself is kept for 27 days and R2
 * deletes it up to a day after that (docs/reference/data.md, "保持期間"),
 * which leaves one day for the value's age at writing. The collector
 * refreshes these values on every run, so a value older than a day is one it
 * has stopped refreshing - a channel `Channels.list` no longer returns, or an
 * outage - and the file is written without it. The cost falls only on a
 * restore, which gets NULL there until the collector next writes the
 * channel.
 */
export const BACKED_UP_API_VALUE_MAX_AGE_MS = 86_400_000;

/**
 * `rows` with `table.apiValues`'s columns set to NULL wherever they were
 * fetched longer than `BACKED_UP_API_VALUE_MAX_AGE_MS` before `now`, or at no
 * recorded time at all: a value with no fetch time cannot be shown to be
 * recent. Rows of a table without `apiValues` come back unchanged.
 */
export function withoutStaleApiValues(
  table: TableShape,
  rows: readonly Record<string, unknown>[],
  now: Date,
): Record<string, unknown>[] {
  const { apiValues } = table;

  if (apiValues === undefined) return [...rows];

  const cutoff = formatTimestamp(new Date(now.getTime() - BACKED_UP_API_VALUE_MAX_AGE_MS));

  return rows.map((row) => {
    const fetchedAt = row[apiValues.fetchedAt];

    if (typeof fetchedAt === 'string' && fetchedAt >= cutoff) return row;

    return { ...row, ...Object.fromEntries(apiValues.columns.map((column) => [column, null])) };
  });
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

/**
 * The days of `present` whose files have reached `expireDays` by `today`,
 * oldest first: the ones the backup job deletes (#223).
 */
export function expiredDays(present: Iterable<string>, today: string, expireDays: number): string[] {
  return [...present].filter((day) => daysBetween(day, today) >= expireDays).sort();
}

/**
 * The custom metadata a file of a table with `keep` carries: how many rows
 * the file left out, and how many of those it should not have had to.
 * `/api/health` reads it back from the newest file rather than from a record
 * of its own, which is the same choice #115 made for the backup's dates.
 */
export const OMITTED_METADATA = { omitted: 'omitted', alarming: 'omitted-alarming' } as const;

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
 * Raw, not adjusted for what a table's newest file is expected to be: a table
 * with a `dayColumn` (see `BACKED_UP_TABLES`) writes yesterday's day even when
 * nothing is wrong, so a healthy value here is 0 for a table replaced whole
 * and 1 for `channel_snapshot` or `revision`. Reading that difference against
 * a threshold is `isBackupStale` in ./health-thresholds.ts (#110), not this
 * function.
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
