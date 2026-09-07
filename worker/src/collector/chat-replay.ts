import type { Env } from '../lib/env';
import { chatContinuation, parseReplayPage, readReplayError, replayRequest, type ReplayPage } from '../lib/live-chat';
import { formatTimestamp } from '../lib/time';
import type { Availability } from '../lib/video';

/**
 * How many videos one tick takes on.
 *
 * The single number to raise when the backfill in #68 needs more throughput.
 * At one per minute this drains 1,440 videos a day, against a few new streams
 * a day and the 2,015 the old system lost; raising it multiplies both the
 * transfer and the time one tick takes, so it is deliberately not a knob that
 * lives in several places.
 */
const VIDEOS_PER_TICK = 1;

/**
 * How many replay pages one video gets per tick.
 *
 * A whole two-hour stream was measured at 25 pages, 1,163 messages and 2.5 MB
 * in 2.7 seconds, at roughly 50 messages and 100 KB a page. Forty finishes
 * that stream in one tick with room to spare, and a longer one simply carries
 * on next minute - which is what the cursor is for.
 */
const PAGES_PER_VIDEO = 40;

/**
 * How many extra tries a refused page gets, and how long to leave between
 * them.
 *
 * Production started answering some pages with 403 and a block page instead of
 * JSON (#96). Measured from the edge, three runs of 40 pages each: taken back
 * to back the run stopped after 7, 9 and 2 pages; leaving a second between
 * requests changed nothing (4, 3 and 4); asking for the refused page again
 * half a second later carried every run to 40 pages of 40, having asked twice
 * 7, 7 and 3 times. So the refusal is per request rather than a state the
 * caller has been put into, and waiting longer is not what clears it.
 *
 * The two numbers are the configuration that was measured rather than one
 * derived from it. No page in those runs ran out of its three tries, which is
 * what the ceiling sitting here rather than higher rests on; a page that does
 * run out costs the video a backoff, not the pages counted before it.
 *
 * A page that is cut for taking too long spends the same tries. What that
 * costs, and why it is the same event, is under PAGE_DEADLINE_MS.
 */
const PAGE_RETRIES = 3;
const PAGE_RETRY_MS = 500;

/**
 * How long to wait for an answer before cutting the request and asking again.
 *
 * A refusal turned out not to be a slow answer but a held connection. Measured
 * from the edge against one replay, walked to its end three times: a page that
 * is answered comes back in 52 to 150 ms, while a 403 arrives after 6.5 to 9.5
 * seconds carrying a block page and no retry-after. Cutting a request that has
 * not answered in a second and asking again took the same 21 pages from 40.9
 * seconds to 4.5, and the try straight after a cut succeeded every time - so
 * the refusal is decided at once and only the connection is kept.
 *
 * A second is chosen for the failure it cannot have rather than for being
 * optimal. fetch settles when the headers arrive, so this covers the wait for
 * an answer and not the reading of the page behind it: a page cannot be cut
 * for being large. It is a starting value to narrow against production, not a
 * measured optimum - three runs of one replay say nothing about where the knee
 * is.
 */
const PAGE_DEADLINE_MS = 1000;

/**
 * How many videos one scan of `video` may enqueue.
 *
 * The scan is the expensive half of this job (see DISCOVERY_MINUTE), so it
 * takes a batch rather than one row, and the queue then feeds ticks for the
 * next couple of hours.
 */
const DISCOVERY_LIMIT = 100;

/**
 * The minute of the hour a scan is allowed on, so roughly one scan in ten.
 *
 * `video` has no index this scan can use - see #83 - so in the steady state,
 * with every stream already counted, it reads the whole table to find nothing.
 * That is the case worth rationing: while there is queued work this job never
 * scans at all, and when there is none it looks six times an hour rather than
 * sixty. Once #83 adds the index this can go back to every tick.
 */
const DISCOVERY_MINUTE = 10;

/** How long a claimed video stays claimed before another tick may retake it. */
const LEASE_MINUTES = 15;

/** The first retry delay, doubled per consecutive failure up to the cap. */
const RETRY_BASE_MINUTES = 5;
const RETRY_MAX_MINUTES = 360;

