import type { Env } from '../lib/env';
import { queryInChunks } from '../lib/d1';
import { changedElsewhereResponse, jsonResponse } from '../lib/json';
import { refusal, refuse, REQUEST_FAILED } from '../lib/refusal';
import {
  countedHost,
  hasTwoHosts,
  isWhitelistedSource,
  ownVideoIdsOf,
  readSourceWhitelist,
  youtubeVideoIdOf,
} from '../lib/source-whitelist';
import { formatTimestamp } from '../lib/time';
import {
  heldToVersion,
  isBehind,
  latestRevisions,
  liveBodies,
  publishChange,
  republish,
  type HeldToVersion,
  type LatestRevisionRow,
  type PublishOutcome,
  type PublishTarget,
  type RevisionChange,
  writtenAt,
} from './publishing';
import {
  present,
  publishedBodyOf,
  readMilestone,
  readMilestones,
  newestRevisionOf,
  noMilestoneResponse,
  savedRow,
  saveStatements,
  sourceUrlProblem,
  updateMilestone,
  validatedFields,
  withFields,
  type MilestoneFields,
  type MilestoneStatus,
  type SubscriberMilestone,
} from './subscriber-milestones';

/**
 * Publishing `subscriber_milestone` (#225, #283): the check that lets a row
 * into the public JSON, and the three requests that change what the public
 * site shows - 「公開」 on a draft, 「保存」 on a published row and
 * 「非公開に戻す」. Each of them writes `subscribers/milestones.json` itself,
 * through publishing.ts's `publishChange`, as footprints-publish.ts does for
 * あしあと.
 *
 * A JSON of its own rather than a part of `footprints/events.json` (HQ's call
 * on #225): the statistics and member pages that draw these would otherwise
 * read the whole timeline, and every fix to a number would publish the
 * timeline again. It names each linked event as the timeline has it, so it is
 * built from `footprints_event`'s revisions too, and an event's publish
 * builds it again when that changes what it says (#277's 6-6,
 * `republishMilestonesForEvents`).
 */

const OBJECT_KEY = 'subscribers/milestones.json';

/** What the screen says when the public JSON could not be written; which step failed, and why, stays in `detail`. */
const NOT_WRITTEN_TEXT = '本番の登録者数の節目への反映に失敗しました';

/**
 * The sentence the edit panel lists under 「公開できません」 when the sources
 * are not enough, as #283 decided it. Unlike あしあと's, a milestone that
 * lacks them is not published (#277's 6-7).
 */
export const SOURCES_PROBLEM = '出典が足りません。ホワイトリストの出典か、別のサイトの出典を足してください。';

/** One way a milestone falls short of publishing: the field of the form it is about, and the sentence for it. */
export interface PublishProblem {
  field: 'sources';
  message: string;
}

/**
 * What one source counts as (#277's 2a), in the order the sources are:
 *
 * - `whitelist`: on the whitelist
 * - `own_video`: a video of the milestone's own channel that `video` holds,
 *   which counts as one on the whitelist (#225) - a stream the member showed
 *   the number in is the member's own statement
 * - `host`: neither, named by the host it is counted under (`countedHost`).
 *   `sameSite` when a source before it is on that host too, so it adds no
 *   host of its own. `host` is null for text no host can be read from
 */
export type SourceMark =
  { kind: 'whitelist' } | { kind: 'own_video' } | { kind: 'host'; host: string | null; sameSite: boolean };

export interface SourcesJudgement {
  marks: SourceMark[];
  enough: boolean;
}

/**
 * Whether `urls` back a milestone of `channelId` that `announcedBy`
 * announced, and what each of them counts as.
 *
 * Enough on the same terms as an event's (#175): one on the whitelist, or
 * sources on two different hosts - with a video of the milestone's own
 * channel counted as one on the whitelist (#225). A number a listener
 * announced is the exception #225 decided: that listener's post is the
 * source, and one is enough, whatever its host. Its URL is kept for the
 * admin site and never published (see `publicEntryOf`).
 *
 * The screen asks this through `POST /admin/api/subscribers/source-check` as
 * the sources are typed, and publishing asks it again rather than trusting
 * the screen: the whitelist and `video` may change between the two.
 */
