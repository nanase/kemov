import type { Env } from '../lib/env';
import { errorResponse, jsonResponse } from '../lib/json';
import { REVISION_ACTIONS, REVISION_ENTITIES } from '../lib/revision';
import { isSchemaDate, japanDateEndUtc, japanDateStartUtc } from '../lib/time';

/**
 * Reading `revision` (#141's "版の履歴", #144's task 13). Read-only: the table
 * is append-only by its own triggers (migrations/0005), and nothing here ever
 * writes to it - every `revision` row this project makes is logged where the
 * entity itself is saved (see ../lib/revision.ts).
 */

// A history a person browses, not a table `IN (...)` joins against, so the
// cap is about a readable page rather than a D1 bind limit: 50 matches the
// other list screens' own default, and 200 is enough to skim a busy day
// without loading the whole table.
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

interface RevisionListRow {
  revision_id: number;
  entity: string;
  entity_key: string;
  action: string;
  created_via: string;
  created_at: string;
}

function presentListed(row: RevisionListRow) {
  return {
    revisionId: row.revision_id,
    entity: row.entity,
    entityKey: row.entity_key,
    action: row.action,
    createdVia: row.created_via,
    createdAt: row.created_at,
  };
}

/**
 * GET /admin/api/revisions - `entity`, `action`, `from`/`to` (Japan-time
 * dates, both inclusive) and `limit` (default 50, refused above 200), all
 * optional. Never returns `body` - GET /admin/api/revisions/:id is the one
 * place that reads a single revision's contents.
 */
export async function listRevisions(
  env: Env,
  entity: string | null,
  action: string | null,
  fromParam: string | null,
  toParam: string | null,
  limitParam: string | null,
): Promise<Response> {
  if (entity !== null && !(REVISION_ENTITIES as readonly string[]).includes(entity)) {
    return errorResponse(400, `entity must be one of ${REVISION_ENTITIES.join(', ')}`);
  }

  if (action !== null && !(REVISION_ACTIONS as readonly string[]).includes(action)) {
    return errorResponse(400, `action must be one of ${REVISION_ACTIONS.join(', ')}`);
  }

  let limit = DEFAULT_LIMIT;

  if (limitParam !== null) {
    const parsed = Number(limitParam);

    if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > MAX_LIMIT) {
      return errorResponse(400, `limit must be an integer from 1 to ${MAX_LIMIT}`);
    }

    limit = parsed;
  }

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (entity !== null) {
    params.push(entity);
    conditions.push(`entity = ?${params.length}`);
  }

  if (action !== null) {
    params.push(action);
    conditions.push(`action = ?${params.length}`);
  }

  if (fromParam !== null) {
    if (!isSchemaDate(fromParam)) return errorResponse(400, 'from must be YYYY-MM-DD');

    params.push(japanDateStartUtc(fromParam));
    conditions.push(`created_at >= ?${params.length}`);
  }

  if (toParam !== null) {
    if (!isSchemaDate(toParam)) return errorResponse(400, 'to must be YYYY-MM-DD');

    params.push(japanDateEndUtc(toParam));
    conditions.push(`created_at < ?${params.length}`);
  }

  const where = conditions.length === 0 ? '' : `WHERE ${conditions.join(' AND ')}`;

  params.push(limit);

  const { results } = await env.DB.prepare(
    `SELECT revision_id, entity, entity_key, action, created_via, created_at
       FROM revision ${where}
      ORDER BY revision_id DESC
      LIMIT ?${params.length}`,
  )
    .bind(...params)
    .all<RevisionListRow>();

  return jsonResponse({ revisions: results.map(presentListed) });
}

interface RevisionRow extends RevisionListRow {
  body: string | null;
}

/**
 * A path segment as a `revision_id`, or null when it is not a plain positive
 * integer. The same shape as footprints.ts's own `readEventId`, duplicated
 * rather than shared: each is local to its own router match and neither
 * exports the other today (see the comment on D1_LIKE_PATTERN_BYTE_LIMIT in
 * videos.ts for the same call on a smaller duplication).
 */
export function readRevisionId(segment: string): number | null {
  if (!/^[1-9]\d*$/.test(segment)) return null;

  const value = Number(segment);

  return Number.isSafeInteger(value) ? value : null;
}

/** GET /admin/api/revisions/:id - one revision's full row, `body` parsed rather than left as a JSON string. 404 when there is none. */
export async function getRevision(env: Env, revisionId: number): Promise<Response> {
  const row = await env.DB.prepare(
    `SELECT revision_id, entity, entity_key, action, body, created_via, created_at
       FROM revision
      WHERE revision_id = ?1`,
  )
    .bind(revisionId)
    .first<RevisionRow>();

  if (row === null) return errorResponse(404, `no revision ${revisionId}`);

  return jsonResponse({
    revision: {
      ...presentListed(row),
      body: row.body === null ? null : (JSON.parse(row.body) as Record<string, unknown>),
    },
  });
}