/**
 * The values of `video.availability` that leave nothing here to read.
 *
 * Named one at a time rather than written as "anything but public", because
 * the two ways of being wrong do not weigh the same. Keeping a video in the
 * rotation that cannot be read costs a tick and says so in the log. Dropping
 * one that could have been read means its chat is never counted, and no path
 * brings a settled row back: `enqueueEndedStreams` inserts or ignores, so a
 * row that has been decided is never offered again.
 *
 * 'membership' is the fourth value the schema allows and is deliberately not
 * here. Production holds none, so adding it would change nothing that can be
 * measured, and whether a members-only replay answers an unauthenticated
 * request has not been established. Leaving it out costs what it costs today:
 * one failure and a backoff.
 *
 * A video can leave these values again - 'private' especially, which is
 * something a streamer does and undoes - and this job will not notice,
 * because the row is settled by then. That is the existing rule for settled
 * rows rather than something #100 introduced; changing it is its own issue.
 */
const UNREADABLE_AVAILABILITY: readonly Availability[] = ['private', 'unavailable'];

interface TaskRow {
  target_id: string;
  cursor: string | null;
  attempts: number;
}

/**
 * What `collect_task.cursor` carries for this job, and equally what a failure
 * records: where the video is up to, as far as a write has actually taken it.
 *
 * More than the continuation the schema's comment names, because more than
 * the continuation is needed to carry on: the running message count has no
 * column of its own, and writing it into video.chat_message_count as it grew
 * would leave readers unable to tell a part-counted video from a finished
 * one.
 */
interface Progress {
  continuation: string;
  messages: number;
}

/** One page as read, and what it took to read it. */
interface PageRead {
  replay: ReplayPage | null;
  /** How many tries this page took beyond the first. */
  retries: number;
  /**
   * How many of those tries were cut rather than refused in so many words.
   *
   * Kept apart from the count above because the two move for different
   * reasons: refusals rising is the endpoint treating us differently, cuts
   * rising on their own is PAGE_DEADLINE_MS being too tight.
   */
  cut: number;
}

function plusMinutes(from: Date, minutes: number): string {
  const at = new Date(from);

  at.setUTCMinutes(at.getUTCMinutes() + minutes);

  return formatTimestamp(at);
}

/** Exponential, from RETRY_BASE_MINUTES, capped so a retry is never abandoned. */
function backoffFrom(now: Date, attempts: number): string {
  return plusMinutes(now, Math.min(RETRY_BASE_MINUTES * 2 ** attempts, RETRY_MAX_MINUTES));
}

/** The cursor as an object, or null if it is absent or no longer readable. */
function readProgress(cursor: string | null): Progress | null {
  if (!cursor) {
    return null;
  }

  try {
    const parsed = JSON.parse(cursor) as Partial<Progress>;

    // The count has to be a whole number that is not negative, because that is
    // what chat_message_count accepts: a cursor carrying anything else would
    // page all the way to the end and only then be refused by the CHECK.
    if (
      typeof parsed?.continuation !== 'string' ||
      !parsed.continuation ||
      !Number.isInteger(parsed.messages) ||
      (parsed.messages ?? -1) < 0
    ) {
      return null;
    }

    return parsed as Progress;
  } catch {
    // Unreadable is the same as absent: the video starts over from a
    // continuation built for it, rather than the job stopping on it.
    return null;
  }
}

/**
 * Ends a video's task without a count, leaving it due again later.
 *
 * Every way this job can fail one video comes through here - a replay call
 * that is refused, a video with no row left in `video`, an answer that makes
 * no sense where it arrives, and a D1 write that throws mid-paging - so that
 * none of them can quietly become a video that is never looked at again.
 *
 * Whatever pages were already counted stay in the cursor and in chat_author,
 * so a retry carries on from them rather than reading the replay again.
 *
 * `failures` counts the attempts in a row that got nowhere, which is not the
 * same as the attempts the row was claimed with: a run that wrote a page made
 * progress, so it hands over a zero and the next delay starts from the bottom
 * again. Counting from the claimed value instead would put a video that is
 * moving, one page a tick, onto the same hours-long backoff as one that has
 * never managed anything.
 */
