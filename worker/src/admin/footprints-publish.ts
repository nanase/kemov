import { byteLength } from '../lib/backup';
import type { Env } from '../lib/env';
import { errorResponse, jsonResponse } from '../lib/json';
import { hasTwoHosts, isWhitelistedSource, readSourceWhitelist } from '../lib/source-whitelist';
import { formatTimestamp } from '../lib/time';
import {
  present,
  publicShapeOf,
  readEvent,
  readEvents,
  saveStatements,
  updateEvent,
  validatedFields,
  withFields,
  type EventFields,
  type FootprintsEvent,
} from './footprints';
import {
  latestRevisions,
  liveBodies,
  publishChange,
  type LatestRevisionRow,
  type PublishOutcome,
  type PublishTarget,
  type RevisionChange,
} from './publishing';

/**
 * Publishing `footprints_event` (#141, #281): the validation that lets a row
 * become part of the public JSON, and the three requests that change what the
 * public timeline shows - 「公開」 on a draft, 「保存」 on a published row and
 * 「非公開に戻す」. Each of them writes `footprints/events.json` itself,
 * through publishing.ts's `publishChange`. footprints.ts is everything else:
 * reading, saving a draft and deleting an event, without ever touching a
 * `revision` row.
 */

const VIDEO_ID_LENGTH = 11;

const OBJECT_KEY = 'footprints/events.json';

/**
 * One way an event falls short of publishing: the field of the form it is
 * about, and the sentence the edit panel lists under 「公開できません」 as it
 * stands (#277's decision 1d) - the screen does not check these again.
 */
export interface PublishProblem {
  field: 'title' | 'leadChannelIds' | 'sources' | 'videoId';
  message: string;
}

/**
 * Every way `saved` falls short of what `publish` requires, collected
 * rather than stopped at the first one - #141's design asks for every
 * failing condition back in one answer, not a round trip per fix.
 *
 * `date_precision`, `start_date`, `starts_at`, `end_date`, `kind` and every
 * `channelIds` entry are not checked here: saving a draft already refuses
 * any of them that is wrong, so nothing that can be saved fails them. What
 * is left is what only publishing asks for.
 *
 * A source is enough when it is on `whitelist`, or when the sources together
 * come from two different hosts (#175): the whitelist lists what one source
 * can vouch for alone, and a source it does not list can still be backed by
 * another on a different host. `whitelist` is read by the caller, so this
 * stays a function of what it is given.
 */
function publishProblems(saved: FootprintsEvent, whitelist: readonly string[]): PublishProblem[] {
  const { event, sources } = saved;
  const problems: PublishProblem[] = [];

  if (event.title === '') problems.push({ field: 'title', message: '題を入れてください。' });

  // The upcoming list counts days and years from a debut for its leads
  // alone. A debut with none would count for nobody, and saying so here is
  // what keeps that from passing unnoticed.
  if (event.kind === 'debut' && saved.leadChannelIds.length === 0) {
    problems.push({ field: 'leadChannelIds', message: 'デビューの出来事は、主役を 1 人以上選んでください。' });
  }

  if (event.source_pending === 0 && sourcesProblem(sources, whitelist) !== null) {
    problems.push({
      field: 'sources',
      message:
        '出典が足りません。「出典の確認待ち」を外すには、ホワイトリストに載った出典を 1 つ足すか、別のサイトの出典を足してください。',
    });
  }

  if (event.video_id !== null && event.video_id.length !== VIDEO_ID_LENGTH) {
    problems.push({
      field: 'videoId',
      message: `動画 ID は ${VIDEO_ID_LENGTH} 文字です。いまは ${event.video_id.length} 文字です。`,
    });
  }

  return problems;
}

/**
 * Why `sources` do not back an event, or null when they do: at least one
 * source, and one of them on `whitelist` or two of them on different hosts.
 * Publishing checks it for a row that says its sources are confirmed, and
 * 「出典を確かめた」 (inbox.ts) checks it before letting a row say so.
 */
