/**
 * Turns the old system's per-channel video JSON into rows the `video` table
 * accepts.
 *
 * The old data is not simply a different spelling of the new schema. Some of
 * its columns are wrong and are deliberately dropped rather than carried
 * across - see #63's audit, and the notes on each rule below. What survives is
 * what the old system observed: what a video is called, when it was published,
 * whether it could be watched, its counts and its stream times.
 *
 * Nothing here decides what a video *is*. `type` and `duration_seconds` are
 * left for the collector, whose rules live in worker/src/lib/video.ts, because
 * a second copy of them here would be a second answer to the same question.
 */

/** The four spellings the schema's availability CHECK accepts. */
const AVAILABILITY = ['public', 'membership', 'private', 'unavailable'];

/**
 * The columns written for a migrated row, in the order the generated SQL uses.
 *
 * `live_broadcast_content`, `type` and `duration_seconds` are here with fixed
 * values rather than absent, because a column left out of the INSERT would
 * take the schema's default and the point is to say what is being written.
 */
export const VIDEO_COLUMNS = [
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
];

/**
 * Whether a value is the old system's way of saying it has no value.
 *
 * There are two spellings and both are in the data: -1 in the count columns,
 * where the old system gave up fetching, and the empty string nearly
 * everywhere else. Measured across all 11 channels, -1 appears in 2,016 rows
 * and the empty string in the three stream-time columns of about 275 each.
 *
 * Both have to become NULL. The tables are STRICT, so '' in an INTEGER column
 * is refused outright, and the counts carry a CHECK for zero or more, which -1
 * fails. NULL is what the schema means by "no value" - see its comment saying
 * a missing measurement is never -1 and never ''.
 */
function isMissing(value) {
  return value === undefined || value === null || value === '' || value === -1;
}

/**
 * One of the counts, or null.
 *
 * Anything that is not a whole number of zero or more is null rather than a
 * value the CHECK would refuse. A row is better missing a count than not
 * written at all.
 */
export function toCount(value) {
  if (isMissing(value)) return null;

  const count = Number(value);

  return Number.isInteger(count) && count >= 0 ? count : null;
}

/**
 * An instant in the one shape every timestamp column accepts,
 * 'YYYY-MM-DDTHH:MM:SSZ', or null.
 *
 * This repeats worker/src/lib/time.ts' toSchemaTimestamp on purpose. That one
 * is TypeScript for workerd and this runs as plain node, so neither can import
 * the other; what they share is the schema, which defines the shape both are
 * converting to. The rule is short enough that stating it twice is cheaper
 * than a build step to share it.
 *
 * Most of the old data is already in this shape - measured, every publishedAt
 * and every non-empty stream time - but fetchedAt carries milliseconds, and
 * the old system is still writing, so nothing here assumes the shape holds.
 */
export function toTimestamp(value) {
  if (isMissing(value)) return null;

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : `${date.toISOString().slice(0, 19)}Z`;
}

/**
 * One legacy record as a row, or a reason it cannot be one.
 *
 * Returns `{ row }` or `{ skipped: <reason> }`. A record that cannot supply a
 * NOT NULL column is skipped rather than guessed at: a guess would be
 * indistinguishable from an observation when #66 compares this data with what
 * the collector fetches, and the point of the comparison is to tell those
 * apart. One record in the measured data is in this state - availability and
 * fetchedAt both empty, published the day before - and the collector reaches
 * it anyway, because a video that new is on the first page of its channel's
 * uploads playlist.
 */
