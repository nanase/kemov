import type { Env } from '../lib/env';
import { isRetentionTick, retentionCutoff } from '../lib/retention';

/**
 * Deleting what YouTube API Services' Developer Policies do not let this
 * site keep past 30 days (#223). Where the line falls, and why, is
 * ../lib/retention.ts.
 *
 * Two kinds of row go:
 *
 *   * `channel_snapshot`, every row older than the line, and the
 *     `channel_snapshot_exclusion` rows marking them, which the foreign key
 *     would otherwise refuse to leave behind.
 *   * A video the API stopped returning, once its `last_available_at` is
 *     older than the line - with the rows that hold a foreign key to it
 *     (`video_override`, `chat_author`) and its `collect_task` rows. A NULL
 *     there on an unavailable row is a row restored from a backup older than
 *     the column; nothing says when it was last fetched, so it goes on the
 *     first run rather than never.
 *
 * `footprints_event.video_id` and the `genet_*` tables name videos without a
 * foreign key and are left alone, as #223 decided: they are what a
 * person wrote, not what the API returned.
 *
 * Neither writes a `revision` row. `created_via` accepts only 'claude_code'
 * and 'admin', and this is neither; an exclusion or override this removes
 * keeps its last 'save' in the history. #224 owns `revision`.
 *
 * All of it is one batch, so a run either happens entirely or not at all, and
 * a failure leaves everything for the next hour's run. Whether that is
 * happening is `/api/health`'s `retention` field, read from what is left
 * rather than from whether this ran.
 */

/** The unavailable videos a run at this cutoff deletes. ?1 is the cutoff. */
const EXPIRED_VIDEOS = `SELECT video_id FROM video
  WHERE availability = 'unavailable' AND (last_available_at IS NULL OR last_available_at < ?1)`;

/**
 * `scheduledAt` decides whether this is the tick of the hour that deletes:
 * the trigger's scheduled time, so that a :00 tick that starts late still
 * counts as the :00 tick rather than skipping the hour. `now` places the
 * cutoff, since what matters there is how old a row is when it goes.
 */
export async function runRetention(env: Env, scheduledAt: Date = new Date(), now: Date = new Date()): Promise<void> {
  if (!isRetentionTick(scheduledAt)) return;

  const cutoff = retentionCutoff(now);

  // Children before parents, because the foreign keys refuse any other
  // order. The video list is asked for again by each statement rather than
  // read once and bound: a batch is one transaction, so every statement
  // sees the same rows, and binding a list would put a size on the SQL that
  // grows with how many videos went missing at once.
  const results = await env.DB.batch([
    env.DB.prepare('DELETE FROM channel_snapshot_exclusion WHERE fetched_at < ?1').bind(cutoff),
    env.DB.prepare('DELETE FROM channel_snapshot WHERE fetched_at < ?1 RETURNING channel_id').bind(cutoff),
    env.DB.prepare(`DELETE FROM chat_author WHERE video_id IN (${EXPIRED_VIDEOS})`).bind(cutoff),
    env.DB.prepare(`DELETE FROM video_override WHERE video_id IN (${EXPIRED_VIDEOS})`).bind(cutoff),
    // Only the kinds whose target is a video. video_discover also holds
    // channel targets, and a channel id is never in `video`, so the IN
    // alone already keeps those.
    env.DB.prepare(
      `DELETE FROM collect_task
        WHERE kind IN ('video_discover', 'video_update', 'chat_replay')
          AND target_id IN (${EXPIRED_VIDEOS})`,
    ).bind(cutoff),
    env.DB.prepare(
      `DELETE FROM video
        WHERE availability = 'unavailable' AND (last_available_at IS NULL OR last_available_at < ?1)
       RETURNING video_id`,
    ).bind(cutoff),
  ]);

  // Counted from RETURNING rather than meta.changes, which D1 does not
  // promise is a row count.
  console.log(
    `retention: removed ${results[1].results.length} snapshots and ${results[5].results.length} videos from before ${cutoff}`,
  );
}
