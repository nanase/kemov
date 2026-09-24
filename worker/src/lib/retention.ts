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
export const RETENTION_TICK_MINUTES = 10;

/** Whether the tick running at `now` is the one each hour that deletes. */
export function isRetentionTick(now: Date): boolean {
  return now.getUTCMinutes() < RETENTION_TICK_MINUTES;
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
 * The lifecycle rule set on `channel_snapshot/` and `video/` in the backup
 * bucket, in days (see docs/reference/data.md). The rule itself lives in
 * Cloudflare; it is here because the figure below is worked out from it.
 */
export const R2_RETENTION_DAYS = 27;

/**
 * How long R2 may take to remove an object past its rule: "typically within
 * 24 hours", in Cloudflare's own documentation.
 */
export const R2_REMOVAL_DELAY_DAYS = 1;

/**
 * How many days an unavailable video may have been out of reach and still
 * go into the nightly copy of `video` in R2: 30 - 27 - 1 = 2.
 *
 * A row written into a file under `video/` stays in R2 for as long as the
 * file does, and an unavailable row's values are already as old as its
 * `last_available_at` when it is written. A row past this is left out of the
 * copy, which means a restore does not bring it back: nothing public counts
 * an unavailable video, and the API cannot give it back either way.
 */
export const BACKUP_UNAVAILABLE_DAYS = RETENTION_DAYS - R2_RETENTION_DAYS - R2_REMOVAL_DELAY_DAYS;

/** The instant before which an unavailable video stays out of the backup written at `now`. */
export function backupUnavailableCutoff(now: Date): string {
  return formatTimestamp(new Date(now.getTime() - BACKUP_UNAVAILABLE_DAYS * DAY_MS));
}
