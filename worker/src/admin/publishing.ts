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
 * The JSON is written before anything is recorded, and the row and its
 * revision are then recorded in one batch:
 *
 * - When the JSON cannot be written, nothing is recorded, so a row is never
 *   called live, and no revision says it was published, while the public
 *   site does not have it. The caller decides what to save instead
 * - When the batch fails after the JSON was written, the public site is
 *   ahead of `revision` until the next publish, which builds from `revision`
 *   and so takes it back out. That needs D1 to fail right after R2 did not,
 *   and the request answers an error, so the person tries again
 *
 * Two requests publishing at once each build the JSON before the other's
 * revision is recorded, and the later write would leave the other's change
 * out. So after the batch, the JSON is checked against `revision` again:
 * when a revision was recorded that it was not built from, its `cutoff` has
 * moved on, or another request wrote it since, it is built again from
 * `revision` alone, written,
 * and checked again. Whichever request writes last has checked after every
 * revision recorded before its check, and a revision recorded after that
 * belongs to a request that checks later still and finds the JSON is not
 * its own. Only then is the `publication` row recorded, naming the newest
 * revision the JSON was checked against - unless a newer one was recorded
 * first. 「いま公開する」 goes through the same check (`republish`), so it
 * cannot write over a publish either.
 *
 * What no check in the request can mend - a write it could not bring up to
 * date, or a batch that failed after the JSON was written and could not be
 * built again - is left in `publication_write` (migration 0014): a row is
 * added there before each write is sent, and taken away by a check that
 * passed after it - the request's own, or another's once R2 had answered
 * the write. `isBehind` reads it, and each list offers 「本番に反映」
 * while it says so.
 */

/** How many times the JSON is built again after the batch, before the request says it may be behind. */
export const REBUILD_LIMIT = 3;

/**
 * How old a `publication_write` row that never finished is before any
 * request's passing check clears it: no write is still on its way to R2
 * that long after it started, so its request ended before R2 answered it,
 * and a check that passed after that has seen whatever it left.
 */
export const ABANDONED_WRITE_MINUTES = 10;

export interface PublishTarget {
  entity: RevisionEntity;
  /**
   * Other entities whose revisions the JSON is built from too - 登録者数の節目
   * names each linked event as the public timeline has it (#283). Their
   * latest revisions are read and handed to `buildJson` along with
   * `entity`'s own, and the check after the batch looks at them in the same
   * way: a revision of theirs recorded meanwhile builds the JSON again.
   */
  alsoBuiltFrom?: readonly RevisionEntity[];
  /**
   * What else the JSON is built from that no revision of `entity` or
   * `alsoBuiltFrom` shows. 登録者数の節目 names events only up to あしあと's
   * last `publication`, which あしあと's 「いま公開する」 moves on without
   * recording a revision. Read before each build, and again by the check
   * after the batch: a JSON built with another value is built again, as one
   * lacking a revision is. Compared as is.
   */
  cutoff?(env: Env): Promise<number>;
  /** `publication.target`. */
  target: string;
  /** Where in `PUBLIC_DATA` the JSON lives. */
  objectKey: string;
  /** The working table and its key column, which the revision is logged only while the row is still in. */
  table: string;
  keyColumn: string;
  /**
   * The public JSON's text, built from `latest` - the latest revision of
   * every entity of `entity`, and of `alsoBuiltFrom` (each row says which
   * it is) - with `change`, when there is one, applied over them: each
   * revision it logs (`loggedRevisions`), a `publish` body in place of
   * whatever its key had, or `null` to leave its key out.
   *
   * It may read D1 through `env` for what no revision holds. A failure there
   * is treated as one to write the JSON.
   */
  buildJson(
    env: Env,
    now: Date,
    latest: readonly LatestRevisionRow[],
    change: RevisionChange | null,
  ): string | Promise<string>;
}

