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
 * Every job writes a 'done' row per target on each successful run, and every
 * one of them writes at least one row per tick, so the newest of them is a
 * heartbeat for that job alone.
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
    `SELECT kind, state, count(*) AS n, max(updated_at) AS at
       FROM collect_task
      GROUP BY kind, state`,
  ).all<TaskState>();

  const newest = (kind: string, state: string) =>
    results.find((row) => row.kind === kind && row.state === state)?.at ?? null;

  return {
    jobs: JOBS.map(({ job, kind }) => ({
      job,
      // Null says "never", which a monitor has to tell apart from "a while
      // ago". chat-replay answers null today: it has been failing in
      // production and has never finished one.
      lastSuccessAt: newest(kind, 'done'),
      queued: countOf(results, kind, 'pending', 'running'),
      failing: countOf(results, kind, 'failed'),
      lastFailureAt: newest(kind, 'failed'),
      unavailable: countOf(results, kind, 'unavailable'),
    })),
    // When these figures were read. A cached answer keeps the reading's time
    // rather than taking the reader's, which is what makes a stale answer
    // recognisable as one.
    databaseReadAt: formatTimestamp(new Date()),
  };
}
