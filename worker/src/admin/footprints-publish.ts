import type { Env } from '../lib/env';
import { errorResponse, jsonResponse } from '../lib/json';
import { readSourceWhitelist, sourcesEnough } from '../lib/source-whitelist';
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
  isBehind,
  publishChange,
  republish,
  type LatestRevisionRow,
  type PublishOutcome,
  type PublishTarget,
  type RevisionChange,
} from './publishing';
import { republishMilestonesForEvents } from './subscriber-milestones-publish';

/**
 * Publishing `footprints_event` (#141, #281): the validation that lets a row
 * become part of the public JSON, and the three requests that change what the
 * public timeline shows - 「公開」 on a draft, 「保存」 on a published row and
 * 「非公開に戻す」. Each of them writes `footprints/events.json` itself,
 * through publishing.ts's `publishChange`, and then
 * `subscribers/milestones.json` when it names the event (#283's 6-6).
 * footprints.ts is everything else: reading, saving a draft and deleting an
 * event, without ever touching a `revision` row.
 */

const VIDEO_ID_LENGTH = 11;

const OBJECT_KEY = 'footprints/events.json';

/**
 * One way an event falls short of publishing: the field of the form it is
 * about, and the sentence the edit panel lists under 「公開できません」 as it
 * stands (#277's decision 1d) - the screen does not check these again.
 */
