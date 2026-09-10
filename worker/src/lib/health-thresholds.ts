/**
 * Where /api/health decides "stale" from "fine", chosen and reasoned about in
 * #110 rather than at each call site. One place, so the same number cannot
 * drift between the jobs it grades and the tests that check the boundary.
 *
 * Every figure here allows a few missed runs before it fires. A single tick's
 * failure recovers on its own - the next tick, or the next night's backup -
 * and firing on that would mean a page every time YouTube refuses a request
 * once.
 */

/**
 * How stale `lastSuccessAt` may be, in minutes, before channel-stats,
 * video-discover or video-update counts as stopped.
 *
 * The cron for all three is `*` / 10 minutes. 35 is a bit over three ticks:
 * long enough that one or two missed ticks do not fire, short enough that a
 * job that has actually stopped is caught inside the hour.
 */
export const JOB_SUCCESS_STALE_MINUTES = 35;

/**
 * How stale chat-replay's `lastActivityAt` may be, in minutes, while work is
 * queued, before it counts as stopped.
 *
 * Only checked while `queued > 0` - see `isChatReplayStale`. Its cron runs
 * every minute, so 10 minutes is ten missed ticks, not three; chat-replay's
 * queue is a resume position rather than a page a monitor should treat like
 * the ten-minute jobs above.
 */
export const CHAT_REPLAY_ACTIVITY_STALE_MINUTES = 10;

/**
 * `daysAgo` a backed-up table reads on a night nothing went wrong.
 *
 * `channel` and `video` write today's date; `channel_snapshot` writes
 * yesterday's even when it is working, because of when the nightly job runs
 * relative to midnight (see `BACKED_UP_TABLES` in ./backup.ts). A single
 * threshold applied to all three would fire on `channel_snapshot` every
 * night it is perfectly healthy.
 */
export const BACKUP_FRESH_DAYS_AGO: Record<string, number> = {
  channel: 0,
  video: 0,
  channel_snapshot: 1,
};

/**
 * Nights of grace added to a table's fresh `daysAgo` before it counts as
 * stale.
 *
 * `collector/backup.ts` fills in a missed day on its next run, so one bad
 * night recovers by itself. Two in a row have not, which is what this waits
 * for.
 */
export const BACKUP_STALE_GRACE_DAYS = 2;

/** Minutes between `at` and `now`, or null when `at` is null. */
function minutesSince(at: string | null, now: Date): number | null {
  if (at === null) return null;

  return (now.getTime() - new Date(at).getTime()) / 60_000;
}

/** Whether `at` is null, or old enough to have crossed `staleMinutes`. */
export function isTimestampStale(at: string | null, staleMinutes: number, now: Date): boolean {
  const elapsed = minutesSince(at, now);

  return elapsed === null || elapsed >= staleMinutes;
}

/**
 * Whether a backed-up table's newest file is stale, given how many days old
 * it is (null meaning R2 holds none) and which table it is.
 *
 * `daysAgo >= 基準値 + 2`, read from `BACKUP_FRESH_DAYS_AGO` by table name. A
 * table this map does not know is graded against 0, the stricter of the two
 * baselines in use, rather than silently passing as healthy.
 */
export function isBackupStale(tableName: string, daysAgo: number | null): boolean {
  if (daysAgo === null) return true;

  const freshDaysAgo = BACKUP_FRESH_DAYS_AGO[tableName] ?? 0;

  return daysAgo >= freshDaysAgo + BACKUP_STALE_GRACE_DAYS;
}