export interface RevisionChange {
  key: string;
  action: 'publish' | 'withdraw';
  /** The `publish` revision's body; null for `withdraw`, which has nothing left to publish. */
  body: Record<string, unknown> | null;
  /**
   * Revisions of other entities logged in the same batch - the tunes and
   * people a stream's publish brings along (#284). Each is logged under the
   * same condition as the row's own, so a change that logs no revision for
   * its row logs none for them either, and under its own `whileLatest` too.
   * They are logged before the row's own, so that a `whileRow` reading the
   * row's own newest revision answers the same for every one of them.
   */
  alongside?: readonly LoggedRevision[];
  /**
   * A condition on the working row, as SQL over `table`'s columns, that the
   * row's own revision is logged only under. It is looked at after
   * `rowStatements` ran, so a caller whose statements write only while the
   * row is still as it was read passes what they leave the row as: a row
   * they left alone then gets no revision either, and the JSON already
   * written with the change is built again without it, as for a deleted row.
   * SQL in the caller's code, with no value a request sent written into it
   * but an integer the caller checked (`writtenAt`).
   */
  whileRow?: string;
}

/** One revision a publish logs. */
export interface LoggedRevision {
  entity: RevisionEntity;
  key: string;
  action: 'publish' | 'withdraw';
  body: Record<string, unknown> | null;
  /**
   * For an `alongside` revision: the newest revision of its entity and key,
   * 0 for none, as the caller read it before reading the row `body` was
   * made from. It is logged only while that is still the newest one (#299):
   * a tune saved in between keeps its newer revision rather than getting
   * the body read before it, and the JSON already written with that body is
   * built again from `revision`.
   */
  whileLatest?: number;
}

/** Every revision `change` logs for `target`: the row's own first, then `alongside`. */
export function loggedRevisions(target: PublishTarget, change: RevisionChange): LoggedRevision[] {
  return [
    { entity: target.entity, key: change.key, action: change.action, body: change.body },
    ...(change.alongside ?? []),
  ];
}

/**
 * `revisionId` is null when the row was gone by the time the batch ran - a
 * delete in between - or no longer met `change.whileRow`, and no revision
 * was logged for it. `loggedAlongside` is each of `change.alongside` that
 * was logged. `publicationId` is
 * null when, besides, no revision of `entity` exists at all: a publication
 * names the newest revision it was built from, and there is none. It is null
 * too when another request already recorded a publication naming a newer
 * revision (`recordPublication`).
 *
 * `written: false` with `recorded: false` is a JSON that could not be
 * written, and nothing recorded. With `recorded: true`, the row and its
 * revision were recorded, but the JSON could not be brought up to date with
 * them after the batch - a write that failed, or `REBUILD_LIMIT` rebuilds
 * that each found another change - so it may not have the change. No
 * `publication` row is recorded, which leaves the change waiting until the
 * next publish of `entity` builds the JSON again.
 */
export type PublishOutcome =
  | {
      written: true;
      revisionId: number | null;
      loggedAlongside: readonly LoggedRevision[];
      publicationId: number | null;
      byteLength: number;
    }
  | { written: false; recorded: false; error: string }
  | { written: false; recorded: true; revisionId: number | null; error: string };

export interface LatestRevisionRow {
  entity: string;
  entity_key: string;
  revision_id: number;
  action: string;
  body: string | null;
}

/** The latest `revision` row of every entity of `entity` that has one. */
export async function latestRevisions(env: Env, entity: RevisionEntity): Promise<LatestRevisionRow[]> {
  return await latestRevisionsOf(env, [entity]);
}

/**
 * `latestRevisions` for several entities at once. `revision_id` is unique
 * across the whole table, so it alone finds each latest row.
 */
