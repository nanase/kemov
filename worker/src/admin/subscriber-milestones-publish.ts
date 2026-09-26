import { byteLength } from '../lib/backup';
import { queryInChunks } from '../lib/d1';
import type { Env } from '../lib/env';
import { errorResponse, jsonResponse } from '../lib/json';
import { revisionStatement } from '../lib/revision';
import { hasOwnVideoSource, hasTwoHosts, isWhitelistedSource, readSourceWhitelist } from '../lib/source-whitelist';
import { formatTimestamp } from '../lib/time';
import {
  eventLinkProblem,
  present,
  publishedBodyOf,
  readMilestone,
  readMilestones,
  type SubscriberMilestone,
} from './subscriber-milestones';

/**
 * Publishing `subscriber_milestone` (#225): the check that lets a row into
 * the public JSON, withdrawing it back to a draft, and building
 * `subscribers/milestones.json` from `revision` rather than from the working
 * rows. The two steps are the same as footprints-publish.ts's: 「公開待ちにする」
 * logs a `publish` revision, and 「いま公開する」 writes the JSON.
 *
 * A JSON of its own rather than a part of `footprints/events.json` (HQ's call
 * on #225): the statistics and member pages that draw these would otherwise
 * read the whole timeline, and every fix to a number would publish the
 * timeline again.
 */

/**
 * Every way `saved` falls short of what `publish` requires, collected rather
 * than stopped at the first one.
 *
 * The sources are enough on the same terms as an event's (#175): one on the
 * whitelist, or sources on two different hosts. A video of the milestone's own
 * channel that `video` holds counts as one on the whitelist (#225). A number a listener
 * announced is the exception #225 decided: that listener's post is the
 * source, and one is enough, whatever its host. Its URL is kept for the
 * admin site and never published (see `publicEntryOf`).
 *
 * The link to an event is checked again here, not only on save: the event's
 * own kind can have changed since.
 */
async function publishProblems(env: Env, saved: SubscriberMilestone, whitelist: readonly string[]): Promise<string[]> {
  const { milestone, sources } = saved;
  const problems: string[] = [];
  const urls = sources.map((source) => source.url);

  if (urls.length === 0) {
    problems.push('there are no sources');
  } else if (
    milestone.announced_by !== 'listener' &&
    !urls.some((url) => isWhitelistedSource(url, whitelist)) &&
    !hasTwoHosts(urls) &&
    !(await hasOwnVideoSource(env, urls, milestone.channel_id))
  ) {
    problems.push('no source is in the whitelist and the sources are not on two hosts');
  }

  const linkProblem = await eventLinkProblem(env, milestone.event_id);

  if (linkProblem !== null) problems.push(linkProblem);

  return problems;
}

/**
 * POST /admin/api/subscribers/milestones/:milestoneId/publish -
 * 「公開待ちにする」. 400 with every failing condition; otherwise `status`
 * becomes `published` and a `publish` revision is logged in one `db.batch`,
 * gated on the row still being there, the same as footprints-publish.ts's
 * `publishEvent` (whose comment explains the races this does and does not
 * close). Publishing an already-published milestone is allowed: it is how a
 * row changed since its publish gets a revision that matches it again.
 */
export async function publishMilestone(env: Env, milestoneId: number): Promise<Response> {
  const saved = await readMilestone(env, milestoneId);

  if (saved === null) return errorResponse(404, `no subscriber milestone ${milestoneId}`);

  const problems = await publishProblems(env, saved, await readSourceWhitelist(env));

  if (problems.length > 0) return jsonResponse({ errors: problems }, { status: 400 });

  const results = await env.DB.batch([
    env.DB.prepare(`UPDATE subscriber_milestone SET status = 'published' WHERE milestone_id = ?1`).bind(milestoneId),
    env.DB.prepare(
      `INSERT INTO revision (entity, entity_key, action, body, created_via)
       SELECT 'subscriber_milestone', ?1, 'publish', ?2, 'admin'
       WHERE EXISTS (SELECT 1 FROM subscriber_milestone WHERE milestone_id = ?1)`,
    ).bind(String(milestoneId), JSON.stringify(publishedBodyOf(saved))),
  ]);

  return jsonResponse({
    milestone: present(withStatus(saved, 'published')),
    revisionId: results[1].meta.last_row_id,
  });
}

