import type { Env } from '../lib/env';
import { formatTimestamp } from '../lib/time';

/**
 * GET /api/health
 *
 * When each collection job last succeeded, which is what #71 watches.
 *
 * Reported per job rather than as one number for the worker. The jobs fail
 * independently - runScheduled catches each one's errors so that one failing
 * never stops the others - so a single figure would only go stale once every
 * job had stopped, which is the one case nobody needs a monitor to notice.
 */

/**
 * What "stopped" means, job by job (#71).
 *
 * #110 turns this into thresholds and a notification. What lives here is the
 * shape of the judgement, because that is a property of the data rather than
 * of whoever is watching it. Numbers chosen against a notifier tend to fit the
 * notifier.
 *
 * There are two questions, and every job needs both answered.
 *
 * Is it running at all? `lastActivityAt`. Any tick that does anything writes a
 * `collect_task` row, whether the work went well or badly.
 *
 * Is it getting anywhere? `lastSuccessAt`. A job can run on every tick and
 * succeed at nothing, which is what a missing YOUTUBE_API_KEY looked like for
 * two and a half hours before anybody noticed (#89).
 *
 * Fresh activity with a stale success is the second failure. Both stale is the
 * first. Neither can be seen from the other one alone.
 *
 * Three of the four always have work, so one of them going quiet has stopped:
 *
 * - channel-stats, every ten minutes, writes one row per channel, all eleven
 *   of them, on every tick.
 * - video-discover, every ten minutes, writes one row per channel on every
 *   tick that reads a playlist (#90). Rows for videos arrive only when a
 *   channel has published something, so counting rows would call a quiet day
 *   a stoppage; the channel rows are what keeps the timestamp moving.
 * - video-update, every ten minutes, writes up to fifty rows. Its sweep has no
 *   WHERE clause, so it has work for as long as `video` has rows.
 *
 * chat-replay is the exception, and `queued` has to be read beside its
 * timestamps:
 *
 * - chat-replay runs every minute but writes a 'done' row only when a whole
 *   video has been counted, and one video takes many ticks - four ticks out of
 *   twenty-eight, measured. A tick with nothing due and no scan to run writes
 *   nothing at all. So it is stopped only while `queued` is above zero. With
 *   an empty queue, quiet is what working looks like.
 *
 * The numbers are #110's. This says which field to read, and for chat-replay,
 * what to read next to it.
 */

/** The jobs this reports on, paired with the `collect_task.kind` each uses. */
const JOBS = [
  { job: 'channel-stats', kind: 'channel_stats' },
  { job: 'video-discover', kind: 'video_discover' },
  { job: 'video-update', kind: 'video_update' },
  { job: 'chat-replay', kind: 'chat_replay' },
] as const;

type JobName = (typeof JOBS)[number]['job'];

/**
 * What one job's collect_task rows say about it.
 *
 * Queued and failing are counted apart rather than added together. They are
 * not the same news: chat-replay keeps a row per video as its resume position,
 * so a queue of thousands is that job working normally, while one failing row
 * is a video it cannot read. A single figure covering both would be a number
 * that goes up when the job is busy and up when the job is broken.
 */
interface JobHealth {
  job: JobName;
  /** When this job last produced data. Null means it never has. */
  lastSuccessAt: string | null;
  /**
   * When this job last wrote anything at all, success or failure. Null means
   * it never has.
   *
   * lastSuccessAt cannot answer "is it running": a job that fails on every
   * tick has a stale one, and so does a job nothing is calling any more. This
   * separates them, because a failure gets written down too.
   */
  lastActivityAt: string | null;
  /** Work waiting or in hand. For chat-replay this is the backlog, not trouble. */
  queued: number;
  /** Targets it is backing off from and will try again. */
  failing: number;
  /**
   * When one of those last failed.
   *
   * Reported because a count on its own does not say whether the failures are
   * still happening. A row that failed 25 times and stopped being retried
   * looks the same as one failing now, and only the second is worth waking
   * for - the difference is in this timestamp, not in the count.
   */
  lastFailureAt: string | null;
  /**
   * The most consecutive failures any one of its targets is sitting on.
   *
   * `failing` says how many targets are in trouble and lastFailureAt says
   * whether they still are. Neither says how long any one of them has been at
   * it, which is what tells a blip from a target nothing will ever fix.
   *
   * It reads as consecutive because attempts goes back to zero the moment a
   * target succeeds (#90). Before that it did not, and a row could sit at 25
   * long after the trouble had passed.
   */
  maxAttempts: number;
  /**
   * Targets it has settled as not there.
   *
   * Not a fault: a deleted video is an answer. Worth reporting because a jump
   * in it is how "the thing deciding what is unavailable has broken" would
   * first show.
   */
  unavailable: number;
}