export function sourcesProblem(sources: readonly { url: string }[], whitelist: readonly string[]): string | null {
  const urls = sources.map((source) => source.url);

  if (urls.length === 0) return 'there are no sources';

  if (!urls.some((url) => isWhitelistedSource(url, whitelist)) && !hasTwoHosts(urls)) {
    return 'no source is in the whitelist and the sources are not on two hosts';
  }

  return null;
}

/**
 * A `publish` revision's body in the shape `publicShapeOf` gives one now.
 *
 * `lead_channel_ids` came after the first publishes (migration 0011), and a
 * revision is never rewritten, so a body from before it has no such key. It
 * read as no lead then and still does: an event published before that has
 * not been republished since.
 */
function currentShape(parsed: Record<string, unknown>): Record<string, unknown> {
  if ('lead_channel_ids' in parsed) return parsed;

  // Rebuilt rather than assigned, so the key lands where publicShapeOf puts
  // it: pendingFootprints compares the two as JSON text.
  return Object.fromEntries(
    Object.entries(parsed).flatMap(([key, value]) =>
      key === 'channel_ids'
        ? [
            [key, value],
            ['lead_channel_ids', []],
          ]
        : [[key, value]],
    ),
  );
}

/** `footprints/events.json`'s text for `bodies`: every event on the timeline, by date and then by id. */
function footprintsJson(now: Date, bodies: readonly Record<string, unknown>[]): { json: string; eventCount: number } {
  const events = bodies.map((body) => currentShape(body) as { event_id: number; start_date: string });

  events.sort((a, b) =>
    a.start_date === b.start_date ? a.event_id - b.event_id : a.start_date < b.start_date ? -1 : 1,
  );

  return { json: JSON.stringify({ published_at: formatTimestamp(now), events }), eventCount: events.length };
}

/** What publishing.ts needs to know about あしあと. */
export const FOOTPRINTS_TARGET: PublishTarget = {
  entity: 'footprints_event',
  target: 'footprints',
  objectKey: OBJECT_KEY,
  async buildJson(env: Env, now: Date, change: RevisionChange): Promise<string> {
    return footprintsJson(now, liveBodies(await latestRevisions(env, 'footprints_event'), change)).json;
  },
};

/**
 * The 400 a refused publish answers: every problem, and whether the fields
 * sent were saved anyway. `errors` carries the messages alone, the shape
 * every other refusal under /admin/api has.
 */
function refusal(problems: readonly PublishProblem[], saved: boolean): Response {
  return jsonResponse({ errors: problems.map((p) => p.message), problems, saved }, { status: 400 });
}

/**
 * The answer when the fields were saved but the public JSON could not be
 * written: 502, since what failed is R2 behind this worker, with
 * `saved: true` and the row as it now stands, so the screen can tell it
 * apart from a request that changed nothing.
 */
async function notWritten(env: Env, eventId: number, outcome: Extract<PublishOutcome, { written: false }>) {
  const saved = await readEvent(env, eventId);

  return jsonResponse(
    {
      error: `saved, but ${OBJECT_KEY} could not be written: ${outcome.error}`,
      saved: true,
      event: saved === null ? null : present(saved),
    },
    { status: 502 },
  );
}

/** The 200 once a change reached the public JSON: the row as it now stands, and what was recorded for it. */
async function written(env: Env, eventId: number, outcome: Extract<PublishOutcome, { written: true }>) {
  const saved = await readEvent(env, eventId);

  return jsonResponse({
    event: saved === null ? null : present(saved),
    revisionId: outcome.revisionId,
    publicationId: outcome.publicationId,
  });
}

/**
 * Saves `fields` over `existing` and puts the result on the public timeline,
 * or refuses. 「公開」 on a draft and 「保存」 on a published row both come
 * here, and differ only in what a refusal leaves behind:
 *
 * - A draft's fields are saved anyway, and it stays a draft: a draft is
 *   where an event not ready yet belongs, and what was typed is kept
 * - A published row is left exactly as it was: saving it would leave the row
 *   and the public timeline saying different things (#277's decision 1d)
 *
 * When the JSON cannot be written, the fields are saved and nothing else
 * changes - a draft stays a draft, a published row keeps its last revision -
 * and 502 says so.
 */