async function recordFailure(
  db: D1Database,
  task: TaskRow,
  landed: Progress | null,
  failures: number,
  lease: string,
  now: Date,
): Promise<boolean> {
  const attempts = failures + 1;
  const cursor = landed ? JSON.stringify(landed) : null;

  const { meta } = await db
    .prepare(
      `UPDATE collect_task
         SET state = 'failed', attempts = ?1, next_attempt_at = ?2, cursor = ?3, updated_at = ?4
       WHERE kind = 'chat_replay' AND target_id = ?5 AND next_attempt_at = ?6`,
    )
    .bind(attempts, backoffFrom(now, attempts), cursor, formatTimestamp(now), task.target_id, lease)
    .run();

  return (meta.changes ?? 0) > 0;
}

/**
 * One request for a page, or null when it was cut for taking too long.
 *
 * The deadline is cleared as soon as the headers are in, so what it covers is
 * the wait for an answer and not the reading of the page behind it. A body
 * that stalls halfway through is a different failure with no cover here; #104
 * has that one.
 */
async function askForPage(continuation: string, fetchImpl: typeof fetch): Promise<Response | null> {
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), PAGE_DEADLINE_MS);

  try {
    return await fetchImpl(replayRequest(continuation, controller.signal));
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return null;
    }

    // Everything else leaves unchanged, which is the one place this file does
    // that. A request that failed for some other reason is not a refusal, so
    // there is nothing here to say about it, and collectOne logs what it
    // catches - so the error itself carries more than a sentence written here
    // could.
    throw error;
  } finally {
    clearTimeout(deadline);
  }
}

/**
 * Fetches and parses one replay page, or null when the answer carried no
 * replay at all.
 *
 * Null is not the end of a replay. A replay that has run out keeps its
 * envelope and drops only the continuation inside it; an answer with no
 * envelope is a video that has no replay to read. Which of those a null means
 * depends on where in a video it arrives, so the decision is the caller's.
 *
 * A 403 is asked again rather than given up on, up to PAGE_RETRIES times, and
 * so is a request that never answers at all. Those are the same event seen
 * from two distances - PAGE_DEADLINE_MS says why - so they spend the same
 * tries.
 */
async function readReplayPage(continuation: string, fetchImpl: typeof fetch): Promise<PageRead> {
  let cut = 0;

  // No condition on the loop, unlike the paging one in collectOne: every way
  // out of this is a return or a throw, and which of them it is depends on the
  // answer rather than on the count.
  for (let retries = 0; ; retries++) {
    const response = await askForPage(continuation, fetchImpl);

    if (!response) {
      cut++;
    } else if (response.ok) {
      return { replay: parseReplayPage(await response.json()), retries, cut };
    } else if (response.status !== 403) {
      // The other two statuses this endpoint uses are about the request itself
      // - readReplayError names which - so sending it again unchanged would
      // only be refused again, and the video is better off in its backoff.
      throw new Error(readReplayError(response.status));
    }

    if (retries === PAGE_RETRIES) {
      const tries = retries + 1;

      // Both numbers, because which of the two this was is the first question
      // anyone reading the line will have.
      throw new Error(
        `the replay endpoint gave no page in ${tries} tries: ${tries - cut} refused, ${cut} held past ${PAGE_DEADLINE_MS}ms`,
      );
    }

    await new Promise((resolve) => setTimeout(resolve, PAGE_RETRY_MS));
  }
}

/** What this job reads out of `video`: half of the continuation, and whether there is a video left. */
interface VideoRow {
  channel_id: string;
  availability: Availability;
}

/** The channel a video belongs to, which is half of its continuation, and what became of the video. */
async function videoOf(db: D1Database, videoId: string): Promise<VideoRow> {
  const row = await db
    .prepare('SELECT channel_id, availability FROM video WHERE video_id = ?1')
    .bind(videoId)
    .first<VideoRow>();

  if (!row) {
    // The scan only queues videos it read out of this table, so a row that is
    // gone by the time its turn comes is worth saying out loud.
    throw new Error('no row in video for this id');
  }

  return row;
}

/**
 * Whether a write took.
 *
 * Every write here is conditioned on the lease, so a write that changed
 * nothing does not mean the row is missing. It means another tick holds the
 * video now, and this run has to stop rather than write over it.
 */
function held(result: D1Result): boolean {
  return (result.meta.changes ?? 0) > 0;
}