interface TaskState {
  kind: string;
  state: string;
  n: number;
  at: string | null;
  attempts: number | null;
}

const countOf = (rows: TaskState[], kind: string, ...states: string[]) =>
  rows.filter((row) => row.kind === kind && states.includes(row.state)).reduce((total, row) => total + row.n, 0);

/**
 * Success is read from the newest 'done' row of that job's own kind, not from
 * the absence of failures and not from the tables the jobs write into.
 *
 * The failure side cannot answer it: a job that has never run and a job that
 * is failing look identical from there, and only one of those is an emergency.
 *
 * The result tables cannot answer it either, which took a second look to see.
 * `video.fetched_at` moves when either video job writes, so reading it would
 * give both the same instant - and video-update runs every tick, so
 * video-discover could stop entirely and its answer would keep advancing.
 * That is not an imprecision, it is a job failing invisibly.
 *
 * Every job writes a 'done' row per target on each successful run, so the
 * newest of them says when this job last produced something of its own.
 *
 * It is not a per-tick heartbeat, which this said until #71 and which is only
 * true of three of the four. chat-replay counts one video across many ticks
 * and writes nothing until the last of them, so its 'done' rows are a record
 * of videos finished rather than of ticks run. lastActivityAt is the per-tick
 * reading, and the note above JOBS is how the two are read together.
 *
 * The rows are grouped by kind and never by what a target id looks like.
 * video_discover holds two sorts of target in one kind, a channel whose
 * playlist would not load and a video that would not be written, and telling
 * them apart by the id is a trap: a channel id is 24 characters and a video id
 * is 11, but a video id can begin 'UC' as well, and one in production does.
 * Anything needing them apart has to join to `channel` or `video`, and nothing
 * here needs them apart - the newest 'done' row of the kind is the job's
 * heartbeat whichever sort of target it belongs to.
 */
export async function health(env: Env): Promise<{ jobs: JobHealth[]; databaseReadAt: string }> {
  const { results } = await env.DB.prepare(
    `SELECT kind, state, count(*) AS n, max(updated_at) AS at, max(attempts) AS attempts
       FROM collect_task
      GROUP BY kind, state`,
  ).all<TaskState>();

  /**
   * The newest updated_at among this job's rows in the states named, or among
   * all of its rows when none are, which is the same varargs shape countOf has.
   */
  const newest = (kind: string, ...states: string[]) =>
    results
      .filter((row) => row.kind === kind && (states.length === 0 || states.includes(row.state)))
      .reduce<string | null>(
        (latest, row) => (row.at !== null && (latest === null || row.at > latest) ? row.at : latest),
        null,
      );

  return {
    jobs: JOBS.map(({ job, kind }) => ({
      job,
      // Null says "never", which a monitor has to tell apart from "a while
      // ago". chat-replay answers null today: it has been failing in
      // production and has never finished one.
      lastSuccessAt: newest(kind, 'done'),
      // No state named: a tick that failed wrote a row too, and that is the
      // point of reading this one.
      lastActivityAt: newest(kind),
      queued: countOf(results, kind, 'pending', 'running'),
      failing: countOf(results, kind, 'failed'),
      lastFailureAt: newest(kind, 'failed'),
      maxAttempts: results.find((row) => row.kind === kind && row.state === 'failed')?.attempts ?? 0,
      unavailable: countOf(results, kind, 'unavailable'),
    })),
    // When these figures were read. A cached answer keeps the reading's time
    // rather than taking the reader's, which is what makes a stale answer
    // recognisable as one.
    databaseReadAt: formatTimestamp(new Date()),
  };
}
