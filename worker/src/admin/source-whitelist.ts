import { readEditableBody } from '../lib/editable-body';
import type { Env } from '../lib/env';
import { errorResponse, jsonResponse } from '../lib/json';

/**
 * Reading, adding, annotating and removing `source_whitelist` (#175): the URL
 * prefixes a footprints event's source may point at and count as one source
 * enough by itself.
 *
 * Effective the moment it is saved, and it logs no `revision` - the list is
 * a setting of the publish gate, not something that is published, so there
 * is nothing for a version history to reproduce. Removing an entry changes
 * only what `publishEvent` accepts from then on: an event already published
 * stays published, and one whose only source it named is refused the next
 * time somebody publishes it.
 */

interface WhitelistRow {
  prefix: string;
  note: string | null;
  created_at: string;
  updated_at: string;
}

const COLUMNS = 'prefix, note, created_at, updated_at';

function present(row: WhitelistRow) {
  return { prefix: row.prefix, note: row.note, createdAt: row.created_at, updatedAt: row.updated_at };
}

/** GET /admin/api/source-whitelist */
export async function listSourceWhitelist(env: Env): Promise<Response> {
  const { results } = await env.DB.prepare(
    `SELECT ${COLUMNS} FROM source_whitelist ORDER BY rowid`,
  ).all<WhitelistRow>();

  return jsonResponse({ sourceWhitelist: results.map(present) });
}

/**
 * What is wrong with `value` as a prefix, or null when it is fine.
 *
 * The schema's own CHECK stops at `https://` and something after it. What
 * this adds is what makes the entry name a host and nothing else: the part
 * between `https://` and the first `/`, `?` or `#` must be exactly the host
 * `URL` reads out of it, which turns away a port, a user name and an
 * uppercase host - none of which a source URL is compared against - and an
 * entry that is `https://` followed by only a path.
 */
function prefixProblem(value: unknown): string | null {
  if (typeof value !== 'string') return 'prefix must be a string';

  if (!value.startsWith('https://')) return 'prefix must start with https://';

  if (/[\s\p{Cc}]/u.test(value)) return 'prefix must not contain whitespace or control characters';

  let host: string;

  try {
    host = new URL(value).hostname;
  } catch {
    return 'prefix must be a URL';
  }

  if (host === '' || value.slice('https://'.length).split(/[/?#]/, 1)[0] !== host) {
    return 'prefix must start with a lowercase host name, without a port or a user name';
  }

  return null;
}

function noteProblem(value: unknown): string | null {
  return value === null || (typeof value === 'string' && value !== '')
    ? null
    : 'note must be a non-empty string or null';
}

/**
 * POST /admin/api/source-whitelist. 409 when the prefix is already there:
 * `prefix` is the primary key, and a second row for it would be refused by
 * the schema anyway - this is the same refusal with a reason.
 */
export async function addSourceWhitelist(env: Env, body: Record<string, unknown>): Promise<Response> {
  const keys = ['prefix', 'note'] as const;
  const read = readEditableBody(body, keys, (key, value) =>
    key === 'prefix' ? prefixProblem(value) : noteProblem(value),
  );

  if ('error' in read) return read.error;

  const prefix = read.values.prefix as string;

  const existing = await env.DB.prepare('SELECT 1 FROM source_whitelist WHERE prefix = ?1').bind(prefix).first();

  if (existing !== null) return errorResponse(409, `${prefix} is already on the list`);

  const saved = await env.DB.prepare(`INSERT INTO source_whitelist (prefix, note) VALUES (?1, ?2) RETURNING ${COLUMNS}`)
    .bind(prefix, read.values.note as string | null)
    .first<WhitelistRow>();

  return jsonResponse({ sourceWhitelist: present(saved!) }, { status: 201 });
}

/**
 * PUT /admin/api/source-whitelist/:prefix. Only `note` changes: a different
 * prefix is a different entry, and is added and removed rather than edited.
 * 404 when the prefix is not on the list.
 */
export async function updateSourceWhitelist(
  env: Env,
  prefix: string,
  body: Record<string, unknown>,
): Promise<Response> {
  const existing = await env.DB.prepare('SELECT 1 FROM source_whitelist WHERE prefix = ?1').bind(prefix).first();

  if (existing === null) return errorResponse(404, `${prefix} is not on the list`);

  const read = readEditableBody(body, ['note'] as const, (_key, value) => noteProblem(value));

  if ('error' in read) return read.error;

  const saved = await env.DB.prepare(
    `UPDATE source_whitelist
        SET note = ?2, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
      WHERE prefix = ?1
      RETURNING ${COLUMNS}`,
  )
    .bind(prefix, read.values.note as string | null)
    .first<WhitelistRow>();

  // Null only when a delete landed between the check above and this UPDATE.
  if (saved === null) return errorResponse(404, `${prefix} is not on the list`);

  return jsonResponse({ sourceWhitelist: present(saved) });
}

/**
 * DELETE /admin/api/source-whitelist/:prefix. 404 when the prefix is not on
 * the list. Nothing refuses a prefix an event's source still matches:
 * refusing would make the list impossible to prune once anything used it.
 */
export async function deleteSourceWhitelist(env: Env, prefix: string): Promise<Response> {
  const existing = await env.DB.prepare('SELECT 1 FROM source_whitelist WHERE prefix = ?1').bind(prefix).first();

  if (existing === null) return errorResponse(404, `${prefix} is not on the list`);

  await env.DB.prepare('DELETE FROM source_whitelist WHERE prefix = ?1').bind(prefix).run();

  return jsonResponse({});
}
