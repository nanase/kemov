import type { Env } from '../lib/env';
import { parseReplayPage, parseWatchPage, replayRequest, watchUrl, type ChatSession } from '../lib/live-chat';
import { formatTimestamp } from '../lib/time';

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

interface TaskRow {
  target_id: string;
  cursor: string | null;
  attempts: number;
}

/**
 * What `collect_task.cursor` carries for this job.
 *
 * More than the continuation the schema's comment names, because more than
 * the continuation is needed to carry on: the running message count has no
 * column of its own, and writing it into video.chat_message_count as it grew
 * would leave readers unable to tell a part-counted video from a finished
 * one. The credentials ride along so that the 1.2 MB watch page is read once
 * per video rather than once per tick.
 */
interface Progress {
  continuation: string;
  messages: number;
  apiKey?: string;
  clientVersion?: string;
}

/** Where a video is up to, as far as a write has actually taken it. */
type Landed = Pick<Progress, 'continuation' | 'messages'>;

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
    // Unreadable is the same as absent: the video restarts from its watch
    // page rather than the job stopping on it.
    return null;
  }
}

/**
 * Ends a video's task without a count, leaving it due again later.
 *
 * Every way this job can fail one video comes through here - the watch page,
 * the replay call, a response that will not parse, and a D1 write that throws
 * mid-paging - so that none of them can quietly become a video that is never
 * looked at again.
 *
 * Whatever pages were already counted stay in the cursor and in chat_author;
 * the credentials are dropped so the retry reads a fresh watch page, which is
 * what a rejected replay call most often needs.
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
  landed: Landed | null,
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

/** Fetches and parses one video's watch page. */
async function openReplay(videoId: string, fetchImpl: typeof fetch) {
  const response = await fetchImpl(watchUrl(videoId));

  if (!response.ok) {
    throw new Error(`the watch page responded ${response.status}`);
  }

  return parseWatchPage(await response.text());
}

/** Fetches and parses one replay page. */
async function readReplayPage(session: ChatSession, fetchImpl: typeof fetch) {
  const response = await fetchImpl(replayRequest(session));

  if (!response.ok) {
    throw new Error(`the replay endpoint responded ${response.status}`);
  }

  const page = parseReplayPage(await response.json());

  if (!page) {
    // A replay that has run out drops its continuation, not its envelope, so
    // a missing envelope is a broken answer rather than the end.
    throw new Error('the replay response carried no liveChatContinuation');
  }

  return page;
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
 * Settles a video as having no chat replay to read.
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
 * Where to send the next replay request for this video, or null once the video
 * is settled and there is nothing to send.
 *
 * A cursor with credentials in it needs nothing else. Without them - a video
 * starting out, or one whose last attempt dropped them - the watch page is
 * read, and only its three answers are acted on here: an absent chat settles
 * the video, an unopenable page is thrown to the caller's one handler, and a
 * usable one supplies the credentials. A resumed video keeps the continuation
 * it had already reached; the watch page's own is only for a video starting
 * out.
 */
async function openSession(
  db: D1Database,
  task: TaskRow,
  opened: Progress | null,
  lease: string,
  now: Date,
  fetchImpl: typeof fetch,
): Promise<ChatSession | null> {
  if (opened?.apiKey && opened.clientVersion) {
    return { apiKey: opened.apiKey, clientVersion: opened.clientVersion, continuation: opened.continuation };
  }

  const page = await openReplay(task.target_id, fetchImpl);

  if (page.kind === 'absent') {
    // The one confirmed absence this job can establish: the video plays and
    // has no chat replay to read. Everything else stays retryable.
    await recordAbsent(db, task.target_id, lease, now);
    console.log(`chat-replay: ${task.target_id} has no chat replay`);
    return null;
  }

  if (page.kind === 'unusable') {
    throw new Error(page.why);
  }

  return { ...page, continuation: opened?.continuation ?? page.continuation };
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
 * a video from quietly falling out of the queue: a watch page that will not
 * load or parse, a replay call that is refused, an answer that is not a replay
 * page, and a D1 write that throws part of the way through the pages.
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
  let landed: Landed | null = opened && { continuation: opened.continuation, messages: opened.messages };

  // Attempts in a row that got nowhere. It starts at what the row was
  // claimed with and drops to zero the moment a page lands, because a video
  // that is moving is not a video that keeps failing.
  let failures = task.attempts;

  try {
    const session = await openSession(db, task, opened, lease, now, fetchImpl);

    if (!session) {
      return;
    }

    let { continuation } = session;
    let counted = opened?.messages ?? 0;

    for (let page = 0; page < PAGES_PER_VIDEO; page++) {
      const replay = await readReplayPage({ ...session, continuation }, fetchImpl);
      // Nothing here is believed until the write backing it has gone in.
      // Moving first would let a failed batch be recorded as progress the
      // database never took, which is the silent loss the batching prevents.
      const total = counted + replay.messageCount;

      if (!replay.continuation) {
        if (!(await finishVideo(db, task.target_id, replay.authorIds, total, lease, now))) {
          console.warn(`chat-replay: ${task.target_id} was taken by another tick before it could be finished`);
          return;
        }

        console.log(`chat-replay: ${task.target_id} counted ${total} messages over ${page + 1} pages`);
        return;
      }

      const kept = await writePage(
        db,
        task.target_id,
        replay.authorIds,
        { ...session, continuation: replay.continuation, messages: total },
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
    console.log(`chat-replay: ${task.target_id} used its ${PAGES_PER_VIDEO} pages and will carry on next tick`);
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
 */
async function enqueueEndedStreams(db: D1Database, now: Date): Promise<number> {
  const timestamp = formatTimestamp(now);

  const { meta } = await db
    .prepare(
      `INSERT OR IGNORE INTO collect_task (kind, target_id, state, attempts, next_attempt_at, updated_at)
       SELECT 'chat_replay', video_id, 'pending', 0, ?1, ?1
         FROM video
        WHERE actual_end_time IS NOT NULL
          AND chat_message_count IS NULL
          AND NOT EXISTS (
                SELECT 1 FROM collect_task
                 WHERE kind = 'chat_replay' AND target_id = video.video_id
              )
        LIMIT ?2`,
    )
    .bind(timestamp, DISCOVERY_LIMIT)
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
