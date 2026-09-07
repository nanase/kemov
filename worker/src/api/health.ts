import type { Env } from '../lib/env';

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

interface JobHealth {
  job: JobName;
  /** When this job last produced data. Null means it never has. */
  lastSuccessAt: string | null;
  /** Its unsettled rows in collect_task: waiting, running or backing off. */
  pending: number;
}

/**
 * Success is read from where each job writes its results, not from
 * `collect_task`.
 *
 * A job that has never run and a job that is failing look the same from the
 * failure side, and only one of those is an emergency. channel-stats writes a
 * channel_snapshot row when it succeeds and a collect_task row when it does
 * not; the video jobs move `video.fetched_at`. chat-replay is the exception -
 * what it produces is a count inside a `video` row, so its own settled task
 * rows are the only record that it finished something.
 */
export async function health(env: Env): Promise<{ jobs: JobHealth[]; databaseReadAt: string }> {
  const [snapshot, videos, chat, pending] = await env.DB.batch([
    env.DB.prepare('SELECT max(fetched_at) AS at FROM channel_snapshot'),
    env.DB.prepare('SELECT max(fetched_at) AS at FROM video'),
    env.DB.prepare(`SELECT max(updated_at) AS at FROM collect_task WHERE kind = 'chat_replay' AND state = 'done'`),
    env.DB.prepare(
      `SELECT kind, count(*) AS n FROM collect_task
        WHERE state IN ('pending', 'running', 'failed')
        GROUP BY kind`,
    ),
  ]);

  const at = (result: D1Result) => (result.results[0] as { at: string | null } | undefined)?.at ?? null;
  const pendingByKind = new Map((pending.results as { kind: string; n: number }[]).map(({ kind, n }) => [kind, n]));

  // Both video jobs move video.fetched_at and nothing records which of them
  // last did. Reporting one instant for both is honest about that; a column to
  // tell them apart would be a schema change this task does not need.
  const lastVideo = at(videos);

  const lastSuccess: Record<JobName, string | null> = {
    'channel-stats': at(snapshot),
    'video-discover': lastVideo,
    'video-update': lastVideo,
    // Null until a replay finishes. That is the reading today: the job has
    // been failing in production and #92 is the fix, so this endpoint's first
    // answer about it is a job that has never succeeded. Null says "never",
    // which a monitor has to tell apart from "a while ago".
    'chat-replay': at(chat),
  };

  return {
    jobs: JOBS.map(({ job, kind }) => ({
      job,
      lastSuccessAt: lastSuccess[job],
      pending: pendingByKind.get(kind) ?? 0,
    })),
    // When these figures were read. A cached answer keeps the reading's time
    // rather than taking the reader's, which is what makes a stale answer
    // recognisable as one.
    databaseReadAt: `${new Date().toISOString().slice(0, 19)}Z`,
  };
}
