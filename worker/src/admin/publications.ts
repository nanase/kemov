import type { Env } from '../lib/env';
import { jsonResponse } from '../lib/json';

/**
 * Reading `publication` (#141's "版の履歴" screen also shows this, #144's
 * task 13). Read-only and append-only, the same as revisions.ts - nothing
 * here writes a row; footprints-publish.ts's own `publishFootprintsNow` is
 * the one place that does.
 */

// Unlike collect-tasks.ts's or revisions.ts's own caps, this one is never hit
// by a normal caller: publication only grows when a person actually
// publishes, which happens rarely enough that even every publication this
// project will ever make comfortably fits under it. Kept anyway, and silent
// rather than a 400, because this screen's own use ("what published, most
// recently") only ever wants the newest rows - an old one falling off the
// end costs nothing a caller here would notice.
const PUBLICATION_ROW_LIMIT = 200;

interface PublicationRow {
  publication_id: number;
  target: string;
  last_revision_id: number;
  object_key: string;
  byte_length: number;
  published_at: string;
}

function present(row: PublicationRow) {
  return {
    publicationId: row.publication_id,
    target: row.target,
    lastRevisionId: row.last_revision_id,
    objectKey: row.object_key,
    byteLength: row.byte_length,
    publishedAt: row.published_at,
  };
}

/** GET /admin/api/publications - every publish, most recent first. */
export async function listPublications(env: Env): Promise<Response> {
  const { results } = await env.DB.prepare(
    `SELECT publication_id, target, last_revision_id, object_key, byte_length, published_at
       FROM publication
      ORDER BY publication_id DESC
      LIMIT ${PUBLICATION_ROW_LIMIT}`,
  ).all<PublicationRow>();

  return jsonResponse({ publications: results.map(present) });
}