/**
 * The statements that add one page's authors, in a form that repeats safely.
 *
 * Conditioned on the lease like every other write here, so that a run which
 * has lost the video cannot leave authors behind for one that has since been
 * counted and had its working rows cleared.
 */
function authorInserts(
  db: D1Database,
  videoId: string,
  authorIds: readonly string[],
  lease: string,
): D1PreparedStatement[] {
  const insert = db.prepare(
    `INSERT OR IGNORE INTO chat_author (video_id, author_id)
     SELECT ?1, ?2
      WHERE EXISTS (
            SELECT 1 FROM collect_task
             WHERE kind = 'chat_replay' AND target_id = ?1 AND next_attempt_at = ?3
          )`,
  );

  // Deduplicated here as well as by the primary key, only to keep a chatty
  // page from becoming fifty identical statements.
  return [...new Set(authorIds)].map((authorId) => insert.bind(videoId, authorId, lease));
}

/**
 * Settles a video as having nothing to read.
 *
 * Two ways lead here. The replay answered without an envelope, which says the
 * video is there and its chat is not; or `video.availability` says the video
 * itself is not there (#100). The schema's 'unavailable' covers both - it
 * means confirmed absent, an answer rather than a surrender - and which of the
 * two it was stays readable in `video.availability`, so `collect_task` needs
 * no column to say so.
 *
 * The working rows go in the same batch. A video can reach this after pages of
 * it were already counted - the chat was there and then was not - and nothing
 * would ever come back for those rows once the task is settled. No count is
 * written on this path, so deleting them loses nothing.
 */
async function recordAbsent(db: D1Database, videoId: string, lease: string, now: Date): Promise<boolean> {
  // The delete goes first because the update below is what ends the lease, and
  // the delete is conditioned on that lease still being there. finishVideo
  // orders its four statements the same way, and for the same reason.
  const results = await db.batch([
    db
      .prepare(
        `DELETE FROM chat_author
          WHERE video_id = ?1
           AND EXISTS (
                 SELECT 1 FROM collect_task
                  WHERE kind = 'chat_replay' AND target_id = ?1 AND next_attempt_at = ?2
               )`,
      )
      .bind(videoId, lease),
    db
      .prepare(
        `UPDATE collect_task
           SET state = 'unavailable', next_attempt_at = NULL, cursor = NULL, updated_at = ?1
         WHERE kind = 'chat_replay' AND target_id = ?2 AND next_attempt_at = ?3`,
      )
      .bind(formatTimestamp(now), videoId, lease),
  ]);

  return held(results[results.length - 1]);
}

/**
 * Steps one page's authors and the cursor that moves past them into D1 as one
 * batch, which D1 runs as a transaction.
 *
 * That pairing is the whole point: were the cursor to advance while an author
 * insert failed, the video would carry on from the next page having silently
 * lost the one before, and nothing afterwards could tell.
 *
 * The lease is rewritten to the same value it already holds, which keeps the
 * video claimed for as long as this run keeps making progress.
 */
async function writePage(
  db: D1Database,
  videoId: string,
  authorIds: readonly string[],
  progress: Progress,
  lease: string,
  now: Date,
): Promise<boolean> {
  const results = await db.batch([
    ...authorInserts(db, videoId, authorIds, lease),
    db
      .prepare(
        `UPDATE collect_task
           SET state = 'running', attempts = 0, cursor = ?1, next_attempt_at = ?2, updated_at = ?3
         WHERE kind = 'chat_replay' AND target_id = ?4 AND next_attempt_at = ?2`,
      )
      .bind(JSON.stringify(progress), lease, formatTimestamp(now), videoId),
  ]);

  return held(results[results.length - 1]);
}

/**
 * Hands a part-counted video back for the next tick to carry on with.
 *
 * The one place a video that is neither finished nor failed becomes due again.
 * Every page before this left the row 'running' on its lease, so no other tick
 * could take a video this one was still reading; this releases it the moment
 * the run stops, rather than a lease later.
 */
async function releaseForNextTick(db: D1Database, videoId: string, lease: string, now: Date): Promise<boolean> {
  const timestamp = formatTimestamp(now);

  const { meta } = await db
    .prepare(
      `UPDATE collect_task
         SET state = 'pending', next_attempt_at = ?1, updated_at = ?1
       WHERE kind = 'chat_replay' AND target_id = ?2 AND next_attempt_at = ?3`,
    )
    .bind(timestamp, videoId, lease)
    .run();

  return (meta.changes ?? 0) > 0;
}

