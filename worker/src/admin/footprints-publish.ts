import { byteLength } from '../lib/backup';
import type { Env } from '../lib/env';
import { errorResponse, jsonResponse } from '../lib/json';
import { revisionStatement } from '../lib/revision';
import { hasTwoHosts, isWhitelistedSource, readSourceWhitelist } from '../lib/source-whitelist';
import { formatTimestamp } from '../lib/time';
import { present, publicShapeOf, readEvent, readEvents, type FootprintsEvent } from './footprints';

/**
 * Publishing `footprints_event` (#141): the validation that lets a row
 * become part of the public JSON, withdrawing it back to a draft, and
 * building `footprints/events.json` itself from `revision` rather than from
 * the working rows. footprints.ts is everything up to this point - reading,
 * saving and deleting an event without ever touching a `revision` row.
 */

const VIDEO_ID_LENGTH = 11;

/**
 * Every way `saved` falls short of what `publish` requires, collected
 * rather than stopped at the first one - #141's design asks for every
 * failing condition back in one answer, not a round trip per fix.
 *
 * `date_precision`, `start_date`, `starts_at`, `end_date`, `kind` and every
 * `channelIds` entry are not checked again here: D1's own CHECKs and
 * foreign keys already refuse a row or a member that breaks any of them,
 * for a draft exactly as much as for a published event, so nothing that
 * exists in the table can fail those. What is left is what only publishing
 * asks for.
 *
 * A source is enough when it is on `whitelist`, or when the sources together
 * come from two different hosts (#175): the whitelist lists what one source
 * can vouch for alone, and a source it does not list can still be backed by
 * another on a different host. `whitelist` is read by the caller, so this
 * stays a function of what it is given.
 */
function publishProblems(saved: FootprintsEvent, whitelist: readonly string[]): string[] {
  const { event, sources } = saved;
  const problems: string[] = [];

  if (event.title === '') problems.push('title must not be empty');

  if (event.source_pending === 0) {
    const urls = sources.map((source) => source.url);

    if (urls.length === 0) {
      problems.push('sourcePending is false but there are no sources');
    } else if (!urls.some((url) => isWhitelistedSource(url, whitelist)) && !hasTwoHosts(urls)) {
      problems.push('sourcePending is false but no source is in the whitelist and the sources are not on two hosts');
    }
  }

  if (event.video_id !== null && event.video_id.length !== VIDEO_ID_LENGTH) {
    problems.push(`videoId must be ${VIDEO_ID_LENGTH} characters`);
  }

  return problems;
}

/**
 * POST /admin/api/footprints/events/:eventId/publish.
 *
 * 400 with every failing condition when `saved` is not ready; otherwise
 * `status` becomes `published` and a `publish` revision is logged, in one
 * `db.batch` so the row and its history cannot come apart if one half
 * fails. Publishing an already-published event is allowed - it is how a
 * "changed since it was published" event gets a fresh revision that matches
 * its current row, without going through withdraw first.
 */
