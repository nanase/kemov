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
 * Success is read from where each job writes its results, not from the
 * failures it did not have.
 *
 * A job that has never run and a job that is failing look the same from the
 * failure side, and only one of those is an emergency. channel-stats writes a
 * channel_snapshot row when it succeeds; the video jobs move
 * `video.fetched_at`. chat-replay is the exception - what it produces is a
 * count inside a `video` row rather than a row of its own - so its settled
 * task rows are the record that it finished something.
 *
 * The counts are grouped by kind alone and never by what a target id looks
 * like. video_discover holds two sorts of target in one kind, a channel for a
 * playlist that would not load and a video for one that would not be written,
 * and telling them apart by the id is a trap: a channel id is 24 characters
 * and a video id is 11, but a video id can begin 'UC' as well, and one in
 * production does. Anything that needs them apart has to join to `channel` or
 * `video`, and nothing here needs them apart.
 */
export async function health(env: Env): Promise<{ jobs: JobHealth[]; databaseReadAt: string }> {
  const [snapshot, videos, chat, tasks] = await env.DB.batch([
    env.DB.prepare('SELECT max(fetched_at) AS at FROM channel_snapshot'),
    env.DB.prepare('SELECT max(fetched_at) AS at FROM video'),
    env.DB.prepare(`SELECT max(updated_at) AS at FROM collect_task WHERE kind = 'chat_replay' AND state = 'done'`),
    env.DB.prepare(
      `SELECT kind, state, count(*) AS n, max(updated_at) AS at
         FROM collect_task
        GROUP BY kind, state`,
    ),
  ]);

  const at = (result: D1Result) => (result.results[0] as { at: string | null } | undefined)?.at ?? null;
  const rows = tasks.results as TaskState[];

  // Both video jobs move video.fetched_at and nothing records which of them
  // last did. Reporting one instant for both is honest about that; a column to
  // tell them apart would be a schema change this task does not need.
  const lastVideo = at(videos);

  const lastSuccess: Record<JobName, string | null> = {
    'channel-stats': at(snapshot),
    'video-discover': lastVideo,
    'video-update': lastVideo,
    // Null until a replay finishes. Null says "never", which a monitor has to
    // tell apart from "a while ago".
    'chat-replay': at(chat),
  };

  return {
    jobs: JOBS.map(({ job, kind }) => ({
      job,
      lastSuccessAt: lastSuccess[job],
      queued: countOf(rows, kind, 'pending', 'running'),
      failing: countOf(rows, kind, 'failed'),
      lastFailureAt: rows.find((row) => row.kind === kind && row.state === 'failed')?.at ?? null,
      unavailable: countOf(rows, kind, 'unavailable'),
    })),
    // When these figures were read. A cached answer keeps the reading's time
    // rather than taking the reader's, which is what makes a stale answer
    // recognisable as one.
    databaseReadAt: formatTimestamp(new Date()),
  };
}
