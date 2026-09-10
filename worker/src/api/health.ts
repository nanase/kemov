import { BACKED_UP_TABLES, dayOf, daysBetween, latestDay } from '../lib/backup';
import type { Env } from '../lib/env';
import { formatTimestamp } from '../lib/time';

/**
 * GET /api/health
 *
 * When each collection job last succeeded, which is what #71 watches, and
 * since #115 what R2 holds of the nightly backup, which `collect_task` cannot
 * answer because that job writes none of its rows.
 *
 * Reported per job rather than as one number for the worker. The jobs fail
 * independently - runScheduled catches each one's errors so that one failing
 * never stops the others - so a single figure would only go stale once every
 * job had stopped, which is the one case nobody needs a monitor to notice.
 * `backup` is kept apart from `jobs` for the same reason it needs its own
 * read: it answers a different question from a different source.
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
 *
 * The two timestamps are apart for the same sort of reason. lastActivityAt
 * says whether the job is running, because a tick that failed wrote a row too;
 * lastSuccessAt says whether it is getting anywhere. A job that runs every
 * tick and fails every one of them has a fresh activity beside a stale
 * success, and a job nothing is calling any more has both stale. The missing
 * YOUTUBE_API_KEY was the first of those for two and a half hours (#89), and
 * neither field says so on its own.
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

/**
 * What R2 says about one backed-up table, per #115.
 *
 * `collect_task` cannot answer this - the backup job writes none of its
 * rows - so this is read from the bucket instead: the newest day it holds a
 * file for, and how many days ago that is. Nothing here judges whether that
 * is too old. `channel` and `video` write today's date and `channel_snapshot`
 * writes yesterday's even when nothing is wrong (see `BACKED_UP_TABLES` in
 * ../lib/backup.ts), so a threshold would need to know which table it is
 * reading; that decision belongs to #110, not here.
 */
interface BackupHealth {
  table: string;
  /** The newest day R2 has a file for. Null means it has none. */
  latestDate: string | null;
  /** How many days ago that day was. Null when latestDate is null. */
  daysAgo: number | null;
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
 * The highest attempts on a row of this job that is still failing.
 *
 * Only the failing rows, because recordAbsent leaves attempts where it found
 * them: a settled row can carry a large one for ever, and reporting it would
 * be reporting trouble that is over.
 */
const worstAttempts = (rows: TaskState[], kind: string) =>
  rows.find((row) => row.kind === kind && row.state === 'failed')?.attempts ?? 0;

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
 * It is not a per-tick heartbeat, which this said until #71 and which was only
 * ever true of three of the four. channel-stats writes a row for each of the
 * eleven channels every ten minutes; video-discover writes one per channel on
 * every tick that reads a playlist (#90), which is why a day with no new
 * videos does not read as a stoppage; and video-update writes up to fifty on a
 * sweep whose lack of a WHERE clause is what keeps it from running out of
 * work. Those three always have something to do, so a quiet one has stopped.
 *
 * chat-replay is the exception. It writes a 'done' row only once a whole video
 * has been counted, which was four ticks out of twenty-eight when it was
 * measured, and a tick with nothing due and no scan to run writes nothing at
 * all. Quiet is what working looks like there once its queue is empty, so it
 * is stopped only while `queued` is above zero - which is the reading #71 asks
 * for, and the reason that field is beside these two.
 *
 * That leaves one thing this endpoint cannot see. A chat-replay that is broken
 * while its queue is empty writes nothing, and so does one that is working
 * with nothing to do; no field here separates them, and none could, because a
 * job with no work leaves no evidence. The wait it costs a monitor has a
 * ceiling, though. The scan runs on a tick with nothing due, one minute in
 * ten, and it refills from every ended stream with no count against it, so a
 * queue that empties with work still outstanding is full again inside ten
 * minutes and the rule above applies from there. It stays empty only when
 * there is nothing left to count, which is what this job having caught up
 * looks like.
 *
 * How long is too long belongs to #110 rather than here, because a threshold
 * chosen against a notifier ends up fitting the notifier instead of the data.
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
export async function health(
  env: Env,
  now: Date = new Date(),
): Promise<{ jobs: JobHealth[]; backup: BackupHealth[]; databaseReadAt: string }> {
  const today = dayOf(formatTimestamp(now));
  const backup = await Promise.all(
    BACKED_UP_TABLES.map(async (table): Promise<BackupHealth> => {
      const latestDate = await latestDay(env.BACKUP, table.name);

      return { table: table.name, latestDate, daysAgo: latestDate === null ? null : daysBetween(latestDate, today) };
    }),
  );

  const { results } = await env.DB.prepare(
    `SELECT kind, state, count(*) AS n, max(updated_at) AS at, max(attempts) AS attempts
       FROM collect_task
      GROUP BY kind, state`,
  ).all<TaskState>();

  /**
   * The newest updated_at among this job's rows in the states named, or among
   * all of its rows when no state is named.
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
      maxAttempts: worstAttempts(results, kind),
      unavailable: countOf(results, kind, 'unavailable'),
    })),
    backup,
    // When these figures were read. A cached answer keeps the reading's time
    // rather than taking the reader's, which is what makes a stale answer
    // recognisable as one.
    databaseReadAt: formatTimestamp(now),
  };
}