async function latestRevisionsOf(env: Env, entities: readonly RevisionEntity[]): Promise<LatestRevisionRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT r.entity, r.entity_key, r.revision_id, r.action, r.body
       FROM revision r
       JOIN (SELECT MAX(revision_id) AS revision_id
               FROM revision
              WHERE entity IN (SELECT value FROM json_each(?1))
              GROUP BY entity, entity_key) latest
         ON latest.revision_id = r.revision_id`,
  )
    .bind(JSON.stringify(entities))
    .all<LatestRevisionRow>();

  return results;
}

/** The latest revisions `target`'s JSON is built from: `entity`'s and `alsoBuiltFrom`'s. */
function builtFrom(env: Env, target: PublishTarget): Promise<LatestRevisionRow[]> {
  return latestRevisionsOf(env, [target.entity, ...(target.alsoBuiltFrom ?? [])]);
}

/** `target.cutoff` as it is now, or null for a target that has none. */
async function readCutoff(env: Env, target: PublishTarget): Promise<number | null> {
  return target.cutoff === undefined ? null : await target.cutoff(env);
}

/**
 * The bodies the public JSON is built from: every entity's latest revision
 * that is a `publish`, with `change`'s own revision, when there is one,
 * applied over it. Parsed, and in no particular order - the caller sorts
 * them as its JSON wants. `latest` holds the rows of `change`'s entity
 * alone: a key is only unique within its entity. `liveBodiesOf` reads one
 * entity out of several.
 */
export function liveBodies(
  latest: readonly LatestRevisionRow[],
  change: RevisionChange | null,
): Record<string, unknown>[] {
  const others = latest
    .filter((row) => row.entity_key !== change?.key && row.action !== 'withdraw' && row.body !== null)
    .map((row) => JSON.parse(row.body!) as Record<string, unknown>);

  return change === null || change.body === null ? others : [...others, change.body];
}

/**
 * `liveBodies` for `entity`'s rows among `latest`, with every one of
 * `logged` that is of `entity` applied over them. Of several for one key,
 * the last is the one applied, as a rebuild from `revision` would read it.
 */
export function liveBodiesOf(
  latest: readonly LatestRevisionRow[],
  entity: RevisionEntity,
  logged: readonly LoggedRevision[],
): Record<string, unknown>[] {
  const own = [
    ...new Map(
      logged.filter((revision) => revision.entity === entity).map((revision) => [revision.key, revision] as const),
    ).values(),
  ];
  const keys = new Set(own.map((revision) => revision.key));
  const others = latest
    .filter(
      (row) => row.entity === entity && !keys.has(row.entity_key) && row.action !== 'withdraw' && row.body !== null,
    )
    .map((row) => JSON.parse(row.body!) as Record<string, unknown>);

  return [...others, ...own.flatMap((revision) => (revision.body === null ? [] : [revision.body]))];
}

function bodyText(body: Record<string, unknown> | null): string | null {
  return body === null ? null : JSON.stringify(body);
}

/** The newest `revision_id` among `latest`, or 0 when there is none. */
function newestRevisionId(latest: readonly LatestRevisionRow[]): number {
  return latest.reduce((max, row) => Math.max(max, row.revision_id), 0);
}

/**
 * Adds the `publication_write` row for one write of `target`'s JSON, and
 * answers its id - before the write is sent, so the JSON is never written
 * without D1 knowing that it may now be behind.
 */
async function startWrite(env: Env, target: PublishTarget): Promise<number> {
  const row = await env.DB.prepare('INSERT INTO publication_write (target) VALUES (?1) RETURNING write_id')
    .bind(target.target)
    .first<{ write_id: number }>();

  return row!.write_id;
}

/**
 * Takes away the rows of `writeIds` - this request's own writes, and the
 * writes R2 had answered before its check looked at R2 - and every row of
 * `target` older than `ABANDONED_WRITE_MINUTES`. Another request's write
 * still on its way stays: it may land after this check, and only a check
 * after it can say it did no harm. A failure here is not answered: the rows
 * stay, and the list offers to build the JSON again, which costs
 * nothing.
 */
async function clearWrites(env: Env, target: PublishTarget, writeIds: readonly number[]): Promise<void> {
  try {
    await env.DB.prepare(
      `DELETE FROM publication_write
        WHERE target = ?1
          AND (write_id IN (SELECT value FROM json_each(?2))
               OR started_at < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', ?3))`,
    )
      .bind(target.target, JSON.stringify(writeIds), `-${ABANDONED_WRITE_MINUTES} minutes`)
      .run();
  } catch {
    // Left in place; see above.
  }
}

/** Whether a write of `target`'s JSON was sent that its own check has not found up to date. */
export async function isBehind(env: Env, target: string): Promise<boolean> {
  const row = await env.DB.prepare('SELECT 1 FROM publication_write WHERE target = ?1 LIMIT 1').bind(target).first();

  return row !== null;
}

