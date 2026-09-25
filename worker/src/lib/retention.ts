/**
 * How long data taken from the YouTube API may stay (#223).
 *
 * YouTube API Services' Developer Policies, III.E.4.d, keep data taken
 * without the owner's authorisation for 30 days at most, and #222 decided to
 * meet that rather than apply for anything longer. Two things here fall
 * under it and are deleted by ../collector/retention.ts: every
 * `channel_snapshot` row, and a video the API has stopped returning.
 *
 * Pure: no D1 and no clock of its own, the same split ./backup.ts keeps, so
 * that where the line falls can be tested without either.
 */

import { formatTimestamp } from './time';

/** The policy's limit. */
export const RETENTION_DAYS = 30;

const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;

/**
 * How often the deletion runs, in minutes.
 *
 * Once an hour, on the first ten-minute tick of it (see `isRetentionTick`),
 * rather than on a trigger of its own: #223 was not to raise how often the
 * worker runs, and an hour or three between runs was acceptable. An hour is
 * also what the boundary below is moved in by.
 */
export const RETENTION_INTERVAL_MINUTES = 60;

/**
 * Which ten-minute tick of the hour runs the deletion: the one whose minute
 * falls below this. The cron fires on the minute, so that is the :00 tick.
 */
const RETENTION_TICK_MINUTES = 10;

/** Whether the tick scheduled at `scheduledAt` is the one each hour that deletes. */
export function isRetentionTick(scheduledAt: Date): boolean {
  return scheduledAt.getUTCMinutes() < RETENTION_TICK_MINUTES;
}

/**
 * The instant before which a row is deleted by a run at `now`:
 * now - 30 days + 1 hour.
 *
 * A row is deleted by the first run at which it is older than 30 days less
 * an hour. The run before that one found it younger than that, an hour
 * earlier, so no row is ever older than 30 days while the runs keep their
 * hour. Deleting at exactly 30 days instead would leave a row up to 30 days
 * and an hour old in between two runs.
 */
export function retentionCutoff(now: Date): string {
  return formatTimestamp(new Date(now.getTime() - RETENTION_DAYS * DAY_MS + RETENTION_INTERVAL_MINUTES * MINUTE_MS));
}

/**
 * How far after "30 days before the newest snapshot" ../api/channels.ts may
 * look for the snapshot a 30-day change is read against, in minutes.
 *
 * The oldest snapshot retention leaves is at most this far in: the hour
 * between two runs, the ten minutes from a run's cutoff to the next tick
 * that collected, and the ten minutes the newest snapshot may trail the
 * request by - 80 - with ten more for a tick or a run that starts late.
 */
export const STAND_IN_REACH_MINUTES = RETENTION_INTERVAL_MINUTES + 30;

/**
 * The SQL that sets `video.last_available_at` in an UPDATE that marks a video
 * unavailable: the `fetched_at` the row had until then, on the pass that
 * first finds it gone, and left where it is on every pass after. A NULL on a
 * row already unavailable stays NULL, since the `fetched_at` beside it is a
 * pass that found nothing. Shared by the collector's own verdict
 * (../collector/video.ts) and the admin site's (../admin/collect-tasks.ts),
 * which must agree on when the 30 days began.
 */
export const LAST_AVAILABLE_AT_ON_UNAVAILABLE =
  "last_available_at = CASE WHEN availability = 'unavailable' THEN last_available_at ELSE fetched_at END";

/**
 * How many days a backup file of a table holding YouTube API data is kept,
 * counted from the date in its key: `video/`, `channel/` and
 * `channel_snapshot/` (see docs/reference/data.md).
 *
 * The nightly backup deletes a file itself once it reaches this age
 * (`expireFiles` in ../collector/backup.ts). A lifecycle rule of the same
 * length sits on each prefix as well, in case the job does not run: R2 only
 * says it removes an expired object "typically within 24 hours", so the rule
 * alone is not a deadline.
 */
export const R2_RETENTION_DAYS = 27;

/**
 * How long a file may outlive `R2_RETENTION_DAYS`: the backup that deletes it
 * runs once a day, so one night it fails to run is a day.
 */
export const R2_REMOVAL_DELAY_DAYS = 1;

/**
 * How old a video's values may be and still go into the nightly copy of
 * `video` in R2: 30 - 27 - 1 = 2 days.
 *
 * A row written into a file under `video/` stays in R2 for as long as the
 * file does, and its values are already as old as their last fetch - its
 * `fetched_at`, or `last_available_at` for a video the API no longer returns.
 * A row past this is left out of the copy. For an unavailable video that is
 * the end of it: nothing public counts one, and the API cannot give it back.
 * An available one past this means video-update has fallen behind, and
 * `/api/health` says so (#223).
 */
export const BACKUP_VIDEO_MAX_AGE_DAYS = RETENTION_DAYS - R2_RETENTION_DAYS - R2_REMOVAL_DELAY_DAYS;

/** The instant before which a video's last fetch keeps it out of the backup written at `now`. */
export function backupVideoCutoff(now: Date): string {
  return formatTimestamp(new Date(now.getTime() - BACKUP_VIDEO_MAX_AGE_DAYS * DAY_MS));
}