/**
 * Writes the last page and the two counts it completes, then clears the
 * working rows.
 *
 * One batch again, and in this order: the unique count is taken from
 * chat_author while the rows are still there, so `video` never shows a total
 * that nothing backs, and the delete cannot outrun the count that needs it.
 */
async function finishVideo(
  db: D1Database,
  videoId: string,
  authorIds: readonly string[],
  messages: number,
  lease: string,
  now: Date,
): Promise<boolean> {
  const results = await db.batch([
    ...authorInserts(db, videoId, authorIds, lease),
    db
      .prepare(
        `UPDATE video
           SET chat_message_count = ?1,
               chat_unique_user_count = (SELECT count(*) FROM chat_author WHERE video_id = ?2)
         WHERE video_id = ?2
           AND EXISTS (
                 SELECT 1 FROM collect_task
                  WHERE kind = 'chat_replay' AND target_id = ?2 AND next_attempt_at = ?3
               )`,
      )
      .bind(messages, videoId, lease),
    db
      .prepare(
        `DELETE FROM chat_author
          WHERE video_id = ?1
           AND EXISTS (
                 SELECT 1 FROM collect_task
                  WHERE kind = 'chat_replay' AND target_id = ?1 AND next_attempt_at = ?2
               )`,
      )
      .bind(videoId, lease),
    db
      .prepare(
        `UPDATE collect_task
           SET state = 'done', attempts = 0, cursor = NULL, next_attempt_at = NULL, updated_at = ?1
         WHERE kind = 'chat_replay' AND target_id = ?2 AND next_attempt_at = ?3`,
      )
      .bind(formatTimestamp(now), videoId, lease),
  ]);

  return held(results[results.length - 1]);
}

/**
 * Counts one video, from wherever its cursor left off, for at most
 * PAGES_PER_VIDEO pages.
 *
 * Every way this can go wrong ends in the one catch below, which is what keeps
 * a video from quietly falling out of the queue: a replay call that is
 * refused, a video whose row in `video` has gone, an answer with no envelope
 * arriving after pages have already landed, and a D1 write that throws part of
 * the way through the pages.
 */
