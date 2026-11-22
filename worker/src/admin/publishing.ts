import { byteLength } from '../lib/backup';
import type { Env } from '../lib/env';
import type { RevisionEntity } from '../lib/revision';

/**
 * The publishing flow #277 decided (#281): a row is a draft or it is live,
 * and 「公開」, a live row's 「保存」 and 「非公開に戻す」 each reach the public
 * JSON in the one request that pressed them - there is no 「いま公開する」 in
 * between. Written for あしあと first, and so that 登録者数の節目 (#283) and
 * ジェネット楽曲一覧 (#284) can go through it too.
 *
 * What is the same for all three lives here: the order of the writes, and
 * what is left behind when one of them fails. What differs - which fields a
 * row has, what lets it publish, what its revision body and its public JSON
 * look like - is the caller's, handed in as a `PublishTarget` and as the
 * statements that save the row.
 *
 * The JSON is written before anything is recorded, and the row, its
 * revision and the `publication` row are then recorded in one batch:
 *
 * - When the JSON cannot be written, nothing is recorded, so a row is never
 *   called live, and no revision says it was published, while the public
 *   site does not have it. The caller decides what to save instead
 * - When the batch fails after the JSON was written, the public site is
 *   ahead of `revision` until the next publish, which builds from `revision`
 *   and so takes it back out. That needs D1 to fail right after R2 did not,
 *   and the request answers an error, so the person tries again
 *
 * Two requests publishing at once can each build the JSON without the
 * other's change, and the later write wins. Left open: the admin site is
 * used by one person at a time, behind Cloudflare Access.
 */

export interface PublishTarget {
  entity: RevisionEntity;
  /** `publication.target`. */
  target: string;
  /** Where in `PUBLIC_DATA` the JSON lives. */
  objectKey: string;
  /** The working table and its key column, which the revision is logged only while the row is still in. */
  table: string;
  keyColumn: string;
  /**
   * The public JSON's text, built from the latest revision of every entity of
   * `entity` with `change` applied over its own: a `publish` body in place of
   * whatever `change.key` had, or `null` to leave `change.key` out.
   */
  buildJson(env: Env, now: Date, change: RevisionChange): Promise<string>;
}

export interface RevisionChange {
  key: string;
  action: 'publish' | 'withdraw';
  /** The `publish` revision's body; null for `withdraw`, which has nothing left to publish. */
  body: Record<string, unknown> | null;
}

/**
 * `revisionId` is null when the row was gone by the time the batch ran - a
 * delete in between - and no revision was logged for it. `publicationId` is
 * null when, besides, no revision of `entity` exists at all: a publication
 * names the newest revision it was built from, and there is none.
 */
export type PublishOutcome =
  | { written: true; revisionId: number | null; publicationId: number | null; byteLength: number }
  | { written: false; error: string };

export interface LatestRevisionRow {
  entity_key: string;
  revision_id: number;
  action: string;
  body: string | null;
}

/** The latest `revision` row of every entity of `entity` that has one. */
export async function latestRevisions(env: Env, entity: RevisionEntity): Promise<LatestRevisionRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT r.entity_key, r.revision_id, r.action, r.body
       FROM revision r
       JOIN (SELECT entity_key, MAX(revision_id) AS revision_id
               FROM revision
              WHERE entity = ?1
              GROUP BY entity_key) latest
         ON latest.entity_key = r.entity_key AND latest.revision_id = r.revision_id
      WHERE r.entity = ?1`,
  )
    .bind(entity)
    .all<LatestRevisionRow>();

  return results;
}

/**
 * The bodies the public JSON is built from: every entity's latest revision
 * that is a `publish`, with `change` applied over its own. Parsed, and in no
 * particular order - the caller sorts them as its JSON wants.
 */
export function liveBodies(latest: readonly LatestRevisionRow[], change: RevisionChange): Record<string, unknown>[] {
  const others = latest
    .filter((row) => row.entity_key !== change.key && row.action !== 'withdraw' && row.body !== null)
    .map((row) => JSON.parse(row.body!) as Record<string, unknown>);

  return change.body === null ? others : [...others, change.body];
}

/**
 * Writes `target`'s JSON with `change` applied, then records `rowStatements`
 * (the row's own save, its new status), the revision for `change` and the
 * `publication` row in one batch. The revision is logged after
 * `rowStatements`, and the publication row after it, so the publication
 * names the revision this same batch logged.
 *
 * `{ written: false }` is answered, and nothing run, when the JSON cannot be
 * written to R2. A failure to read what the JSON is built from, and a failure
 * of the batch, are thrown, as any D1 failure is.
 *
 * The revision is logged only while the row is still there, as
 * `revisionStatement` (lib/revision.ts) cannot say: a row deleted between the
 * caller's read and this batch gets no `publish` revision, so the next build
 * of the JSON leaves it out again instead of keeping it there for good with
 * no row left to withdraw.
 */
export async function publishChange(
  env: Env,
  target: PublishTarget,
  change: RevisionChange,
  rowStatements: readonly D1PreparedStatement[],
  now: Date,
): Promise<PublishOutcome> {
  const json = await target.buildJson(env, now, change);

  try {
    await env.PUBLIC_DATA.put(target.objectKey, json, {
      httpMetadata: { contentType: 'application/json; charset=UTF-8' },
    });
  } catch (error) {
    return { written: false, error: String(error) };
  }

  const jsonByteLength = byteLength(json);

  const results = await env.DB.batch([
    ...rowStatements,
    env.DB.prepare(
      `INSERT INTO revision (entity, entity_key, action, body, created_via)
       SELECT ?1, ?2, ?3, ?4, 'admin'
       WHERE EXISTS (SELECT 1 FROM ${target.table} WHERE ${target.keyColumn} = ?2)`,
    ).bind(target.entity, change.key, change.action, change.body === null ? null : JSON.stringify(change.body)),
    env.DB.prepare(
      `INSERT INTO publication (target, last_revision_id, object_key, byte_length)
       SELECT ?1, MAX(revision_id), ?2, ?3 FROM revision WHERE entity = ?4 HAVING MAX(revision_id) IS NOT NULL`,
    ).bind(target.target, target.objectKey, jsonByteLength, target.entity),
  ]);

  const revision = results.at(-2)!;
  const publication = results.at(-1)!;

  return {
    written: true,
    revisionId: revision.meta.changes > 0 ? revision.meta.last_row_id : null,
    publicationId: publication.meta.changes > 0 ? publication.meta.last_row_id : null,
    byteLength: jsonByteLength,
  };
}