/**
 * Writes `json` to `target`'s object, and answers the version R2 gave this
 * write. Once R2 has answered, either way, the write's row is marked
 * finished: a write R2 failed may still have been taken, but it is no longer
 * on its way, so a check that looks at R2 after this sees what it left.
 */
async function putObject(env: Env, target: PublishTarget, json: string, writeId: number): Promise<string> {
  try {
    const put = await env.PUBLIC_DATA.put(target.objectKey, json, {
      httpMetadata: { contentType: 'application/json; charset=UTF-8' },
    });

    return put.version;
  } finally {
    await env.DB.prepare('UPDATE publication_write SET finished = 1 WHERE write_id = ?1')
      .bind(writeId)
      .run()
      // Left unfinished, it is cleared once it is old enough.
      .catch(() => null);
  }
}

/** The rows of `target`'s writes that R2 has answered. */
async function finishedWrites(env: Env, target: PublishTarget): Promise<number[]> {
  const { results } = await env.DB.prepare('SELECT write_id FROM publication_write WHERE target = ?1 AND finished = 1')
    .bind(target.target)
    .all<{ write_id: number }>();

  return results.map((row) => row.write_id);
}

/**
 * Adds the write's row, then writes `json` to `target`'s object, and answers
 * the version R2 gave it with the row's id. A failure to add the row is
 * thrown before anything is sent; a failure of R2 is thrown with the row
 * left in place, since R2 may have taken a write it then failed to answer.
 */
async function putJson(env: Env, target: PublishTarget, json: string): Promise<{ version: string; writeId: number }> {
  const writeId = await startWrite(env, target);

  return { version: await putObject(env, target, json, writeId), writeId };
}

/**
 * What the JSON this request last wrote was built from: every revision up to
 * `builtFrom`, and `own` - the ids of this request's revisions, whose bodies
 * the JSON already had before they were recorded.
 */
interface Written {
  builtFrom: number;
  /** `target.cutoff`, read before the JSON was built. */
  cutoff: number | null;
  own: readonly number[];
  version: string;
  /** The `publication_write` rows of every write this request has sent. */
  writeIds: readonly number[];
  byteLength: number;
}

/** Whether `latest` has a revision that the JSON `written` describes was not built from. */
function hasNewer(latest: readonly LatestRevisionRow[], written: Written): boolean {
  return latest.some((row) => row.revision_id > written.builtFrom && !written.own.includes(row.revision_id));
}

/**
 * A JSON found up to date: the revisions it was last checked against, what
 * was written, and the writes R2 had answered before the check looked at it.
 */
interface UpToDate {
  current: true;
  latest: readonly LatestRevisionRow[];
  written: Written;
  finishedBefore: readonly number[];
}

/**
 * Builds the JSON again from `revision` until nothing was recorded that it
 * lacks and no other request wrote it since, at most `REBUILD_LIMIT` times.
 * Answers the revisions it was last checked against, or why it could not be
 * brought up to date.
 *
 * `trusted` is false when `first` is wrong in a way `revision` cannot show:
 * it carries a change that was never recorded, so it is built again
 * whatever the check would say.
 */
async function bringUpToDate(
  env: Env,
  target: PublishTarget,
  now: Date,
  first: Written,
  trusted: boolean,
): Promise<UpToDate | { current: false; error: string }> {
  let written = first;
  let checkable = trusted;

  for (let rebuilds = 0; ; rebuilds += 1) {
    let latest: LatestRevisionRow[];
    let cutoff: number | null;

    // Caught, unlike the read before anything was written: the change is
    // recorded by now, and the caller must say so rather than fail as if
    // nothing had been saved.
    try {
      latest = await builtFrom(env, target);
      cutoff = await readCutoff(env, target);
    } catch (error) {
      return { current: false, error: String(error) };
    }

    if (checkable && !hasNewer(latest, written) && cutoff === written.cutoff) {
      let finishedBefore: number[];
      let head: R2Object | null;

      // Read before R2 is looked at: a write answered after that may have
      // landed after the JSON the check finds.
      try {
        finishedBefore = await finishedWrites(env, target);
        head = await env.PUBLIC_DATA.head(target.objectKey);
      } catch (error) {
        return { current: false, error: String(error) };
      }

      if (head?.version === written.version) return { current: true, latest, written, finishedBefore };
    }

    if (rebuilds === REBUILD_LIMIT) {
      return { current: false, error: `${target.objectKey} was still behind after ${REBUILD_LIMIT} rebuilds` };
    }

    try {
      const json = await target.buildJson(env, now, latest, null);
      const put = await putJson(env, target, json);

      written = {
        builtFrom: newestRevisionId(latest),
        cutoff,
        own: [],
        version: put.version,
        writeIds: [...written.writeIds, put.writeId],
        byteLength: byteLength(json),
      };
    } catch (error) {
      return { current: false, error: String(error) };
    }

    checkable = true;
  }
}