async function collectOne(
  db: D1Database,
  task: TaskRow,
  lease: string,
  now: Date,
  fetchImpl: typeof fetch,
): Promise<void> {
  const opened = readProgress(task.cursor);

  // What a failure would record, and only ever what a write has actually
  // taken. Held out here so a failure part-way through the pages keeps the
  // pages before it rather than the cursor this run started from.
  //
  // It answers a second question as well, which the loop below leans on:
  // whether anything has ever been counted for this video. Null means nothing
  // has - not by an earlier tick, whose progress would be in the cursor, and
  // not by this one - and that is what makes an answer with no envelope a
  // video without a replay rather than a broken reply.
  let landed: Progress | null = opened && { continuation: opened.continuation, messages: opened.messages };

  // How many times a page had to be asked for twice, summed over the run, and
  // how many of those were cuts. The 403 rate (#96) in the only form a log can
  // carry: one line as a video ends says whether the rate is moving, where a
  // line per retry would bury every other line this job writes.
  //
  // The two are reported side by side because they answer different questions.
  // Refusals rising while cuts do not is the endpoint treating us differently;
  // cuts rising on their own is PAGE_DEADLINE_MS being too tight.
  let retries = 0;
  let cut = 0;

  // Attempts in a row that got nowhere. It starts at what the row was
  // claimed with and drops to zero the moment a page lands, because a video
  // that is moving is not a video that keeps failing.
  let failures = task.attempts;

  try {
    const video = await videoOf(db, task.target_id);

    // Read on every pass, not only when there is no cursor to start from.
    // A video is queued while it can still be watched and can stop being
    // watchable afterwards: the ones this was measured on are from 2022 and
    // 2023, and they went on being asked for and refused for months. A check
    // at enqueue time alone would leave every one of them exactly where it is,
    // because they were all fine when they were queued.
    if (UNREADABLE_AVAILABILITY.includes(video.availability)) {
      if (!(await recordAbsent(db, task.target_id, lease, now))) {
        console.warn(`chat-replay: ${task.target_id} was taken by another tick before it could be settled`);
        return;
      }

      console.log(`chat-replay: ${task.target_id} is ${video.availability}; there is nothing left to read`);
      return;
    }

    // A resumed video carries on from its cursor. One starting out has its
    // first continuation built from the two ids, which is what replaced
    // reading the watch page for it (#92).
    let continuation = opened?.continuation ?? chatContinuation(video.channel_id, task.target_id);
    let counted = opened?.messages ?? 0;

    for (let page = 0; page < PAGES_PER_VIDEO; page++) {
      const read = await readReplayPage(continuation, fetchImpl);
      const replay = read.replay;

      retries += read.retries;
      cut += read.cut;

      if (!replay) {
        // No envelope at all. On the first page of a video nothing has read
        // that had one, so this is the confirmed absence the schema means by
        // 'unavailable': the video has no chat replay. Later on it would be a
        // broken answer instead, because a replay that has run out keeps its
        // envelope and drops only the continuation inside it.
        if (landed) {
          throw new Error('the replay response carried no liveChatContinuation');
        }

        if (!(await recordAbsent(db, task.target_id, lease, now))) {
          console.warn(`chat-replay: ${task.target_id} was taken by another tick before it could be settled`);
          return;
        }

        console.log(`chat-replay: ${task.target_id} has no chat replay`);
        return;
      }

      // Nothing here is believed until the write backing it has gone in.
      // Moving first would let a failed batch be recorded as progress the
      // database never took, which is the silent loss the batching prevents.
      const total = counted + replay.messageCount;

      if (!replay.continuation) {
        if (!(await finishVideo(db, task.target_id, replay.authorIds, total, lease, now))) {
          console.warn(`chat-replay: ${task.target_id} was taken by another tick before it could be finished`);
          return;
        }

        console.log(
          `chat-replay: ${task.target_id} counted ${total} messages over ${page + 1} pages and ${retries} retries (${cut} cut)`,
        );
        return;
      }

      const kept = await writePage(
        db,
        task.target_id,
        replay.authorIds,
        { continuation: replay.continuation, messages: total },
        lease,
        now,
      );

      if (!kept) {
        // Another tick holds the video now, so it is counting the same pages
        // from the cursor it found. Carrying on would only write over it.
        console.warn(`chat-replay: ${task.target_id} was taken by another tick, so this run stops`);
        return;
      }

      continuation = replay.continuation;
      counted = total;
      landed = { continuation, messages: counted };
      failures = 0;
    }

    await releaseForNextTick(db, task.target_id, lease, now);
    console.log(
      `chat-replay: ${task.target_id} used its ${PAGES_PER_VIDEO} pages and ${retries} retries (${cut} cut), so it carries on next tick`,
    );
  } catch (error) {
    console.error(`chat-replay: ${task.target_id} failed`, error);
    await recordFailure(db, task, landed, failures, lease, now);
  }
}

/**
 * Claims up to VIDEOS_PER_TICK videos that are due.
 *
 * 'running' is in the same net as 'pending' and 'failed' because
 * next_attempt_at doubles as the lease deadline: a tick that died mid-video
 * left its row claimed, and the row becomes due again by the same clause that
 * makes a failed one due. The columns and states here are exactly those the
 * collect_task_due index covers.
 *
 * One statement, so that reading a row and taking it cannot be separated. A
 * cron trigger does not wait for the tick before it, so two runs can overlap;
 * read and claim as two statements would let both read the same row and both
 * then count it. The lease this writes puts the row out of its own subquery's
 * reach, so the second run finds nothing to take.
 */
async function claimDue(db: D1Database, now: Date): Promise<{ tasks: TaskRow[]; lease: string }> {
  const lease = plusMinutes(now, LEASE_MINUTES);

  const { results } = await db
    .prepare(
      `UPDATE collect_task
          SET state = 'running', next_attempt_at = ?1, updated_at = ?2
        WHERE kind = 'chat_replay'
          AND target_id IN (
                SELECT target_id FROM collect_task
                 WHERE kind = 'chat_replay'
                   AND state IN ('pending', 'running', 'failed')
                   AND next_attempt_at <= ?2
                 ORDER BY next_attempt_at
                 LIMIT ?3
              )
    RETURNING target_id, cursor, attempts`,
    )
    .bind(lease, formatTimestamp(now), VIDEOS_PER_TICK)
    .all<TaskRow>();

  return { tasks: results, lease };
}

