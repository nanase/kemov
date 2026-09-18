import type { Env } from '../lib/env';
import { errorResponse, jsonResponse } from '../lib/json';
import { revisionStatement } from '../lib/revision';

/**
 * Reading, saving and deleting `channel_snapshot_exclusion` (#141): marking
 * one channel's one collection tick as excluded from aggregation. Effective
 * the moment it is saved - #141's design decision 5 - so unlike
 * footprints_event or genet_stream there is no publish step.
 */

interface ExclusionRow {
  channel_id: string;
  fetched_at: string;
  reason: string;
  created_at: string;
}

function present(row: ExclusionRow) {
  return {
    channelId: row.channel_id,
    fetchedAt: row.fetched_at,
    reason: row.reason,
    createdAt: row.created_at,
  };
}

/** `channel_snapshot_exclusion`'s entity_key, the one entity #141's design spells differently from its bare primary key. */
function entityKey(channelId: string, fetchedAt: string): string {
  return `${channelId}/${fetchedAt}`;
}

/** GET /admin/api/snapshot-exclusions */
export async function listSnapshotExclusions(env: Env): Promise<Response> {
  const { results } = await env.DB.prepare(
    `SELECT channel_id, fetched_at, reason, created_at
       FROM channel_snapshot_exclusion
      ORDER BY fetched_at DESC`,
  ).all<ExclusionRow>();

  return jsonResponse({ snapshotExclusions: results.map(present) });
}

/**
 * PUT /admin/api/snapshot-exclusions/:channelId/:fetchedAt.
 *
 * 404 when `channel_snapshot` has no row for that channel and tick: the
 * composite foreign key would refuse the write anyway, and this is the same
 * refusal with a caller-readable reason instead of a constraint error.
 */
export async function saveSnapshotExclusion(
  env: Env,
  channelId: string,
  fetchedAt: string,
  body: Record<string, unknown>,
): Promise<Response> {
  const tick = await env.DB.prepare('SELECT 1 FROM channel_snapshot WHERE channel_id = ?1 AND fetched_at = ?2')
    .bind(channelId, fetchedAt)
    .first();

  if (tick === null) return errorResponse(404, `no snapshot tick ${channelId} ${fetchedAt}`);

  const keys = Object.keys(body);
  const unknownKey = keys.find((key) => key !== 'reason');

  if (unknownKey !== undefined) return errorResponse(400, `${unknownKey} cannot be saved`);

  const reason = body.reason ?? null;

  if (typeof reason !== 'string' || reason === '') return errorResponse(400, 'reason must be a non-empty string');

  // created_at is not set here on purpose, on either branch of the upsert: a
  // save that only changes reason must not move when the exclusion is
  // considered to have been made, and it is also the "日時の列" #141's
  // design excludes from the revision body regardless.
  const revisionBody = { channel_id: channelId, fetched_at: fetchedAt, reason };

  const results = await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO channel_snapshot_exclusion (channel_id, fetched_at, reason)
       VALUES (?1, ?2, ?3)
       ON CONFLICT (channel_id, fetched_at) DO UPDATE SET reason = excluded.reason
       RETURNING channel_id, fetched_at, reason, created_at`,
    ).bind(channelId, fetchedAt, reason),
    revisionStatement(env.DB, 'channel_snapshot_exclusion', entityKey(channelId, fetchedAt), 'save', revisionBody),
  ]);

  // RETURNING on the upsert above, rather than a third round trip to read
  // the row back: it already has to be read once to answer with it, and the
  // one write already in this batch is the only source created_at could ever
  // come from.
  const saved = results[0].results[0] as ExclusionRow;

  return jsonResponse({ snapshotExclusion: present(saved), revisionId: results[1].meta.last_row_id });
}

/** DELETE /admin/api/snapshot-exclusions/:channelId/:fetchedAt. 404 when there is no exclusion to delete. */
export async function deleteSnapshotExclusion(env: Env, channelId: string, fetchedAt: string): Promise<Response> {
  const existing = await env.DB.prepare(
    'SELECT 1 FROM channel_snapshot_exclusion WHERE channel_id = ?1 AND fetched_at = ?2',
  )
    .bind(channelId, fetchedAt)
    .first();

  if (existing === null) return errorResponse(404, `no exclusion for ${channelId} ${fetchedAt}`);

  // Same trade-off as video-overrides.ts's deleteVideoOverride: the
  // existence check above can go stale between it and this batch running, so
  // the revision INSERT is ordered before the DELETE and gated on EXISTS
  // against the row as this batch actually found it, not on meta.changes.
  const results = await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO revision (entity, entity_key, action, body, created_via)
       SELECT 'channel_snapshot_exclusion', ?3, 'delete', NULL, 'admin'
       WHERE EXISTS (SELECT 1 FROM channel_snapshot_exclusion WHERE channel_id = ?1 AND fetched_at = ?2)`,
    ).bind(channelId, fetchedAt, entityKey(channelId, fetchedAt)),
    env.DB.prepare('DELETE FROM channel_snapshot_exclusion WHERE channel_id = ?1 AND fetched_at = ?2').bind(
      channelId,
      fetchedAt,
    ),
  ]);

  return jsonResponse({ revisionId: results[0].meta.last_row_id });
}