/**
 * Writes `target`'s JSON with `change` applied, then records `rowStatements`
 * (the row's own save, its new status) and the revisions for `change` in one
 * batch, brings the JSON up to date with whatever else was recorded
 * meanwhile (`bringUpToDate`), and records the `publication` row naming the
 * newest revision the JSON has.
 *
 * `{ written: false, recorded: false }` is answered, and nothing run, when
 * the JSON cannot be written to R2. A failure to read what the JSON is built
 * from, or to count the write, is thrown before anything is written, as any
 * D1 failure is. So is a failure of the batch, once the JSON was built again
 * from `revision` - which the failed batch left as it was - or left in
 * `publication_write` when that could not be done either.
 *
 * The row's own revision is logged only while the row is still there, and
 * meets `change.whileRow` when there is one, as `revisionStatement`
 * (lib/revision.ts) cannot say: a row deleted between the caller's read and
 * this batch gets no `publish` revision, and the JSON already written with
 * its body is built again without it. `alongside` is logged under the same
 * condition, and each under its own `whileLatest`. The JSON written before
 * the batch is trusted only when every revision it was built with was
 * logged: one left out is a body nothing recorded.
 */
export async function publishChange(
  env: Env,
  target: PublishTarget,
  change: RevisionChange,
  rowStatements: readonly D1PreparedStatement[],
  now: Date,
): Promise<PublishOutcome> {
  const before = await builtFrom(env, target);
  // Read before the build, which may read it too: one that moves on in
  // between makes the check build again, which costs a write and no more.
  const cutoff = await readCutoff(env, target);
  const json = await target.buildJson(env, now, before, change);
  const writeId = await startWrite(env, target);
  let version: string;

  try {
    version = await putObject(env, target, json, writeId);
  } catch (error) {
    return { written: false, recorded: false, error: String(error) };
  }

  const first = {
    builtFrom: newestRevisionId(before),
    cutoff,
    version,
    writeIds: [writeId],
    byteLength: byteLength(json),
  };
  let results: D1Result[];
  // The row still there, and as `whileRow` asks: what each revision of the batch is logged under.
  const rowStill = `EXISTS (SELECT 1 FROM ${target.table}
                     WHERE ${target.keyColumn} = ?5${change.whileRow === undefined ? '' : ` AND (${change.whileRow})`})`;
  const logRevision = (revision: LoggedRevision) =>
    env.DB.prepare(
      `INSERT INTO revision (entity, entity_key, action, body, created_via)
       SELECT ?1, ?2, ?3, ?4, 'admin'
       WHERE ${rowStill}
         AND (?6 IS NULL
              OR (SELECT COALESCE(MAX(revision_id), 0) FROM revision WHERE entity = ?1 AND entity_key = ?2) = ?6)`,
    ).bind(
      revision.entity,
      revision.key,
      revision.action,
      bodyText(revision.body),
      change.key,
      revision.whileLatest ?? null,
    );
  const [own, ...alongside] = loggedRevisions(target, change);

  try {
    // The row's own last: see `RevisionChange.alongside`.
    results = await env.DB.batch([...rowStatements, ...alongside.map(logRevision), logRevision(own!)]);
  } catch (error) {
    // The JSON has a change nothing recorded: built again from `revision`,
    // or left in `publication_write` for the list's 「本番に反映」 when that fails too.
    const repaired = await bringUpToDate(env, target, now, { ...first, own: [] }, false);

    if (repaired.current) await settle(env, target, repaired).catch(() => null);

    throw error;
  }

  const revision = results[results.length - 1]!;
  const revisionId = revision.meta.changes > 0 ? revision.meta.last_row_id : null;
  const alongsideResults = results.slice(rowStatements.length, results.length - 1);
  const loggedAlongside = alongside.filter((_, index) => alongsideResults[index]!.meta.changes > 0);
  const alongsideIds = alongsideResults.flatMap((result) => (result.meta.changes > 0 ? [result.meta.last_row_id] : []));

  // Trusted only with every revision recorded: without one, the JSON carries
  // a body nothing recorded.
  const upToDate = await bringUpToDate(
    env,
    target,
    now,
    { ...first, own: revisionId === null ? alongsideIds : [revisionId, ...alongsideIds] },
    revisionId !== null && loggedAlongside.length === alongside.length,
  );

  if (!upToDate.current) return { written: false, recorded: true, revisionId, error: upToDate.error };

  return {
    written: true,
    revisionId,
    loggedAlongside,
    publicationId: await settle(env, target, upToDate),
    byteLength: upToDate.written.byteLength,
  };
}