/**
 * Queues streams that have ended and have no chat count yet.
 *
 * Derived from the state of `video` every time rather than from an event when
 * a stream ends: an event missed once is a video never counted, which is the
 * shape of failure this job exists to remove. A scan that finds nothing costs
 * a scan; a missed event costs a stream's history.
 *
 * `actual_end_time` alone decides what has ended. It is set only on a stream
 * and only once one is over, which is exactly the population. `type` is not
 * used because it is derived from duration (#63) and says nothing about
 * whether a stream finished, and `live_broadcast_content` is not used because
 * 'none' is equally true of an upload that never streamed.
 *
 * A row is inserted once and then left alone whatever it settles as, so a
 * video counted, or confirmed to have no chat, is never queued a second time.
 *
 * Videos that cannot be read are left out here as well. It saves a tick each
 * rather than being what makes the rule hold: collectOne checks the same
 * thing before every fetch, and that is the check that catches a video which
 * went away after it was queued.
 */
async function enqueueEndedStreams(db: D1Database, now: Date): Promise<number> {
  const timestamp = formatTimestamp(now);

  // The placeholders are counted off UNREADABLE_AVAILABILITY so that a value
  // added to it reaches this query too. What goes into the SQL text is the
  // numbering; the values themselves are bound. Nothing from a request is
  // anywhere near it - the list is a constant in this file.
  const unreadable = UNREADABLE_AVAILABILITY.map((_, index) => `?${index + 3}`).join(', ');

  const { meta } = await db
    .prepare(
      `INSERT OR IGNORE INTO collect_task (kind, target_id, state, attempts, next_attempt_at, updated_at)
       SELECT 'chat_replay', video_id, 'pending', 0, ?1, ?1
         FROM video
        WHERE actual_end_time IS NOT NULL
          AND chat_message_count IS NULL
          AND availability NOT IN (${unreadable})
          AND NOT EXISTS (
                SELECT 1 FROM collect_task
                 WHERE kind = 'chat_replay' AND target_id = video.video_id
              )
        LIMIT ?2`,
    )
    .bind(timestamp, DISCOVERY_LIMIT, ...UNREADABLE_AVAILABILITY)
    .run();

  return meta.changes ?? 0;
}

/**
 * The chat-replay job (#65): count one video's chat replay, or a few minutes'
 * worth of one, and keep every video that has not been counted queued.
 *
 * A tick does one of two things. If anything is due it takes that and leaves
 * the scan alone, so a backlog drains without paying for a scan every minute.
 * Only an idle tick, and only one in DISCOVERY_MINUTE of those, goes looking
 * for new work.
 */
export async function runChatReplay(env: Env, fetchImpl: typeof fetch = fetch): Promise<void> {
  const now = new Date();
  const { tasks, lease } = await claimDue(env.DB, now);

  if (tasks.length > 0) {
    for (const task of tasks) {
      try {
        await collectOne(env.DB, task, lease, now, fetchImpl);
      } catch (error) {
        // collectOne handles its own failures; what reaches here is the one
        // it could not record - a D1 that refused the failure write too. One
        // video in that state must not take the rest of the tick with it,
        // which matters as soon as VIDEOS_PER_TICK is raised for #68.
        //
        // No test covers this branch, and not for want of trying: reaching it
        // means making recordFailure's write fail, which means breaking
        // collect_task, and then claimDue above fails first and the run never
        // gets here. Dropping the table is worse still - storage rolls back
        // per file rather than per test, so every later test in the file
        // would run without it.
        console.error(`chat-replay: ${task.target_id} could not even be recorded as failed`, error);
      }
    }

    return;
  }

  if (now.getUTCMinutes() % DISCOVERY_MINUTE !== 0) {
    return;
  }

  const queued = await enqueueEndedStreams(env.DB, now);

  console.log(
    queued > 0
      ? `chat-replay: queued ${queued} ended streams with no chat count`
      : 'chat-replay: nothing due and no uncounted streams to queue',
  );
}