export async function publishEvent(env: Env, eventId: number): Promise<Response> {
  const saved = await readEvent(env, eventId);

  if (saved === null) return errorResponse(404, `no footprints event ${eventId}`);

  const problems = publishProblems(saved, await readSourceWhitelist(env));

  if (problems.length > 0) return jsonResponse({ errors: problems }, { status: 400 });

  // The existence check above answers 404 for an event already gone when the
  // request arrived, but a concurrent updateEvent or deleteEvent can still
  // touch the row between that check and this batch running - the admin site
  // is used by one person at a time, behind Cloudflare Access, so this does
  // not add a `version` column to close that window; if that stops being
  // true, this is where one belongs. Gating the revision INSERT on EXISTS,
  // the same way video-overrides.ts's deleteVideoOverride does for the same
  // kind of race, ties "did we log a revision" to the row as this batch
  // actually found it: a concurrent delete still lets the UPDATE run (SET on
  // a row that no longer exists changes nothing), but no revision is logged
  // for an event that is no longer there to publish. `status` is not part of
  // the UPDATE's own WHERE: publishing an already-published event is meant
  // to succeed (see this function's own doc comment above), not be treated
  // as the same "nothing to do" case as a deleted row.
  //
  // This closes the delete race, not an update race: a concurrent updateEvent
  // that finishes after `readEvent` above but before this batch runs still
  // logs a `publish` revision built from the now-stale `saved` - EXISTS only
  // asks whether a row is there, not whether it is the one this function
  // read. Accepted for the same reason as the missing `version` column above,
  // and closed the same way once there is one: a conditional UPDATE and a
  // revision INSERT gated on it actually having changed the row, rather than
  // on the row merely existing.
  const results = await env.DB.batch([
    env.DB.prepare(`UPDATE footprints_event SET status = 'published' WHERE event_id = ?1`).bind(eventId),
    env.DB.prepare(
      `INSERT INTO revision (entity, entity_key, action, body, created_via)
       SELECT 'footprints_event', ?1, 'publish', ?2, 'admin'
       WHERE EXISTS (SELECT 1 FROM footprints_event WHERE event_id = ?1)`,
    ).bind(String(eventId), JSON.stringify(publicShapeOf(saved))),
  ]);

  // `saved` with status overridden, rather than a second readEvent: nothing
  // but status changed, and readEvent is a query plus two more in parallel.
  return jsonResponse({
    event: present(withStatus(saved, 'published')),
    revisionId: results[1].meta.last_row_id,
  });
}

/**
 * POST /admin/api/footprints/events/:eventId/withdraw. `status` becomes
 * `draft` and a `withdraw` revision (a `null` body - the schema requires it,
 * and there is nothing left to publish) is logged, in one `db.batch`.
 */
export async function withdrawEvent(env: Env, eventId: number): Promise<Response> {
  const saved = await readEvent(env, eventId);

  if (saved === null) return errorResponse(404, `no footprints event ${eventId}`);

  const results = await env.DB.batch([
    env.DB.prepare(`UPDATE footprints_event SET status = 'draft' WHERE event_id = ?1`).bind(eventId),
    revisionStatement(env.DB, 'footprints_event', String(eventId), 'withdraw', null),
  ]);

  return jsonResponse({
    event: present(withStatus(saved, 'draft')),
    revisionId: results[1].meta.last_row_id,
  });
}

/** `saved` with its event row's status overridden - what a batch that changed only `status` leaves the caller to report back. */
function withStatus(saved: FootprintsEvent, status: string): FootprintsEvent {
  return { ...saved, event: { ...saved.event, status } };
}

interface LatestRevisionRow {
  entity_key: string;
  revision_id: number;
  action: string;
  body: string | null;
}

/** The latest `revision` row for every `footprints_event` entity_key that has one, oldest concerns first. */
async function latestRevisions(env: Env): Promise<LatestRevisionRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT r.entity_key, r.revision_id, r.action, r.body
       FROM revision r
       JOIN (SELECT entity_key, MAX(revision_id) AS revision_id
               FROM revision
              WHERE entity = 'footprints_event'
              GROUP BY entity_key) latest
         ON latest.entity_key = r.entity_key AND latest.revision_id = r.revision_id
      WHERE r.entity = 'footprints_event'`,
  ).all<LatestRevisionRow>();

  return results;
}

/** The `last_revision_id` of the newest `publication` row for `target`, or 0 when there has never been one. */
async function lastPublishedRevisionId(env: Env, target: string): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT last_revision_id FROM publication WHERE target = ?1 ORDER BY publication_id DESC LIMIT 1`,
  )
    .bind(target)
    .first<{ last_revision_id: number }>();

  return row?.last_revision_id ?? 0;
}

