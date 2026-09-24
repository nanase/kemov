import type { Env } from '../lib/env';
import { errorResponse, jsonResponse } from '../lib/json';
import { LAST_AVAILABLE_AT_ON_UNAVAILABLE } from '../lib/retention';
import { formatTimestamp } from '../lib/time';

/**
 * Reading and settling `collect_task` rows the collector could not finish
 * (#141's "収集の失敗", #144's task 13). Read-only for the list, and the three
 * exits #141 already decided: retry, acknowledge, or settle a video as gone.
 * None of the three logs a `revision` - this is the collector's own
 * bookkeeping, not data a person authored (see the handoff).
 */

interface TaskRow {
  kind: string;
  target_id: string;
  state: string;
  attempts: number;
  next_attempt_at: string | null;
  updated_at: string;
  checked_at: string | null;
}

function presentTask(row: TaskRow) {
  return {
    kind: row.kind,
    targetId: row.target_id,
    state: row.state,
    attempts: row.attempts,
    nextAttemptAt: row.next_attempt_at,
    updatedAt: row.updated_at,
    checkedAt: row.checked_at,
  };
}

interface ListedTaskRow extends TaskRow {
  channel_name: string | null;
  video_title: string | null;
}

/**
 * `video_discover` holds both a channel's playlist call and one video's own
 * write in the same `kind` (see `worker/src/api/health.ts`'s own comment on
 * this) - the id shape cannot tell them apart, so this joins to `channel`
 * instead. `channel_stats` is always a channel; `video_update` and
 * `chat_replay` are always a video.
 */
function isChannelFailure(kind: string, foundInChannelTable: boolean): boolean {
  return kind === 'channel_stats' || (kind === 'video_discover' && foundInChannelTable);
}

function presentListed(row: ListedTaskRow) {
  return {
    ...presentTask(row),
    displayName: row.channel_name ?? row.video_title,
    isChannelFailure: isChannelFailure(row.kind, row.channel_name !== null),
  };
}

// Collection failures are ordinarily a handful of rows - a channel or two,
// maybe a few videos during a YouTube outage. 1,000 is well above any normal
// count, so a range past it reads as collection itself being broken (all 11
// channels and hundreds of videos failing at once) rather than as a list
// this screen should silently truncate.
const TASK_ROW_LIMIT = 1000;

/**
 * GET /admin/api/collect-tasks - every `failed` task a person has not yet
 * acknowledged (`checked_at IS NULL`). An acknowledged failure drops off this
 * list until collection either succeeds (clearing `checked_at`, see
 * collector/channel-stats.ts and collector/video.ts) or fails again.
 */
export async function listCollectTasks(env: Env): Promise<Response> {
  const { results } = await env.DB.prepare(
    `SELECT ct.kind, ct.target_id, ct.state, ct.attempts, ct.next_attempt_at, ct.updated_at, ct.checked_at,
            c.name AS channel_name, v.title AS video_title
       FROM collect_task ct
       LEFT JOIN channel c ON c.channel_id = ct.target_id
       LEFT JOIN video v ON v.video_id = ct.target_id
      WHERE ct.state = 'failed' AND ct.checked_at IS NULL
      ORDER BY ct.updated_at DESC
      LIMIT ${TASK_ROW_LIMIT + 1}`,
  ).all<ListedTaskRow>();

  if (results.length > TASK_ROW_LIMIT) {
    return errorResponse(400, `more than ${TASK_ROW_LIMIT} failing tasks - collection itself needs attention`);
  }

  return jsonResponse({ collectTasks: results.map(presentListed), count: results.length });
}

/**
 * POST /admin/api/collect-tasks/:kind/:targetId/retry - back to `pending`,
 * due now. 404 when there is no such row.
 *
 * Also clears `checked_at`: `listCollectTasks` only surfaces a `failed` row
 * once `checked_at IS NULL`, so a task retried after being acknowledged
 * would otherwise fail again with the old acknowledgement still in place and
 * never reappear in that list - the renewed failure would go unseen rather
 * than merely unstyled.
 */
