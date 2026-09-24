/**
 * Where /api/health decides "stale" from "fine", chosen and reasoned about in
 * #110 rather than at each call site. One place, so the same number cannot
 * drift between the jobs it grades and the tests that check the boundary.
 *
 * Every figure here allows a few missed runs before it fires. A single tick's
 * failure recovers on its own - the next tick, or the next night's backup -
 * and firing on that would mean a page every time YouTube refuses a request
 * once. The exception is `RETENTION_STALE_GRACE_MINUTES`, for the reason
 * given there.
 */

import { RETENTION_DAYS, RETENTION_TICK_MINUTES } from './retention';

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
 * Only checked while `queued > 0` - see health.ts, where the two are read
 * together. Its cron runs every minute, so 10 minutes is ten missed ticks,
 * not three; chat-replay's queue is a resume position rather than a page a
 * monitor should treat like the ten-minute jobs above.
 */
export const CHAT_REPLAY_ACTIVITY_STALE_MINUTES = 10;

/**
 * `daysAgo` a backed-up table reads on a night nothing went wrong.
 *
 * A table replaced whole each night writes today's date; a table with a
 * `dayColumn` (see `BACKED_UP_TABLES` in ./backup.ts) writes yesterday's even
 * when it is working, because it can only write a day once that day can no
 * longer change. A single threshold applied to every table would fire on
 * `channel_snapshot` and `revision` every night they are perfectly healthy,
 * which is why a table not listed here is read against 0 rather than 1: that
 * is the correct baseline for every table but those two.
 */
export const BACKUP_FRESH_DAYS_AGO: Readonly<Record<string, number>> = {
  channel: 0,
  video: 0,
  channel_snapshot: 1,
  revision: 1,
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

/**
 * Minutes past `RETENTION_DAYS` the oldest row ../collector/retention.ts
 * deletes may reach before `/api/health` reports the deletion as behind.
 *
 * One tick, for the cron's own jitter: an hourly run can start a few seconds
 * later than the one before it, and the oldest row then passes 30 days by
 * that much. Anything further is data held beyond the policy - one missed
 * hourly run is enough to get there - and unlike the missed runs the rest of
 * this file allows for, it is worth hearing about even though the next run
 * catches up by itself (#223).
 */
export const RETENTION_STALE_GRACE_MINUTES = RETENTION_TICK_MINUTES;

/**
 * Whether `oldest` - the oldest instant a row the retention job deletes is
 * dated by - is past the policy and the grace above. Null is a table with
 * nothing in it, which is not behind.
 */
export function isRetentionStale(oldest: string | null, now: Date): boolean {
  const elapsed = minutesSince(oldest, now);

  return elapsed !== null && elapsed > RETENTION_DAYS * 24 * 60 + RETENTION_STALE_GRACE_MINUTES;
}

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
 * `daysAgo >= freshDaysAgo + BACKUP_STALE_GRACE_DAYS`, with freshDaysAgo read
 * from `BACKUP_FRESH_DAYS_AGO` by table name. A table this map does not know
 * is graded against 0, the stricter of the two baselines in use, rather than
 * silently passing as healthy.
 */
export function isBackupStale(tableName: string, daysAgo: number | null): boolean {
  if (daysAgo === null) return true;

  const freshDaysAgo = BACKUP_FRESH_DAYS_AGO[tableName] ?? 0;

  return daysAgo >= freshDaysAgo + BACKUP_STALE_GRACE_DAYS;
}