/**
 * GET /admin/api/footprints/pending.
 *
 * "公開を待っているもの": an entity whose latest revision is newer than the
 * last "いま公開する" run. "公開後に変更あり": a `published` event whose
 * working row no longer matches the `publish` revision that made it live -
 * comparing the parsed shapes rather than the raw JSON text, so a
 * difference in key order alone (there should not be one, but this does not
 * lean on that) is not reported as a change.
 */
export async function pendingFootprints(env: Env): Promise<Response> {
  const [lastRevisionId, latest] = await Promise.all([
    lastPublishedRevisionId(env, 'footprints'),
    latestRevisions(env),
  ]);

  const pending = latest
    .filter((row) => row.revision_id > lastRevisionId)
    .map((row) => ({ eventId: Number(row.entity_key), latestAction: row.action }));

  const { results: publishedEvents } = await env.DB.prepare(
    `SELECT event_id FROM footprints_event WHERE status = 'published' ORDER BY event_id`,
  ).all<{ event_id: number }>();

  // Three queries for every published event's row, members and sources
  // together, rather than three per event: readEvents batches what a loop
  // calling readEvent once per id would otherwise ask for one at a time.
  const byId = await readEvents(
    env,
    publishedEvents.map((row) => row.event_id),
  );

  const latestByKey = new Map(latest.map((row) => [row.entity_key, row]));
  const changed: { eventId: number; title: string }[] = [];

  for (const { event_id: eventId } of publishedEvents) {
    const revision = latestByKey.get(String(eventId));

    if (revision === undefined || revision.body === null) continue;

    const saved = byId.get(eventId);

    if (saved === undefined) continue;

    const current = JSON.stringify(publicShapeOf(saved));
    const publishedBody = JSON.stringify(JSON.parse(revision.body));

    if (current !== publishedBody) changed.push({ eventId, title: saved.event.title });
  }

  return jsonResponse({ pending, changed });
}

/**
 * POST /admin/api/footprints/publish - "いま公開する". Builds
 * `footprints/events.json` from the latest `revision` of every
 * `footprints_event` entity whose latest action is not `withdraw`, writes it
 * to `PUBLIC_DATA`, and appends one `publication` row. Nothing is written,
 * and 200 answers `{ published: false }`, when there is nothing newer than
 * the last run.
 *
 * The write to R2 happens before `publication` gains its row, not the other
 * way around: a failure between the two must leave "what was last
 * successfully published" unclaimed rather than pointing at a JSON file
 * that was never actually written.
 */
export async function publishFootprintsNow(env: Env, now: Date): Promise<Response> {
  const [lastRevisionId, latest] = await Promise.all([
    lastPublishedRevisionId(env, 'footprints'),
    latestRevisions(env),
  ]);

  const newestRevisionId = latest.reduce((max, row) => Math.max(max, row.revision_id), 0);

  if (newestRevisionId <= lastRevisionId) {
    return jsonResponse({ published: false });
  }

  const events = latest
    .filter((row) => row.action !== 'withdraw' && row.body !== null)
    .map((row) => JSON.parse(row.body!) as { event_id: number; start_date: string });

  events.sort((a, b) =>
    a.start_date === b.start_date ? a.event_id - b.event_id : a.start_date < b.start_date ? -1 : 1,
  );

  const objectKey = 'footprints/events.json';
  const json = JSON.stringify({ published_at: formatTimestamp(now), events });
  const jsonByteLength = byteLength(json);

  await env.PUBLIC_DATA.put(objectKey, json, {
    httpMetadata: { contentType: 'application/json; charset=UTF-8' },
  });

  const inserted = await env.DB.prepare(
    `INSERT INTO publication (target, last_revision_id, object_key, byte_length) VALUES ('footprints', ?1, ?2, ?3)`,
  )
    .bind(newestRevisionId, objectKey, jsonByteLength)
    .run();

  return jsonResponse({
    published: true,
    publicationId: inserted.meta.last_row_id,
    eventCount: events.length,
    byteLength: jsonByteLength,
  });
}