export async function retryCollectTask(env: Env, kind: string, targetId: string, now: Date): Promise<Response> {
  const timestamp = formatTimestamp(now);

  const row = await env.DB.prepare(
    `UPDATE collect_task
        SET state = 'pending', next_attempt_at = ?3, checked_at = NULL, updated_at = ?3
      WHERE kind = ?1 AND target_id = ?2
      RETURNING kind, target_id, state, attempts, next_attempt_at, updated_at, checked_at`,
  )
    .bind(kind, targetId, timestamp)
    .first<TaskRow>();

  if (row === null) return errorResponse(404, `no collect_task ${kind} ${targetId}`);

  return jsonResponse({ collectTask: presentTask(row) });
}

/** POST /admin/api/collect-tasks/:kind/:targetId/ack - stops retrying, remembers when. 404 when there is no such row. */
export async function ackCollectTask(env: Env, kind: string, targetId: string, now: Date): Promise<Response> {
  const timestamp = formatTimestamp(now);

  const row = await env.DB.prepare(
    `UPDATE collect_task
        SET checked_at = ?3, updated_at = ?3
      WHERE kind = ?1 AND target_id = ?2
      RETURNING kind, target_id, state, attempts, next_attempt_at, updated_at, checked_at`,
  )
    .bind(kind, targetId, timestamp)
    .first<TaskRow>();

  if (row === null) return errorResponse(404, `no collect_task ${kind} ${targetId}`);

  return jsonResponse({ collectTask: presentTask(row) });
}

/**
 * POST /admin/api/collect-tasks/:kind/:targetId/unavailable - settles a
 * video's own failure by confirming it is gone, the same verdict the
 * collector itself reaches when the API names the other videos but not this
 * one (see collector/video.ts's own `missedStatement`). Refused for a
 * channel failure (400): a channel going missing is not this operation's
 * call to make. 404 when there is no `collect_task` row, or when there is one
 * but no `video` row to mark unavailable - this never creates one.
 */
export async function markCollectTaskUnavailable(
  env: Env,
  kind: string,
  targetId: string,
  now: Date,
): Promise<Response> {
  const lookup = await env.DB.prepare(
    `SELECT ct.kind AS kind,
            (SELECT 1 FROM channel WHERE channel_id = ct.target_id) AS is_channel,
            (SELECT 1 FROM video WHERE video_id = ct.target_id) AS is_video
       FROM collect_task ct
      WHERE ct.kind = ?1 AND ct.target_id = ?2`,
  )
    .bind(kind, targetId)
    .first<{ kind: string; is_channel: number | null; is_video: number | null }>();

  if (lookup === null) return errorResponse(404, `no collect_task ${kind} ${targetId}`);

  if (isChannelFailure(lookup.kind, lookup.is_channel !== null)) {
    return errorResponse(400, 'unavailable only applies to a video, not a channel');
  }

  if (lookup.is_video === null) return errorResponse(404, `no video row for ${targetId} to mark unavailable`);

  const timestamp = formatTimestamp(now);

  const results = await env.DB.batch([
    // fetched_at has not moved since the last pass that got the video, which
    // is what a failing row means, so it is the right start for the 30 days.
    env.DB.prepare(
      `UPDATE video
          SET availability = 'unavailable',
              ${LAST_AVAILABLE_AT_ON_UNAVAILABLE}
        WHERE video_id = ?1`,
    ).bind(targetId),
    env.DB.prepare(
      `UPDATE collect_task
          SET state = 'unavailable', next_attempt_at = NULL, checked_at = NULL, updated_at = ?3
        WHERE kind = ?1 AND target_id = ?2
        RETURNING kind, target_id, state, attempts, next_attempt_at, updated_at, checked_at`,
    ).bind(kind, targetId, timestamp),
  ]);

  const row = results[1].results[0] as TaskRow;

  return jsonResponse({ collectTask: presentTask(row) });
}