export interface PublishProblem {
  field: 'title' | 'leadChannelIds' | 'videoId';
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
 * Sources are not among them (#277's decision 2): an event short of them is
 * published all the same, and the timeline says 「出典の確認待ち」 on it.
 */
function publishProblems(saved: FootprintsEvent): PublishProblem[] {
  const { event } = saved;
  const problems: PublishProblem[] = [];

  if (event.title === '') problems.push({ field: 'title', message: '題を書いてください。' });

  // The upcoming list counts days and years from a debut for its leads
  // alone. A debut with none would count for nobody, and saying so here is
  // what keeps that from passing unnoticed.
  if (event.kind === 'debut' && saved.leadChannelIds.length === 0) {
    problems.push({ field: 'leadChannelIds', message: 'デビューの出来事は、主役を 1 人以上選んでください。' });
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

/**
 * `body` with `source_pending` judged again by `whitelist` (#282). A body
 * says how its sources were judged when it was published, and the public
 * JSON says how they are judged now: a whitelist changed since, or a mark
 * set by hand before the judgement replaced it, is not carried over.
 */
function judgedAgain(body: Record<string, unknown>, whitelist: readonly string[]): Record<string, unknown> {
  const sources = (body.sources ?? []) as { url: string }[];

  return {
    ...body,
    source_pending: !sourcesEnough(
      sources.map((source) => source.url),
      whitelist,
    ),
  };
}

/** `footprints/events.json`'s events for `bodies`: every event on the timeline, by date and then by id. */
function footprintsEvents(bodies: readonly Record<string, unknown>[], whitelist: readonly string[]) {
  const events = bodies.map(
    (body) => judgedAgain(currentShape(body), whitelist) as { event_id: number; start_date: string },
  );

  events.sort((a, b) =>
    a.start_date === b.start_date ? a.event_id - b.event_id : a.start_date < b.start_date ? -1 : 1,
  );

  return events;
}

/** `footprints/events.json`'s text for `bodies`. */
function footprintsJson(now: Date, bodies: readonly Record<string, unknown>[], whitelist: readonly string[]): string {
  return JSON.stringify({ published_at: formatTimestamp(now), events: footprintsEvents(bodies, whitelist) });
}

/**
 * Whether `footprints/events.json` holds other events than `latest` and
 * `whitelist` build now (#282). Nothing else writes the JSON again when the
 * whitelist changes, or when a JSON from before the judgement still carries
 * the marks set by hand; this is what lets 「いま公開する」 and a whitelist
 * change bring it back. A JSON not written yet is outdated once there is an
 * event to put in it. Throws when R2 cannot be read; each caller decides what
 * that means for it.
 */
async function isOutdated(
  env: Env,
  latest: readonly LatestRevisionRow[],
  whitelist: readonly string[],
): Promise<boolean> {
  const built = JSON.stringify(footprintsEvents(liveBodies(latest, null), whitelist));
  const object = await env.PUBLIC_DATA.get(OBJECT_KEY);

  if (object === null) return built !== '[]';

  const stored = (await object.json()) as { events?: unknown };

  return JSON.stringify(stored.events ?? null) !== built;
}

/**
 * Writes `footprints/events.json` again when it is outdated (`isOutdated`):
 * what a change to the whitelist calls, so the timeline's 「出典の確認待ち」
 * follows it (#282). Built from every latest revision as any write is, so a
 * revision still waiting goes in too. True when the JSON is up to date
 * afterwards, false when it could not be read, built or written.
 */
export async function rejudgeFootprints(env: Env, now: Date): Promise<boolean> {
  try {
    const [latest, whitelist] = await Promise.all([latestRevisions(env, 'footprints_event'), readSourceWhitelist(env)]);

    if (!(await isOutdated(env, latest, whitelist))) return true;

    return (await republish(env, footprintsTarget(whitelist), now)).current;
  } catch {
    return false;
  }
}

const TARGET = 'footprints';

/**
 * What publishing.ts needs to know about あしあと, with the whitelist every
 * event's sources are judged by in the JSON it builds. The caller reads it
 * once a request, so the JSON written and the JSON built again to check the
 * write judge by the same list.
 */
function footprintsTarget(whitelist: readonly string[]): PublishTarget {
  return {
    entity: 'footprints_event',
    target: TARGET,
    objectKey: OBJECT_KEY,
    table: 'footprints_event',
    keyColumn: 'event_id',
    buildJson(_env: Env, now: Date, latest: readonly LatestRevisionRow[], change: RevisionChange | null): string {
      return footprintsJson(now, liveBodies(latest, change), whitelist);
    },
  };
}

/**
 * The 400 a refused publish answers: every problem, and whether the fields
 * sent were saved anyway. `errors` carries the messages alone, the shape
 * every other refusal under /admin/api has.
 */
function refusalResponse(problems: readonly PublishProblem[], saved: boolean): Response {
  return jsonResponse({ errors: problems.map((p) => p.message), problems, saved }, { status: 400 });
}

/**
 * The answer when the fields were saved but the public JSON could not be
 * written, or could not be brought up to date after the change was recorded
 * (publishing.ts): 502, since what failed is R2 behind this worker, with
 * `saved: true` and the row as it now stands, so the screen can tell it
 * apart from a request that changed nothing, and say what to press next by
 * the status the row has now.
 */
async function notWrittenResponse(env: Env, eventId: number, outcome: Extract<PublishOutcome, { written: false }>) {
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

/**
 * The 200 once a change reached the public JSON: the row as it now stands,
 * and what was recorded for it. 404 when the row was deleted before the
 * change could be recorded, as when it was gone before the request came.
 */
async function writtenResponse(env: Env, eventId: number, outcome: Extract<PublishOutcome, { written: true }>) {
  if (outcome.revisionId === null) return errorResponse(404, `no footprints event ${eventId}`);

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
 * and 502 says so. When it was written but could not be brought up to date
 * after the revision was recorded, the row is published all the same, and
 * 502 says that too.
 */
async function saveAndPublish(env: Env, existing: FootprintsEvent, fields: EventFields, now: Date): Promise<Response> {
  const eventId = existing.event.event_id;
  const wasPublished = existing.event.status === 'published';
  const next = withFields(existing, fields, 'published');
  const problems = publishProblems(next);

  if (problems.length > 0) {
    if (!wasPublished) await env.DB.batch(saveStatements(env, eventId, fields));

    return refusalResponse(problems, !wasPublished);
  }

  const whitelist = await readSourceWhitelist(env);
  const outcome = await publishChange(
    env,
    footprintsTarget(whitelist),
    { key: String(eventId), action: 'publish', body: publicShapeOf(next, whitelist) },
    saveStatements(env, eventId, fields, 'published'),
    now,
  );

  if (!outcome.written) {
    if (!outcome.recorded) await env.DB.batch(saveStatements(env, eventId, fields));
    else await republishMilestonesForEvents(env, now);

    return await notWrittenResponse(env, eventId, outcome);
  }

  await republishMilestonesForEvents(env, now);

  return await writtenResponse(env, eventId, outcome);
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
 * written, and 502 says so. When it was written but could not be brought up
 * to date after the revision was recorded, the event is a draft all the
 * same, and 502 says so with `saved: true`, as a publish's does. 409 for an
 * event that is not published: there is nothing on the timeline to take off.
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
    footprintsTarget(await readSourceWhitelist(env)),
    { key: String(eventId), action: 'withdraw', body: null },
    saveStatements(env, eventId, fields, 'draft'),
    now,
  );

  if (!outcome.written) {
    if (!outcome.recorded) return errorResponse(502, `${OBJECT_KEY} could not be written: ${outcome.error}`);

    await republishMilestonesForEvents(env, now);

    return await notWrittenResponse(env, eventId, outcome);
  }

  await republishMilestonesForEvents(env, now);

  return await writtenResponse(env, eventId, outcome);
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
 *
 * `behind`: a write of the JSON was sent that no check found up to date
 * since (publishing.ts's `isBehind`), so the JSON may say something
 * `revision` does not, with nothing waiting to show it.
 *
 * `outdated`: the JSON holds other events than the revisions and today's
 * whitelist build (`isOutdated`), so 「いま公開する」 has something to write.
 */
export async function pendingFootprints(env: Env): Promise<Response> {
  const [{ pending, latest }, whitelist] = await Promise.all([readWaiting(env), readSourceWhitelist(env)]);

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

    // Both judged by today's whitelist, as the JSON is: a change to the
    // whitelist alone is not a change to the row.
    const current = JSON.stringify(publicShapeOf(saved, whitelist));
    const publishedBody = JSON.stringify(
      judgedAgain(currentShape(JSON.parse(revision.body) as Record<string, unknown>), whitelist),
    );

    if (current !== publishedBody) changed.push({ eventId, title: saved.event.title });
  }

  // An R2 that cannot be read says nothing about the rest of the answer.
  const [behind, outdated] = await Promise.all([
    isBehind(env, TARGET),
    isOutdated(env, latest, whitelist).catch(() => false),
  ]);

  return jsonResponse({ pending, changed, behind, outdated });
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

/**
 * Whether 「いま公開する」 writes the JSON with nothing waiting: it may be
 * behind (`isBehind`), or it is outdated (`isOutdated`). False when R2 cannot
 * be read. The やること screens' 公開待ち (inbox.ts) reads it here, so its
 * button follows the 公開 screen's.
 */
export async function footprintsNeedsWrite(env: Env): Promise<boolean> {
  if (await isBehind(env, TARGET)) return true;

  const [latest, whitelist] = await Promise.all([latestRevisions(env, 'footprints_event'), readSourceWhitelist(env)]);

  return isOutdated(env, latest, whitelist).catch(() => false);
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
 * the last time the JSON was written, the JSON is not counted as behind
 * (`isBehind`) and it is not outdated (`isOutdated`): one that is behind may
 * say what no revision says, which only a build from `revision` takes back
 * out, and one that is outdated was judged by another whitelist.
 *
 * Kept for the 公開 screen until it goes (#285): a row left waiting from
 * before #281 is published by it, or by the next publish of any event, which
 * builds from the same revisions.
 *
 * Written through publishing.ts's `republish`, which checks the JSON again
 * after writing it as a publish does: a 「公開」 recorded while this was
 * building would otherwise be written over. 502 when the JSON could not be
 * brought up to date, with no `publication` row recorded for it.
 */
export async function publishFootprintsNow(env: Env, now: Date): Promise<Response> {
  const [lastRevisionId, latest, whitelist] = await Promise.all([
    lastPublishedRevisionId(env, 'footprints'),
    latestRevisions(env, 'footprints_event'),
    readSourceWhitelist(env),
  ]);

  const newestRevisionId = latest.reduce((max, row) => Math.max(max, row.revision_id), 0);

  if (
    newestRevisionId <= lastRevisionId &&
    !(await isBehind(env, TARGET)) &&
    // An R2 that cannot be read is written to, and the write says why it failed.
    !(await isOutdated(env, latest, whitelist).catch(() => true))
  ) {
    return jsonResponse({ published: false });
  }

  const outcome = await republish(env, footprintsTarget(whitelist), now);

  await republishMilestonesForEvents(env, now);

  if (!outcome.current) return errorResponse(502, `${OBJECT_KEY} could not be brought up to date: ${outcome.error}`);

  return jsonResponse({
    published: true,
    publicationId: outcome.publicationId,
    eventCount: liveBodies(outcome.latest, null).length,
    byteLength: outcome.byteLength,
  });
}
