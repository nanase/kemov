/**
 * The one place `video_override` and `channel_snapshot_exclusion` are applied.
 * Every public endpoint that reads `video` or `channel_snapshot` reads through
 * `video_effective` or `channel_snapshot_effective` instead of the base table,
 * so overriding a column or excluding a tick cannot be forgotten on one
 * endpoint while the others remember it.
 *
 * Both are a CTE prefixed onto a query's own `WITH`, not a D1 view: nothing in
 * this schema uses `CREATE VIEW` (see migrations/), and a view would need a
 * migration and a rollback pair for something that is read-only and has no
 * shape existing rows could already violate. A CTE is fixed by editing this
 * file.
 */

/**
 * `video`, with `video_override`'s title/type/availability layered over the
 * collector's own values. A NULL override column falls back to what the
 * collector wrote - `video_override`'s own CHECK already refuses a row that
 * overrides nothing, so COALESCE here never has to decide between two absent
 * values.
 *
 * Every column `video` has travels through, not only the three that can be
 * overridden, so a query can read `video_effective` exactly as it read
 * `video` before.
 */
export const VIDEO_EFFECTIVE = `video_effective AS (
    SELECT v.video_id, v.channel_id,
           COALESCE(vo.title, v.title) AS title,
           v.published_at,
           COALESCE(vo.availability, v.availability) AS availability,
           v.live_broadcast_content,
           COALESCE(vo.type, v.type) AS type,
           v.duration_seconds, v.view_count, v.like_count, v.comment_count,
           v.chat_message_count, v.chat_unique_user_count,
           v.scheduled_start_time, v.actual_start_time, v.actual_end_time, v.fetched_at
      FROM video v
      LEFT JOIN video_override vo ON vo.video_id = v.video_id
  )`;

/**
 * `channel_snapshot`, with an excluded tick left out entirely rather than
 * merely flagged. That is what lets every reader here go on asking "the
 * newest tick at or before X" without also asking "and is it excluded" -
 * the same NOT EXISTS shape ../api/channels.ts already reads history with,
 * just applied once instead of at every call site.
 */
export const CHANNEL_SNAPSHOT_EFFECTIVE = `channel_snapshot_effective AS (
    SELECT s.channel_id, s.fetched_at, s.subscriber_count, s.view_count, s.video_count
      FROM channel_snapshot s
     WHERE NOT EXISTS (
       SELECT 1 FROM channel_snapshot_exclusion e
        WHERE e.channel_id = s.channel_id AND e.fetched_at = s.fetched_at
     )
  )`;