async function saveAndPublish(env: Env, existing: FootprintsEvent, fields: EventFields, now: Date): Promise<Response> {
  const eventId = existing.event.event_id;
  const wasPublished = existing.event.status === 'published';
  const next = withFields(existing, fields, 'published');
  const problems = publishProblems(next, await readSourceWhitelist(env));

  if (problems.length > 0) {
    if (!wasPublished) await env.DB.batch(saveStatements(env, eventId, fields));

    return refusal(problems, !wasPublished);
  }

  const outcome = await publishChange(
    env,
    FOOTPRINTS_TARGET,
    { key: String(eventId), action: 'publish', body: publicShapeOf(next) },
    saveStatements(env, eventId, fields, 'published'),
    now,
  );

  if (!outcome.written) {
    await env.DB.batch(saveStatements(env, eventId, fields));

    return await notWritten(env, eventId, outcome);
  }

  return await written(env, eventId, outcome);
}

/**
 * POST /admin/api/footprints/events/:eventId/publish - 「公開」. The body is
 * the event's fields, the same as a PUT's: what is typed is saved, checked
 * and published in this one request (#281). An event already published is
 * saved as `saveEvent` saves one.
 */
export async function publishEvent(
  env: Env,
  eventId: number,
  body: Record<string, unknown>,
  now: Date,
): Promise<Response> {
  const existing = await readEvent(env, eventId);

  if (existing === null) return errorResponse(404, `no footprints event ${eventId}`);

  const fields = await validatedFields(env, body);

  if ('error' in fields) return fields.error;

  return await saveAndPublish(env, existing, fields, now);
}

/**
 * PUT /admin/api/footprints/events/:eventId - 「保存」. A draft is saved as a
 * draft (footprints.ts's `updateEvent`). A published event's save reaches
 * the public timeline at once, and is refused, leaving the row and the
 * timeline as they were, when the fields would not pass publishing.
 */
export async function saveEvent(
  env: Env,
  eventId: number,
  body: Record<string, unknown>,
  now: Date,
): Promise<Response> {
  const existing = await readEvent(env, eventId);

  if (existing === null) return errorResponse(404, `no footprints event ${eventId}`);

  if (existing.event.status !== 'published') return await updateEvent(env, eventId, body);

  const fields = await validatedFields(env, body);

  if ('error' in fields) return fields.error;

  return await saveAndPublish(env, existing, fields, now);
}

/**
 * POST /admin/api/footprints/events/:eventId/withdraw - 「非公開に戻す」.
 * The body is the event's fields, the same as a PUT's: what is typed is kept,
 * as the draft the event becomes. Takes the event off
 * `footprints/events.json`, then saves the fields as a draft and logs a
 * `withdraw` revision (a `null` body - the schema requires it, and there is
 * nothing left to publish). Nothing at all changes when the JSON cannot be
 * written, and 502 says so. 409 for an event that is not published: there is
 * nothing on the timeline to take off.
 */
export async function withdrawEvent(
  env: Env,
  eventId: number,
  body: Record<string, unknown>,
  now: Date,
): Promise<Response> {
  const saved = await readEvent(env, eventId);

  if (saved === null) return errorResponse(404, `no footprints event ${eventId}`);

  if (saved.event.status !== 'published') return errorResponse(409, 'only a published event can be withdrawn');

  const fields = await validatedFields(env, body);

  if ('error' in fields) return fields.error;

  const outcome = await publishChange(
    env,
    FOOTPRINTS_TARGET,
    { key: String(eventId), action: 'withdraw', body: null },
    saveStatements(env, eventId, fields, 'draft'),
    now,
  );

  if (!outcome.written) return errorResponse(502, `${OBJECT_KEY} could not be written: ${outcome.error}`);

  return await written(env, eventId, outcome);
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
 * last time the JSON was written. "公開後に変更あり": a `published` event
 * whose working row no longer matches the `publish` revision that made it
 * live - comparing the parsed shapes rather than the raw JSON text, so a
 * difference in key order alone is not reported as a change.
 *
 * Since #281 every publish writes the JSON, so nothing waits once the rows
 * from before it have been published again; and a published row changes
 * only together with its revision, unless the JSON could not be written.
 */
export async function pendingFootprints(env: Env): Promise<Response> {
  const { pending, latest } = await readWaiting(env);

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
    const publishedBody = JSON.stringify(currentShape(JSON.parse(revision.body) as Record<string, unknown>));

    if (current !== publishedBody) changed.push({ eventId, title: saved.event.title });
  }

  return jsonResponse({ pending, changed });
}