export function toVideoRow(record, channelId) {
  const videoId = record.videoId;

  if (typeof videoId !== 'string' || videoId === '') return { skipped: 'no videoId' };
  if (typeof record.title !== 'string' || record.title === '') return { skipped: 'no title' };

  const publishedAt = toTimestamp(record.publishedAt);

  if (publishedAt === null) return { skipped: 'no publishedAt' };

  const fetchedAt = toTimestamp(record.fetchedAt);

  if (fetchedAt === null) return { skipped: 'no fetchedAt' };
  if (!AVAILABILITY.includes(record.availability)) return { skipped: 'no availability' };

  return {
    row: {
      video_id: videoId,
      channel_id: channelId,
      title: record.title,
      published_at: publishedAt,
      // Carried across as observed. The old system learned 'private' by
      // scraping, which Videos.list cannot tell from a deletion, so this is
      // the one availability the collector will never write itself.
      availability: record.availability,

      // Not carried across. The old collector left the live fields untouched
      // for a video it could not fetch, so 15 of the 16 deleted or private
      // videos in #58's audit still read 'live' or 'upcoming'. Moving that
      // across would reinstate as data the defect #63 removed as code. The
      // collector's next sweep says what is really live.
      live_broadcast_content: 'none',

      // Left for the collector. The old getVideoType never revisited a type
      // once set, which is why 12 of 197 videos of a minute or less are not
      // shorts there, and the duration of a stream that had not finished is
      // recorded as 'P0D' - a real zero that would claim the video lasted no
      // time. Both are decided by worker/src/lib/video.ts on the next sweep.
      type: null,
      duration_seconds: null,

      view_count: toCount(record.viewCount),
      like_count: toCount(record.likeCount),
      comment_count: toCount(record.commentCount),

      // The entry point for #68: #65 collects chat for finished streams whose
      // chat_message_count IS NULL, so the 2,016 rows the old system gave up
      // on arrive already queued for it by being null rather than -1.
      chat_message_count: toCount(record.chatMessageCount),
      chat_unique_user_count: toCount(record.chatUniqueUserCount),

      scheduled_start_time: toTimestamp(record.scheduledStartTime),
      actual_start_time: toTimestamp(record.actualStartTime),
      actual_end_time: toTimestamp(record.actualEndTime),

      // The old fetched_at, never the time of the migration. video-update
      // sweeps oldest first, so one shared timestamp would put every migrated
      // row at the back of the queue in an order unrelated to how stale it is.
      // The measured spread runs from 2023-11-30 to the present day, which is
      // exactly the order the sweep should take them in.
      fetched_at: fetchedAt,
    },
  };
}

function quote(value) {
  return value === null || value === undefined ? 'NULL' : `'${String(value).replaceAll("'", "''")}'`;
}

function literal(value) {
  return typeof value === 'number' ? String(value) : quote(value);
}

/**
 * How many rows one INSERT names.
 *
 * One statement for a whole channel would be a single line of over a megabyte
 * for the largest of them; one statement per row would be thousands of
 * round trips. Neither number is a limit anything documents, so this sits well
 * inside both.
 */
export const ROWS_PER_STATEMENT = 200;

/**
 * The SQL for one channel's rows.
 *
 * ON CONFLICT DO NOTHING, never an upsert. The collector has been running
 * since #85 deployed and already holds the newest videos of every channel with
 * their live state and type worked out; an upsert would overwrite exactly
 * those with the older, deliberately blanked values above. Filling only the
 * gaps also makes re-running this safe, which is what a migration that can be
 * interrupted needs.
 */
export function rowsToSql(rows, channelId, source) {
  const statements = [];

  for (let index = 0; index < rows.length; index += ROWS_PER_STATEMENT) {
    const values = rows
      .slice(index, index + ROWS_PER_STATEMENT)
      .map((row) => `  (${VIDEO_COLUMNS.map((column) => literal(row[column])).join(', ')})`);

    statements.push(
      [
        `INSERT INTO video (${VIDEO_COLUMNS.join(', ')})`,
        'VALUES',
        `${values.join(',\n')}`,
        'ON CONFLICT (video_id) DO NOTHING;',
      ].join('\n'),
    );
  }

  return [
    `-- ${rows.length} videos for ${channelId}, from ${source}.`,
    '-- Generated by scripts/build-video-migration-sql.js. Do not edit.',
    '',
    ...statements,
    '',
  ].join('\n');
}

/**
 * Every row one channel's legacy file yields, and what it could not yield.
 *
 * A channel is converted whole or not at all. #63's video-discover reads only
 * the newest page of an uploads playlist and decides whether the archive is
 * present by whether that page overlaps what is stored; a channel left with
 * only its newest videos would make that overlap real while the rest of its
 * history is still missing, and the warning meant to catch exactly that would
 * fall silent.
 */
export function convertChannel(records, channelId) {
  const rows = [];
  const skipped = [];

  for (const record of records) {
    const result = toVideoRow(record, channelId);

    if (result.row) rows.push(result.row);
    else skipped.push({ channelId, reason: result.skipped });
  }

  return { rows, skipped, read: records.length };
}