/** What follows a JSON found up to date: this request's writes cleared, and its `publication` row. Answers the row's id. */
async function settle(env: Env, target: PublishTarget, upToDate: UpToDate): Promise<number | null> {
  await clearWrites(env, target, [...upToDate.written.writeIds, ...upToDate.finishedBefore]);

  return await recordPublication(env, target, upToDate);
}

/**
 * Records the `publication` row for a JSON found up to date, naming the
 * newest revision it was checked against, and answers its id.
 *
 * Null, and nothing recorded, when there is no revision of `entity` at all,
 * or when a `publication` row of `target` already names a newer revision:
 * another request checked its own JSON after this one and recorded it
 * first, and the newest row - which is what says what is still waiting -
 * must not go back to an older revision. One statement, so no other insert
 * can come between the look and the insert.
 */
async function recordPublication(env: Env, target: PublishTarget, upToDate: UpToDate): Promise<number | null> {
  const newest = newestRevisionId(upToDate.latest);

  if (newest === 0) return null;

  const inserted = await env.DB.prepare(
    `INSERT INTO publication (target, last_revision_id, object_key, byte_length)
     SELECT ?1, ?2, ?3, ?4
     WHERE NOT EXISTS (SELECT 1 FROM publication WHERE target = ?1 AND last_revision_id > ?2)`,
  )
    .bind(target.target, newest, target.objectKey, upToDate.written.byteLength)
    .run();

  return inserted.meta.changes > 0 ? inserted.meta.last_row_id : null;
}

/**
 * Builds `target`'s JSON from `revision` alone and writes it, with no change
 * of its own - あしあと's 「いま公開する」 until #285 - then brings it up to
 * date and records the `publication` row as `publishChange` does, so that a
 * `publishChange` running alongside is not written over.
 *
 * A failure to write the JSON the first time is thrown, as nothing was
 * recorded. One to bring it up to date is answered: the JSON may be behind,
 * and no `publication` row says otherwise. `latest` is what the JSON was
 * last built from and checked against.
 */
export async function republish(
  env: Env,
  target: PublishTarget,
  now: Date,
): Promise<
  | { current: true; latest: readonly LatestRevisionRow[]; publicationId: number | null; byteLength: number }
  | { current: false; error: string }
> {
  const before = await builtFrom(env, target);
  const cutoff = await readCutoff(env, target);
  const json = await target.buildJson(env, now, before, null);
  const put = await putJson(env, target, json);

  const upToDate = await bringUpToDate(
    env,
    target,
    now,
    {
      builtFrom: newestRevisionId(before),
      cutoff,
      own: [],
      version: put.version,
      writeIds: [put.writeId],
      byteLength: byteLength(json),
    },
    true,
  );

  if (!upToDate.current) return upToDate;

  return {
    current: true,
    latest: upToDate.latest,
    publicationId: await settle(env, target, upToDate),
    byteLength: upToDate.written.byteLength,
  };
}