export interface WaitingFootprintsEntry {
  eventId: number;
  latestAction: string;
}

/**
 * Every event whose latest revision is newer than the last time the JSON was
 * written - what "いま公開する" would act on. `pendingFootprints` and the
 * やること screens' 公開待ち (inbox.ts) both read it here, so the two cannot
 * count differently.
 */
export async function waitingFootprints(env: Env): Promise<WaitingFootprintsEntry[]> {
  return (await readWaiting(env)).pending;
}

/** `waitingFootprints`, with the latest revisions it was worked out from left in for `pendingFootprints` to compare against. */
async function readWaiting(env: Env): Promise<{ pending: WaitingFootprintsEntry[]; latest: LatestRevisionRow[] }> {
  const [lastRevisionId, latest] = await Promise.all([
    lastPublishedRevisionId(env, 'footprints'),
    latestRevisions(env, 'footprints_event'),
  ]);

  const pending = latest
    .filter((row) => row.revision_id > lastRevisionId)
    .map((row) => ({ eventId: Number(row.entity_key), latestAction: row.action }));

  return { pending, latest };
}

/**
 * POST /admin/api/footprints/publish - "いま公開する". Builds
 * `footprints/events.json` from the latest `revision` of every
 * `footprints_event` entity whose latest action is not `withdraw`, writes it
 * to `PUBLIC_DATA`, and appends one `publication` row. Nothing is written,
 * and 200 answers `{ published: false }`, when there is nothing newer than
 * the last time the JSON was written.
 *
 * Kept for the 公開 screen until it goes (#285): a row left waiting from
 * before #281 is published by it, or by the next publish of any event, which
 * builds from the same revisions.
 *
 * The write to R2 happens before `publication` gains its row, not the other
 * way around: a failure between the two must leave "what was last
 * successfully published" unclaimed rather than pointing at a JSON file
 * that was never actually written.
 */
export async function publishFootprintsNow(env: Env, now: Date): Promise<Response> {
  const [lastRevisionId, latest] = await Promise.all([
    lastPublishedRevisionId(env, 'footprints'),
    latestRevisions(env, 'footprints_event'),
  ]);

  const newestRevisionId = latest.reduce((max, row) => Math.max(max, row.revision_id), 0);

  if (newestRevisionId <= lastRevisionId) {
    return jsonResponse({ published: false });
  }

  const bodies = latest
    .filter((row) => row.action !== 'withdraw' && row.body !== null)
    .map((row) => JSON.parse(row.body!) as Record<string, unknown>);
  const { json, eventCount } = footprintsJson(now, bodies);
  const jsonByteLength = byteLength(json);

  await env.PUBLIC_DATA.put(OBJECT_KEY, json, {
    httpMetadata: { contentType: 'application/json; charset=UTF-8' },
  });

  const inserted = await env.DB.prepare(
    `INSERT INTO publication (target, last_revision_id, object_key, byte_length) VALUES ('footprints', ?1, ?2, ?3)`,
  )
    .bind(newestRevisionId, OBJECT_KEY, jsonByteLength)
    .run();

  return jsonResponse({
    published: true,
    publicationId: inserted.meta.last_row_id,
    eventCount,
    byteLength: jsonByteLength,
  });
}
