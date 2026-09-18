import { readEditableBody } from '../lib/editable-body';
import type { Env } from '../lib/env';
import { errorResponse, jsonResponse } from '../lib/json';
import { revisionStatement } from '../lib/revision';
import { formatTimestamp } from '../lib/time';

/**
 * Reading, saving and deleting `video_override` (#141): a person's
 * correction of one video's title, type or availability, on top of what the
 * collector wrote. Effective the moment it is saved - #141's design decision
 * 5 - so unlike footprints_event or genet_stream there is no publish step.
 */

interface OverrideRow {
  video_id: string;
  title: string | null;
  type: string | null;
  availability: string | null;
  memo: string | null;
  updated_at: string;
  // Only the join in listVideoOverrides carries this; saveVideoOverride's
  // own SELECT of `video` never asks for more than existence.
  video_title?: string;
}

function present(row: OverrideRow) {
  return {
    videoId: row.video_id,
    title: row.title,
    type: row.type,
    availability: row.availability,
    memo: row.memo,
    updatedAt: row.updated_at,
    videoTitle: row.video_title,
  };
}

/** GET /admin/api/video-overrides */
export async function listVideoOverrides(env: Env): Promise<Response> {
  const { results } = await env.DB.prepare(
    `SELECT vo.video_id, vo.title, vo.type, vo.availability, vo.memo, vo.updated_at, v.title AS video_title
       FROM video_override vo
       JOIN video v ON v.video_id = vo.video_id
      ORDER BY vo.video_id`,
  ).all<OverrideRow>();

  return jsonResponse({ videoOverrides: results.map(present) });
}

const EDITABLE_OVERRIDE_KEYS = ['title', 'type', 'availability', 'memo'] as const;

type EditableOverrideKey = (typeof EDITABLE_OVERRIDE_KEYS)[number];

const TYPES = ['video', 'streaming', 'shorts'];
const AVAILABILITIES = ['public', 'membership', 'private', 'unavailable'];

/** What is wrong with one field's value, or null when it is fine - the same rules the CHECKs in migrations/0004 enforce. */
function overrideFieldProblem(key: EditableOverrideKey, value: unknown): string | null {
  switch (key) {
    case 'title':
      return value === null || (typeof value === 'string' && value !== '')
        ? null
        : 'title must be a non-empty string or null';
    case 'type':
      return value === null || (typeof value === 'string' && TYPES.includes(value))
        ? null
        : `type must be one of ${TYPES.join(', ')}, or null`;
    case 'availability':
      return value === null || (typeof value === 'string' && AVAILABILITIES.includes(value))
        ? null
        : `availability must be one of ${AVAILABILITIES.join(', ')}, or null`;
    case 'memo':
      return value === null || typeof value === 'string' ? null : 'memo must be a string or null';
  }
}

/** PUT /admin/api/video-overrides/:videoId. 404 when the video itself does not exist. */
export async function saveVideoOverride(
  env: Env,
  videoId: string,
  body: Record<string, unknown>,
  now: Date = new Date(),
): Promise<Response> {
  const video = await env.DB.prepare('SELECT 1 FROM video WHERE video_id = ?1').bind(videoId).first();

  if (video === null) return errorResponse(404, `no video ${videoId}`);

  const read = readEditableBody(body, EDITABLE_OVERRIDE_KEYS, overrideFieldProblem);

  if ('error' in read) return read.error;

  const { values } = read;

  const title = values.title as string | null;
  const type = values.type as string | null;
  const availability = values.availability as string | null;
  const memo = values.memo as string | null;

  // The same CHECK migrations/0004 puts on the row: an override that
  // overrides nothing is refused here rather than left to reach D1's own.
  if (title === null && type === null && availability === null) {
    return errorResponse(400, 'at least one of title, type and availability must not be null');
  }

  // Set explicitly on both the insert and the update branch: ON CONFLICT DO
  // UPDATE only touches the columns its SET clause names, so updated_at
  // would otherwise keep its old value across an edit instead of the DEFAULT
  // ever being asked again.
  const updatedAt = formatTimestamp(now);
  const row: OverrideRow = { video_id: videoId, title, type, availability, memo, updated_at: updatedAt };
  // The revision body carries the row as it now stands, minus updated_at -
  // that is the "日時の列" #141's design excludes, not a value the save
  // itself decided.
  const revisionBody = { video_id: videoId, title, type, availability, memo };

  const results = await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO video_override (video_id, title, type, availability, memo, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6)
       ON CONFLICT (video_id) DO UPDATE SET
         title = excluded.title, type = excluded.type, availability = excluded.availability,
         memo = excluded.memo, updated_at = excluded.updated_at`,
    ).bind(videoId, title, type, availability, memo, updatedAt),
    revisionStatement(env.DB, 'video_override', videoId, 'save', revisionBody),
  ]);

  return jsonResponse({ videoOverride: present(row), revisionId: results[1].meta.last_row_id });
}

/** DELETE /admin/api/video-overrides/:videoId. 404 when there is no override to delete. */
export async function deleteVideoOverride(env: Env, videoId: string): Promise<Response> {
  const existing = await env.DB.prepare('SELECT 1 FROM video_override WHERE video_id = ?1').bind(videoId).first();

  if (existing === null) return errorResponse(404, `no override for video ${videoId}`);

  // The existence check above answers 404 for a row already gone when the
  // request arrived, but a second request can still delete the same row
  // between that check and this batch running. Ordering the revision INSERT
  // before the DELETE, and gating it on EXISTS, ties "did we log a revision"
  // to the row as this batch actually found it: the loser of that race still
  // gets a 200 (this does not add a second existence check to prevent that),
  // but it no longer logs a revision for a delete that deleted nothing.
  // meta.changes is not used here - D1 does not document it as a reliable
  // row count.
  const results = await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO revision (entity, entity_key, action, body, created_via)
       SELECT 'video_override', ?1, 'delete', NULL, 'admin'
       WHERE EXISTS (SELECT 1 FROM video_override WHERE video_id = ?1)`,
    ).bind(videoId),
    env.DB.prepare('DELETE FROM video_override WHERE video_id = ?1').bind(videoId),
  ]);

  return jsonResponse({ revisionId: results[0].meta.last_row_id });
}