/** POST /admin/api/subscribers/milestones/:milestoneId/withdraw. `status` becomes `draft` and a `withdraw` revision is logged, in one `db.batch`. */
export async function withdrawMilestone(env: Env, milestoneId: number): Promise<Response> {
  const saved = await readMilestone(env, milestoneId);

  if (saved === null) return errorResponse(404, `no subscriber milestone ${milestoneId}`);

  const results = await env.DB.batch([
    env.DB.prepare(`UPDATE subscriber_milestone SET status = 'draft' WHERE milestone_id = ?1`).bind(milestoneId),
    revisionStatement(env.DB, 'subscriber_milestone', String(milestoneId), 'withdraw', null),
  ]);

  return jsonResponse({
    milestone: present(withStatus(saved, 'draft')),
    revisionId: results[1].meta.last_row_id,
  });
}

function withStatus(saved: SubscriberMilestone, status: string): SubscriberMilestone {
  return { ...saved, milestone: { ...saved.milestone, status } };
}

interface LatestRevisionRow {
  entity_key: string;
  revision_id: number;
  action: string;
  body: string | null;
}

/** The latest `revision` row for every `subscriber_milestone` that has one. */
async function latestRevisions(env: Env): Promise<LatestRevisionRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT r.entity_key, r.revision_id, r.action, r.body
       FROM revision r
       JOIN (SELECT entity_key, MAX(revision_id) AS revision_id
               FROM revision
              WHERE entity = 'subscriber_milestone'
              GROUP BY entity_key) latest
         ON latest.entity_key = r.entity_key AND latest.revision_id = r.revision_id
      WHERE r.entity = 'subscriber_milestone'`,
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

/** The body of a `publish` revision, as `publishedBodyOf` wrote it. */
interface PublishedBody {
  milestone_id: number;
  channel_id: string;
  date_precision: string;
  reached_date: string;
  subscriber_count: number;
  announced_by: string;
  event_id: number | null;
  sources: { url: string; title: string | null }[];
}

/** The linked event as the public timeline shows it. */
interface LiveEvent {
  event_id: number;
  title: string;
  start_date: string;
}

/** One element of `milestones` in the public JSON. */
interface PublicMilestone {
  milestone_id: number;
  channel_id: string;
  date_precision: string;
  reached_date: string;
  subscriber_count: number;
  announced_by: string;
  event: LiveEvent | null;
  sources: { url: string; title: string | null }[];
}

/**
 * The events among `eventIds` that are live on the public timeline right now,
 * as it shows them.
 *
 * "Live" is what `footprints/events.json` was built from, not the events'
 * working rows or their newest revision: the newest `footprints_event`
 * revision of each event no newer than the last footprints publish, when that
 * revision is a `publish`. A title fixed and sent to 公開待ち but not yet
 * published there is not yet the title here either, and an event not on the
 * public timeline at all is not named by this JSON.
 */
async function liveEvents(env: Env, eventIds: readonly number[]): Promise<Map<number, LiveEvent>> {
  const footprintsRevisionId = await lastPublishedRevisionId(env, 'footprints');
  const keys = [...new Set(eventIds)].map(String);

  const rows = await queryInChunks(keys, async (chunk) => {
    const placeholders = chunk.map((_, index) => `?${index + 2}`).join(', ');
    const { results } = await env.DB.prepare(
      `SELECT r.entity_key, r.action, r.body
         FROM revision r
         JOIN (SELECT entity_key, MAX(revision_id) AS revision_id
                 FROM revision
                WHERE entity = 'footprints_event' AND revision_id <= ?1 AND entity_key IN (${placeholders})
                GROUP BY entity_key) latest
           ON latest.entity_key = r.entity_key AND latest.revision_id = r.revision_id
        WHERE r.entity = 'footprints_event'`,
    )
      .bind(footprintsRevisionId, ...chunk)
      .all<{ entity_key: string; action: string; body: string | null }>();

    return results;
  });

  const live = new Map<number, LiveEvent>();

  for (const row of rows) {
    if (row.action === 'withdraw' || row.body === null) continue;

    const body = JSON.parse(row.body) as { event_id: number; title: string; start_date: string };

    live.set(body.event_id, { event_id: body.event_id, title: body.title, start_date: body.start_date });
  }

  return live;
}

/**
 * One element of the public JSON, from a `publish` revision's body. A
 * listener's source URLs are dropped (#225's decision 3): the page says the
 * number came from a listener's post, and does not point at their account.
 */
function publicEntryOf(body: PublishedBody, live: ReadonlyMap<number, LiveEvent>): PublicMilestone {
  return {
    milestone_id: body.milestone_id,
    channel_id: body.channel_id,
    date_precision: body.date_precision,
    reached_date: body.reached_date,
    subscriber_count: body.subscriber_count,
    announced_by: body.announced_by,
    event: body.event_id === null ? null : (live.get(body.event_id) ?? null),
    sources: body.announced_by === 'listener' ? [] : body.sources,
  };
}

/**
 * The shape of the JSON `publishSubscriberMilestonesNow` writes, as
 * genet-publish.ts's `GENET_MUSIC_SHAPE_VERSION` is for its own. Raise it
 * whenever the shape changes, and the next 「いま公開する」 builds again with
 * no newer revision.
 *
 * 1: `milestones`.
 */
export const SUBSCRIBER_MILESTONES_SHAPE_VERSION = 1;

const OBJECT_KEY = 'subscribers/milestones.json';

interface StoredJson {
  shapeVersion: number;
  milestones: readonly PublicMilestone[];
}

/**
 * The JSON stored in `PUBLIC_DATA`, read from the object itself for the
 * reason genet-publish.ts's `storedShapeVersion` gives. A JSON that is
 * missing, cannot be read or carries no `shape_version` is version 0, older
 * than any this code builds: building again gives the same result however
 * often it runs, so when in doubt the safe side is to build.
 */
async function storedJson(env: Env): Promise<StoredJson> {
  const object = await env.PUBLIC_DATA.get(OBJECT_KEY);

  if (object === null) return { shapeVersion: 0, milestones: [] };

  try {
    const stored = JSON.parse(await object.text()) as { shape_version?: unknown; milestones?: unknown } | null;

    return {
      shapeVersion: typeof stored?.shape_version === 'number' ? stored.shape_version : 0,
      milestones: Array.isArray(stored?.milestones) ? (stored.milestones as PublicMilestone[]) : [],
    };
  } catch {
    return { shapeVersion: 0, milestones: [] };
  }
}

/**
 * Where publishing stands, and what 「いま公開する」 would write.
 *
 * `pendingSubscriberMilestones` reports this and
 * `publishSubscriberMilestonesNow` acts on it, and the two must never
 * disagree - a screen that refuses what the run would do leaves an old JSON
 * with no way to replace it - so both read it from here.
 *
 * - `pending`: a milestone whose latest revision is newer than the last run
 * - `eventChanged`: a milestone not in `pending` whose linked event, as the
 *   public timeline shows it now, is not what the stored JSON says - the
 *   event was published again with another title or date, or taken off the
 *   timeline. The milestone's own revision has not changed, so nothing but
 *   this says the stored JSON is out of date (HQ's condition on #225)
 * - `shapeOutdated`: the stored JSON is in an older shape than this code
 *   builds. With no revision at all there is nothing to build from, so that
 *   is never outdated
 */
async function publishState(env: Env) {
  const [lastRevisionId, latest, stored] = await Promise.all([
    lastPublishedRevisionId(env, 'subscriber_milestones'),
    latestRevisions(env),
    storedJson(env),
  ]);

  const newestRevisionId = latest.reduce((max, row) => Math.max(max, row.revision_id), 0);

  const bodies = latest
    .filter((row) => row.action !== 'withdraw' && row.body !== null)
    .map((row) => ({ revisionId: row.revision_id, body: JSON.parse(row.body!) as PublishedBody }));

  const live = await liveEvents(
    env,
    bodies.flatMap(({ body }) => (body.event_id === null ? [] : [body.event_id])),
  );

  const milestones = bodies.map(({ body }) => publicEntryOf(body, live));

  milestones.sort((a, b) =>
    a.reached_date === b.reached_date ? a.milestone_id - b.milestone_id : a.reached_date < b.reached_date ? -1 : 1,
  );

  const pending = latest
    .filter((row) => row.revision_id > lastRevisionId)
    .map((row) => ({ milestoneId: Number(row.entity_key), latestAction: row.action }));

  const storedById = new Map(stored.milestones.map((entry) => [entry.milestone_id, entry]));
  const eventChanged: { milestoneId: number; eventId: number }[] = [];

  for (const { revisionId, body } of bodies) {
    if (revisionId > lastRevisionId || body.event_id === null) continue;

    const entry = storedById.get(body.milestone_id);

    if (entry === undefined) continue;

    const built = live.get(body.event_id) ?? null;

    if (JSON.stringify(entry.event ?? null) !== JSON.stringify(built)) {
      eventChanged.push({ milestoneId: body.milestone_id, eventId: body.event_id });
    }
  }

  const shapeOutdated = newestRevisionId > 0 && stored.shapeVersion < SUBSCRIBER_MILESTONES_SHAPE_VERSION;

  return {
    newestRevisionId,
    milestones,
    pending,
    eventChanged,
    shapeOutdated,
    needsBuild: newestRevisionId > lastRevisionId || eventChanged.length > 0 || shapeOutdated,
  };
}

/**
 * GET /admin/api/subscribers/pending.
 *
 * `pending`, `eventChanged` and `shapeOutdated` are `publishState`'s: any of
 * them is something 「いま公開する」 would write. `changed` is a `published`
 * milestone whose working row no longer matches the `publish` revision that
 * made it live, which needs 「公開待ちにする」 again first, the same as
 * footprints-publish.ts's own `changed`.
 */
export async function pendingSubscriberMilestones(env: Env): Promise<Response> {
  const [state, latest] = await Promise.all([publishState(env), latestRevisions(env)]);

  const { results: publishedRows } = await env.DB.prepare(
    `SELECT milestone_id FROM subscriber_milestone WHERE status = 'published' ORDER BY milestone_id`,
  ).all<{ milestone_id: number }>();

  const byId = await readMilestones(
    env,
    publishedRows.map((row) => row.milestone_id),
  );

  const latestByKey = new Map(latest.map((row) => [row.entity_key, row]));
  const changed: { milestoneId: number }[] = [];

  for (const { milestone_id: milestoneId } of publishedRows) {
    const revision = latestByKey.get(String(milestoneId));
    const saved = byId.get(milestoneId);

    if (revision === undefined || revision.body === null || saved === undefined) continue;

    const current = JSON.stringify(publishedBodyOf(saved));
    const publishedBody = JSON.stringify(JSON.parse(revision.body));

    if (current !== publishedBody) changed.push({ milestoneId });
  }

  return jsonResponse({
    pending: state.pending,
    changed,
    eventChanged: state.eventChanged,
    shapeOutdated: state.shapeOutdated,
  });
}

/**
 * POST /admin/api/subscribers/publish - 「いま公開する」. Writes
 * `subscribers/milestones.json` from the latest revision of every milestone
 * whose latest action is not `withdraw`, then appends one `publication` row.
 * 200 answers `{ published: false }`, and nothing is written, when
 * `publishState` finds nothing to build.
 *
 * R2 is written before `publication` gains its row, for the reason
 * footprints-publish.ts's `publishFootprintsNow` gives.
 */
export async function publishSubscriberMilestonesNow(env: Env, now: Date): Promise<Response> {
  const state = await publishState(env);

  if (!state.needsBuild) return jsonResponse({ published: false });

  const json = JSON.stringify({
    published_at: formatTimestamp(now),
    shape_version: SUBSCRIBER_MILESTONES_SHAPE_VERSION,
    milestones: state.milestones,
  });
  const jsonByteLength = byteLength(json);

  await env.PUBLIC_DATA.put(OBJECT_KEY, json, {
    httpMetadata: { contentType: 'application/json; charset=UTF-8' },
  });

  const inserted = await env.DB.prepare(
    `INSERT INTO publication (target, last_revision_id, object_key, byte_length)
     VALUES ('subscriber_milestones', ?1, ?2, ?3)`,
  )
    .bind(state.newestRevisionId, OBJECT_KEY, jsonByteLength)
    .run();

  return jsonResponse({
    published: true,
    publicationId: inserted.meta.last_row_id,
    milestoneCount: state.milestones.length,
    byteLength: jsonByteLength,
  });
}