export async function judgeSources(
  env: Env,
  input: { channelId: string; announcedBy: string; urls: readonly string[] },
  whitelist: readonly string[],
): Promise<SourcesJudgement> {
  const own = await ownVideoIdsOf(env, input.urls, input.channelId);
  const hostsSeen = new Set<string>();

  // Only a URL a save accepts counts: an empty row, plain http, or one
  // carrying a password would otherwise say "enough" for a publish the save
  // then refuses - or make the first source that counts on its host look
  // like a second one.
  const accepted = input.urls.map((url) => sourceUrlProblem(url) === null);

  const marks = input.urls.map((url, index): SourceMark => {
    const host = countedHost(url);
    const sameSite = host !== null && hostsSeen.has(host);

    if (host !== null && accepted[index]) hostsSeen.add(host);

    if (isWhitelistedSource(url, whitelist)) return { kind: 'whitelist' };

    const videoId = youtubeVideoIdOf(url);

    if (videoId !== null && own.has(videoId)) return { kind: 'own_video' };

    return { kind: 'host', host, sameSite };
  });

  const enough =
    input.announcedBy === 'listener'
      ? accepted.some(Boolean)
      : marks.some((mark, index) => accepted[index] && mark.kind !== 'host') ||
        hasTwoHosts(input.urls.filter((_, index) => accepted[index]));

  return { marks, enough };
}

/**
 * Every way `next` falls short of what publishing requires. Everything else
 * - the format of each field, and that a linked event exists and is a
 * milestone - is what saving checks, and `validatedFields` has refused it by
 * the time this runs.
 */
async function publishProblems(env: Env, next: SubscriberMilestone): Promise<PublishProblem[]> {
  const { milestone, sources } = next;
  const judgement = await judgeSources(
    env,
    { channelId: milestone.channel_id, announcedBy: milestone.announced_by, urls: sources.map((s) => s.url) },
    await readSourceWhitelist(env),
  );

  return judgement.enough ? [] : [{ field: 'sources', message: SOURCES_PROBLEM }];
}

/** The most URLs one source check reads - far more than any milestone has. */
const SOURCE_CHECK_LIMIT = 50;

/**
 * POST /admin/api/subscribers/source-check - `judgeSources` for the sources
 * as typed: `{ channelId, announcedBy, urls }`. 400 when the body is not
 * that shape. Nothing is saved.
 */
export async function checkSources(env: Env, body: Record<string, unknown>): Promise<Response> {
  const { channelId, announcedBy, urls } = body;

  if (typeof channelId !== 'string') return refuse(400, refusal(REQUEST_FAILED, 'channelId must be a string'));
  if (typeof announcedBy !== 'string') {
    return refuse(400, refusal(REQUEST_FAILED, 'announcedBy must be a string'));
  }

  if (!Array.isArray(urls) || urls.some((url) => typeof url !== 'string')) {
    return refuse(400, refusal(REQUEST_FAILED, 'urls must be an array of strings'));
  }

  if (urls.length > SOURCE_CHECK_LIMIT) {
    return refuse(400, refusal(REQUEST_FAILED, `urls must have at most ${SOURCE_CHECK_LIMIT} entries`));
  }

  return jsonResponse(
    await judgeSources(env, { channelId, announcedBy, urls: urls as string[] }, await readSourceWhitelist(env)),
  );
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
 * "Live" is what `footprints/events.json` was last found up to date with, not
 * the events' working rows or their newest revision: the newest
 * `footprints_event` revision of each event no newer than the last
 * `publication` of あしあと, when that revision is a `publish`. A revision
 * recorded while the timeline could not be brought up to date, or one sent to
 * 公開待ち before #281 and not written since, is not yet the event here
 * either, so this JSON never names an event the timeline does not have.
 */
async function liveEvents(env: Env, eventIds: readonly number[]): Promise<Map<number, LiveEvent>> {
  const keys = [...new Set(eventIds)].map(String);

  if (keys.length === 0) return new Map();

  const footprintsRevisionId = await lastPublishedRevisionId(env, 'footprints');
  const rows = await queryInChunks(keys, async (chunk) => {
    const placeholders = chunk.map((_, index) => `?${index + 2}`).join(', ');
    const { results } = await env.DB.prepare(
      `SELECT r.action, r.body
         FROM revision r
         JOIN (SELECT MAX(revision_id) AS revision_id
                 FROM revision
                WHERE entity = 'footprints_event' AND revision_id <= ?1 AND entity_key IN (${placeholders})
                GROUP BY entity_key) latest
           ON latest.revision_id = r.revision_id`,
    )
      .bind(footprintsRevisionId, ...chunk)
      .all<{ action: string; body: string | null }>();

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

/** The event ids `bodies` link to. */
function linkedEventIds(bodies: readonly PublishedBody[]): number[] {
  return bodies.flatMap((body) => (body.event_id === null ? [] : [body.event_id]));
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

/** The `publish` bodies the public JSON is built from: the milestones' rows among `latest`, with `change` applied. */
function liveMilestoneBodies(latest: readonly LatestRevisionRow[], change: RevisionChange | null): PublishedBody[] {
  return liveBodies(
    latest.filter((row) => row.entity === 'subscriber_milestone'),
    change,
  ) as unknown as PublishedBody[];
}

/** The milestones of the public JSON, built from `latest` with `change` applied, by date reached and then by id. */
async function publicMilestones(
  env: Env,
  latest: readonly LatestRevisionRow[],
  change: RevisionChange | null,
): Promise<PublicMilestone[]> {
  const bodies = liveMilestoneBodies(latest, change);
  const live = await liveEvents(env, linkedEventIds(bodies));
  const milestones = bodies.map((body) => publicEntryOf(body, live));

  milestones.sort((a, b) =>
    a.reached_date === b.reached_date ? a.milestone_id - b.milestone_id : a.reached_date < b.reached_date ? -1 : 1,
  );

  return milestones;
}

/**
 * The shape of the JSON this writes, as genet-publish.ts's
 * `GENET_MUSIC_SHAPE_VERSION` is for its own. Raise it whenever the shape
 * changes, and the next 「いま公開する」 builds again with no newer revision.
 *
 * 1: `milestones`.
 */
export const SUBSCRIBER_MILESTONES_SHAPE_VERSION = 1;

/**
 * What publishing.ts needs to know about 登録者数の節目. `footprints_event` is
 * read too: the check after a publish then builds the JSON again when an
 * event's revision was recorded meanwhile, by which time the event's own
 * request may have moved the timeline on. So is あしあと's last
 * `publication`, which `liveEvents` reads events up to (`cutoff`): its
 * 「いま公開する」 moves the timeline on with no revision of its own.
 */
export const MILESTONES_TARGET: PublishTarget = {
  entity: 'subscriber_milestone',
  alsoBuiltFrom: ['footprints_event'],
  cutoff: (env) => lastPublishedRevisionId(env, 'footprints'),
  target: 'subscriber_milestones',
  objectKey: OBJECT_KEY,
  table: 'subscriber_milestone',
  keyColumn: 'milestone_id',
  async buildJson(
    env: Env,
    now: Date,
    latest: readonly LatestRevisionRow[],
    change: RevisionChange | null,
  ): Promise<string> {
    return JSON.stringify({
      published_at: formatTimestamp(now),
      shape_version: SUBSCRIBER_MILESTONES_SHAPE_VERSION,
      milestones: await publicMilestones(env, latest, change),
    });
  },
};

/**
 * The 400 a refused publish answers, in footprints-publish.ts's shape: every
 * problem, and whether the fields sent were saved anyway.
 */
function refusalResponse(problems: readonly PublishProblem[], saved: boolean): Response {
  return jsonResponse({ errors: problems.map((p) => p.message), problems, saved }, { status: 400 });
}

/** The 502 when the fields were saved but the public JSON could not be written, or brought up to date - footprints-publish.ts's `notWrittenResponse`. */
async function notWrittenResponse(
  env: Env,
  milestoneId: number,
  outcome: Extract<PublishOutcome, { written: false }>,
): Promise<Response> {
  const saved = await readMilestone(env, milestoneId);

  return jsonResponse(
    {
      error: NOT_WRITTEN_TEXT,
      detail: `saved, but ${OBJECT_KEY} could not be written: ${outcome.error}`,
      saved: true,
      milestone: saved === null ? null : present(saved),
    },
    { status: 502 },
  );
}

/**
 * The 200 once a change reached the public JSON. When no revision was
 * logged for it, `notLoggedResponse`'s 404 or 409: the JSON was built again
 * without the change.
 */
async function writtenResponse(
  env: Env,
  milestoneId: number,
  outcome: Extract<PublishOutcome, { written: true }>,
): Promise<Response> {
  if (outcome.revisionId === null) return await notLoggedResponse(env, milestoneId);

  const saved = await readMilestone(env, milestoneId);

  return jsonResponse({
    milestone: saved === null ? null : present(saved),
    revisionId: outcome.revisionId,
    publicationId: outcome.publicationId,
  });
}

/** The answer when the row changed under a request that read it: published, withdrawn or saved elsewhere. */
function changedMeanwhileResponse(milestoneId: number): Response {
  return changedElsewhereResponse(`subscriber milestone ${milestoneId} changed while this request was saving it`);
}

/**
 * The answer when the batch logged no revision for the row: 404 when it was
 * deleted, 409 when it was still there but no longer published - a
 * withdrawal that landed between a published row's read and its save.
 */
async function notLoggedResponse(env: Env, milestoneId: number): Promise<Response> {
  if ((await readMilestone(env, milestoneId)) === null) {
    return noMilestoneResponse(milestoneId);
  }

  return changedMeanwhileResponse(milestoneId);
}

/**
 * `RevisionChange.whileRow` for a batch whose row statements write only
 * while no revision was recorded since `revisionBefore`, and at the version
 * `held` names: the row was given `status`, its newest revision is still
 * that one, and it is at the version they leave it at (publishing.ts's
 * `writtenAt`). All three hold exactly when those statements wrote the row.
 */
function leftAs(status: MilestoneStatus, revisionBefore: number, held: HeldToVersion): string {
  // Written into the SQL, so never anything but an integer from D1.
  if (!Number.isSafeInteger(revisionBefore)) throw new Error(`not a revision id: ${revisionBefore}`);

  return `status = '${status}'
          AND (SELECT COALESCE(MAX(revision_id), 0) FROM revision
                WHERE entity = 'subscriber_milestone'
                  AND entity_key = CAST(subscriber_milestone.milestone_id AS TEXT)) = ${revisionBefore}${writtenAt(held)}`;
}

/**
 * The 502 when the row changed under the request - deleted or withdrawn - so
 * nothing was saved, but the JSON it had already written could not be built
 * again from `revision`. `publication_write` keeps it behind, so the 公開
 * screen offers 「いま公開する」.
 */
function notMendedResponse(milestoneId: number, error: string): Response {
  return jsonResponse(
    {
      error: NOT_WRITTEN_TEXT,
      detail: `subscriber milestone ${milestoneId} changed while this request was saving it, and ${OBJECT_KEY} could not be built again without the change: ${error}`,
      saved: false,
    },
    { status: 502 },
  );
}

/**
 * Saves `fields` over `existing` and puts the result on the public site, or
 * refuses - footprints-publish.ts's `saveAndPublish`, with the same split on
 * what a refusal leaves: a draft's fields are saved and it stays a draft, a
 * published row is left exactly as it was.
 *
 * Either row is written only while it is still as it was read: still
 * published or still a draft, with no revision recorded since
 * `revisionBefore` - the milestone's newest revision, read before
 * `existing` was - and still at the version `held` names (#307), as
 * footprints-publish.ts's `saveAndPublish` has it. One that changed is neither saved nor put on the public
 * site as this request has it, and 409 says so - or `notMendedResponse`'s
 * 502, when the JSON written before the batch could not be built again
 * without the change. The save that follows a JSON that could not be
 * written is held to `revisionBefore` too, so that it does not land over
 * another request's publish.
 */
async function saveAndPublish(
  env: Env,
  existing: SubscriberMilestone,
  revisionBefore: number,
  held: HeldToVersion,
  fields: MilestoneFields,
  now: Date,
): Promise<Response> {
  const milestoneId = existing.milestone.milestone_id;
  const wasPublished = existing.milestone.status === 'published';
  const next = withFields(existing, fields, 'published');
  const problems = await publishProblems(env, next);

  if (problems.length > 0) {
    if (wasPublished) return refusalResponse(problems, false);

    // Saved only while it is still the draft it was read as: one published
    // or saved elsewhere in between is not written over, and 409 says so -
    // or 404, for one deleted in between.
    if (!savedRow(await env.DB.batch(saveStatements(env, milestoneId, fields, { whileStatus: 'draft', ...held })))) {
      return await notLoggedResponse(env, milestoneId);
    }

    return refusalResponse(problems, true);
  }

  const outcome = await publishChange(
    env,
    MILESTONES_TARGET,
    {
      key: String(milestoneId),
      action: 'publish',
      body: publishedBodyOf(next),
      whileRow: leftAs('published', revisionBefore, held),
    },
    saveStatements(env, milestoneId, fields, {
      status: 'published',
      whileStatus: wasPublished ? 'published' : 'draft',
      whileRevision: revisionBefore,
      ...held,
    }),
    now,
  );

  if (!outcome.written) {
    if (outcome.recorded) {
      // Nothing was saved, but the JSON written with the change could not
      // be built again without it: the public site may still show it.
      if (outcome.revisionId === null) return notMendedResponse(milestoneId, outcome.error);
    } else {
      const fallback = await env.DB.batch(
        saveStatements(env, milestoneId, fields, {
          whileStatus: wasPublished ? 'published' : 'draft',
          whileRevision: revisionBefore,
          ...held,
          unlogged: wasPublished,
        }),
      );

      if (!savedRow(fallback)) return await notLoggedResponse(env, milestoneId);
    }

    return await notWrittenResponse(env, milestoneId, outcome);
  }

  return await writtenResponse(env, milestoneId, outcome);
}

/**
 * POST /admin/api/subscribers/milestones/:milestoneId/publish - 「公開」. The
 * body is the milestone's fields, the same as a PUT's: what is typed is
 * saved, checked and published in this one request (#283).
 */
export async function publishMilestone(
  env: Env,
  milestoneId: number,
  body: Record<string, unknown>,
  now: Date,
): Promise<Response> {
  const revisionBefore = await newestRevisionOf(env, milestoneId);
  const existing = await readMilestone(env, milestoneId);

  if (existing === null) return noMilestoneResponse(milestoneId);

  const held = heldToVersion(body, existing.milestone.edit_version, `subscriber milestone ${milestoneId}`);

  if ('error' in held) return held.error;

  const fields = await validatedFields(env, body);

  if ('error' in fields) return fields.error;

  return await saveAndPublish(env, existing, revisionBefore, held, fields, now);
}

/**
 * PUT /admin/api/subscribers/milestones/:milestoneId - 「保存」. A draft is
 * saved as a draft (subscriber-milestones.ts's `updateMilestone`). A
 * published milestone's save reaches the public site at once, and is
 * refused, leaving the row and the public site as they were, when the fields
 * would not pass publishing.
 */
export async function saveMilestone(
  env: Env,
  milestoneId: number,
  body: Record<string, unknown>,
  now: Date,
): Promise<Response> {
  const revisionBefore = await newestRevisionOf(env, milestoneId);
  const existing = await readMilestone(env, milestoneId);

  if (existing === null) return noMilestoneResponse(milestoneId);

  if (existing.milestone.status !== 'published') return await updateMilestone(env, milestoneId, body);

  const held = heldToVersion(body, existing.milestone.edit_version, `subscriber milestone ${milestoneId}`);

  if ('error' in held) return held.error;

  const fields = await validatedFields(env, body);

  if ('error' in fields) return fields.error;

  return await saveAndPublish(env, existing, revisionBefore, held, fields, now);
}

/**
 * POST /admin/api/subscribers/milestones/:milestoneId/withdraw -
 * 「非公開に戻す」, footprints-publish.ts's `withdrawEvent` for a milestone:
 * the body is the fields, kept as the draft the milestone becomes. Nothing
 * at all changes when the JSON cannot be written, and 502 says so. 409 for a
 * milestone that is not published - when it was read, or by the time the
 * batch runs: one withdrawn or saved again in between is not written over,
 * and no second `withdraw` revision is recorded.
 */
export async function withdrawMilestone(
  env: Env,
  milestoneId: number,
  body: Record<string, unknown>,
  now: Date,
): Promise<Response> {
  const revisionBefore = await newestRevisionOf(env, milestoneId);
  const saved = await readMilestone(env, milestoneId);

  if (saved === null) return noMilestoneResponse(milestoneId);

  const held = heldToVersion(body, saved.milestone.edit_version, `subscriber milestone ${milestoneId}`);

  if ('error' in held) return held.error;

  if (saved.milestone.status !== 'published')
    return changedElsewhereResponse('only a published milestone can be withdrawn');

  // The event it is linked to already may stay, though it is no longer a
  // milestone: taking the row off the public site must not wait on あしあと.
  const fields = await validatedFields(env, body, saved.milestone.event_id);

  if ('error' in fields) return fields.error;

  const outcome = await publishChange(
    env,
    MILESTONES_TARGET,
    { key: String(milestoneId), action: 'withdraw', body: null, whileRow: leftAs('draft', revisionBefore, held) },
    saveStatements(env, milestoneId, fields, {
      status: 'draft',
      whileStatus: 'published',
      whileRevision: revisionBefore,
      ...held,
    }),
    now,
  );

  if (!outcome.written) {
    if (outcome.recorded && outcome.revisionId === null) return notMendedResponse(milestoneId, outcome.error);
    if (outcome.recorded) return await notWrittenResponse(env, milestoneId, outcome);

    return refuse(502, refusal(NOT_WRITTEN_TEXT, `${OBJECT_KEY} could not be written: ${outcome.error}`));
  }

  return await writtenResponse(env, milestoneId, outcome);
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
 * - `pending`: a milestone whose latest revision is newer than the last time
 *   the JSON was written. Since #283 every publish writes the JSON, so only
 *   a row sent to 公開待ち before then, or one whose JSON could not be
 *   written, waits
 * - `eventChanged`: a milestone not in `pending` whose linked event, as the
 *   public timeline shows it now, is not what the stored JSON says. Its own
 *   revision has not changed, so nothing but this says the stored JSON is out
 *   of date (HQ's condition on #225). An event's publish builds the JSON
 *   again (`republishMilestonesForEvents`), so this is left only when that
 *   failed
 * - `shapeOutdated`: the stored JSON is in an older shape than this code
 *   builds. With no revision at all there is nothing to build from, so that
 *   is never outdated
 * - `behind`: a write of the JSON was sent that no check found up to date
 *   since (publishing.ts's `isBehind`)
 */
async function publishState(env: Env) {
  const [lastRevisionId, own, stored, behind] = await Promise.all([
    lastPublishedRevisionId(env, MILESTONES_TARGET.target),
    latestRevisions(env, 'subscriber_milestone'),
    storedJson(env),
    isBehind(env, MILESTONES_TARGET.target),
  ]);

  const live = await liveEvents(env, linkedEventIds(liveMilestoneBodies(own, null)));
  const pending = own
    .filter((row) => row.revision_id > lastRevisionId)
    .map((row) => ({ milestoneId: Number(row.entity_key), latestAction: row.action }));
  const storedById = new Map(stored.milestones.map((entry) => [entry.milestone_id, entry]));
  const eventChanged: { milestoneId: number; eventId: number }[] = [];

  for (const row of own) {
    if (row.revision_id > lastRevisionId || row.action === 'withdraw' || row.body === null) continue;

    const body = JSON.parse(row.body) as PublishedBody;
    const entry = storedById.get(body.milestone_id);

    if (body.event_id === null || entry === undefined) continue;

    if (JSON.stringify(entry.event ?? null) !== JSON.stringify(live.get(body.event_id) ?? null)) {
      eventChanged.push({ milestoneId: body.milestone_id, eventId: body.event_id });
    }
  }

  const shapeOutdated = own.length > 0 && stored.shapeVersion < SUBSCRIBER_MILESTONES_SHAPE_VERSION;

  return {
    own,
    pending,
    eventChanged,
    shapeOutdated,
    behind,
    needsBuild: pending.length > 0 || eventChanged.length > 0 || shapeOutdated || behind,
  };
}

/**
 * What 「いま公開する」 for `subscriber_milestones` would act on, for the
 * sidebar's mark (drafts.ts): the milestones waiting, those whose
 * linked event changed under them, and whether the run would build at all -
 * `publishState`'s own answer, so the two cannot disagree.
 */
export async function waitingSubscriberMilestones(env: Env): Promise<{
  pending: { milestoneId: number; latestAction: string }[];
  eventChanged: { milestoneId: number }[];
  needsBuild: boolean;
}> {
  const { pending, eventChanged, needsBuild } = await publishState(env);

  return { pending, eventChanged, needsBuild };
}

/**
 * GET /admin/api/subscribers/pending.
 *
 * `pending`, `eventChanged`, `shapeOutdated` and `behind` are
 * `publishState`'s: any of them is something 「いま公開する」 would write.
 * `changed` is a `published` milestone whose working row no longer matches
 * the `publish` revision that made it live - since #283, one whose save went
 * through while the JSON could not be written, or one changed before then.
 */
export async function pendingSubscriberMilestones(env: Env): Promise<Response> {
  const state = await publishState(env);

  const { results: publishedRows } = await env.DB.prepare(
    `SELECT milestone_id FROM subscriber_milestone WHERE status = 'published' ORDER BY milestone_id`,
  ).all<{ milestone_id: number }>();

  const byId = await readMilestones(
    env,
    publishedRows.map((row) => row.milestone_id),
  );

  const latestByKey = new Map(state.own.map((row) => [row.entity_key, row]));
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
    behind: state.behind,
  });
}

/**
 * POST /admin/api/subscribers/publish - 「いま公開する」. Builds
 * `subscribers/milestones.json` from `revision` through publishing.ts's
 * `republish`, which checks it again after writing it as a publish does.
 * 200 answers `{ published: false }`, and nothing is written, when
 * `publishState` finds nothing to build. 502 when the JSON could not be
 * brought up to date, with no `publication` row recorded for it.
 *
 * Pressed from the 登録者数の節目 list while the JSON needs it (#285).
 */
export async function publishSubscriberMilestonesNow(env: Env, now: Date): Promise<Response> {
  const state = await publishState(env);

  if (!state.needsBuild) return jsonResponse({ published: false });

  const outcome = await republish(env, MILESTONES_TARGET, now);

  if (!outcome.current) {
    return refuse(502, refusal(NOT_WRITTEN_TEXT, `${OBJECT_KEY} could not be brought up to date: ${outcome.error}`));
  }

  return jsonResponse({
    published: true,
    publicationId: outcome.publicationId,
    milestoneCount: liveMilestoneBodies(outcome.latest, null).length,
    byteLength: outcome.byteLength,
  });
}

/**
 * Builds `subscribers/milestones.json` again when an event's publish, save
 * or withdraw changed how it names a linked event (#277's 6-6), to be called
 * once the event's change was recorded. Nothing is written when the stored
 * JSON already names every linked event as the timeline has it.
 *
 * Never throws: the event's own change went through, and its answer says so.
 * A milestone this leaves out of date is still `eventChanged` in
 * `GET /subscribers/pending`, and 「いま公開する」 mends it.
 */
export async function republishMilestonesForEvents(env: Env, now: Date): Promise<void> {
  try {
    const [own, stored] = await Promise.all([latestRevisions(env, 'subscriber_milestone'), storedJson(env)]);
    const bodies = liveMilestoneBodies(own, null);
    const live = await liveEvents(env, linkedEventIds(bodies));
    const linked = new Map(bodies.map((body) => [body.milestone_id, body.event_id]));

    const stale = stored.milestones.some((entry) => {
      const eventId = linked.get(entry.milestone_id) ?? null;
      const expected = eventId === null ? null : (live.get(eventId) ?? null);

      return JSON.stringify(entry.event ?? null) !== JSON.stringify(expected);
    });

    if (stale) await republish(env, MILESTONES_TARGET, now);
  } catch {
    // Left for eventChanged; see above.
  }
}
