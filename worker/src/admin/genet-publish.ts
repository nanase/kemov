import { byteLength } from '../lib/backup';
import { queryInChunks } from '../lib/d1';
import type { Env } from '../lib/env';
import { errorResponse, jsonResponse } from '../lib/json';
import { revisionStatement } from '../lib/revision';
import { isSchemaTimestamp, formatTimestamp } from '../lib/time';
import { publicShapeOf as personPublicShapeOf, readPeople, type PersonRow } from './genet-people';
import { publicShapeOf as tunePublicShapeOf, readTunes, type GenetTune } from './genet-tunes';
import {
  present as presentStream,
  publicShapeOf as streamPublicShapeOf,
  readStream,
  readStreams,
  type GenetStream,
} from './genet-streams';

/**
 * Publishing `genet_stream` (#141, task 10): the validation that lets a
 * stream become part of the public JSON, withdrawing it back to a draft, and
 * building `genet/music.json` from `revision` rather than from the working
 * rows - the same shape footprints-publish.ts gives `footprints_event`,
 * extended here because publishing a stream also has to decide whether the
 * tunes and people it performs need a fresh `publish` revision of their own.
 * genet-streams.ts, genet-tunes.ts and genet-people.ts are everything up to
 * this point - reading, saving and deleting each of the three without ever
 * touching a `revision` row.
 */

const VIDEO_ID_LENGTH = 11;

/**
 * Every way `saved` (and the tunes and people it performs) falls short of
 * what `publish` requires, collected rather than stopped at the first one -
 * the same shape footprints-publish.ts's `publishProblems` uses.
 *
 * `tunes` and `people` hold every tune a performance names and every person
 * an attribute of one of those tunes names - the caller (`publishStream`)
 * reads them first so this function can stay a pure check. A tune or person
 * id with no entry in its map is itself one of the problems reported below.
 * In practice this can never actually happen through this admin API:
 * `genet_performance.tune_id` and `genet_tune_attribute_person.person_id` are
 * both foreign keys D1 enforces, and genet-streams.ts's `createStream`/
 * `updateStream` and genet-tunes.ts's `createTune`/`updateTune` already
 * refuse an unknown id with a 400 before any row naming it is ever saved
 * (task 10's handoff still asks for the check here too, task 9's own
 * `publishProblems` in footprints-publish.ts does the same for its own
 * schema-guaranteed conditions).
 */
function publishProblems(
  saved: GenetStream,
  tunes: ReadonlyMap<number, GenetTune>,
  people: ReadonlyMap<number, PersonRow>,
): string[] {
  const { stream, performances } = saved;
  const problems: string[] = [];

  // The 11-character length is YouTube's own; a TikTok id is 19 digits, and
  // a scene points at the same id as its stream, so the scenes follow the
  // stream's platform.
  const isYoutube = stream.platform === 'youtube';

  if (isYoutube && stream.video_id.length !== VIDEO_ID_LENGTH) {
    problems.push(`videoId must be ${VIDEO_ID_LENGTH} characters`);
  }

  if (stream.title === '') problems.push('title must not be empty');
  if (!isSchemaTimestamp(stream.published_at)) problems.push('publishedAt must be YYYY-MM-DDTHH:MM:SSZ');
  if (performances.length === 0) problems.push('performances must have at least one tune');

  const referencedTuneIds = new Set<number>();

  performances.forEach((p, index) => {
    if (!tunes.has(p.tune_id)) {
      problems.push(`performances[${index}].tuneId ${p.tune_id} does not exist`);
    } else {
      referencedTuneIds.add(p.tune_id);
    }

    p.scenes.forEach((s, sceneIndex) => {
      if (isYoutube && s.video_id.length !== VIDEO_ID_LENGTH) {
        problems.push(`performances[${index}].scenes[${sceneIndex}].videoId must be ${VIDEO_ID_LENGTH} characters`);
      }
      if (s.start_seconds !== null && s.start_seconds < 0) {
        problems.push(`performances[${index}].scenes[${sceneIndex}].startSeconds must be 0 or more`);
      }
    });
  });

  for (const tuneId of referencedTuneIds) {
    const tune = tunes.get(tuneId)!;

    if (tune.tune.title === '') problems.push(`tune ${tuneId}: title must not be empty`);

    tune.attributes.forEach((a, index) => {
      if (a.text !== null && a.people.length > 0) {
        problems.push(`tune ${tuneId} attributes[${index}]: text and people must not both be present`);
      }

      for (const p of a.people) {
        const person = people.get(p.person_id);

        if (person === undefined) {
          problems.push(`tune ${tuneId} attributes[${index}]: person ${p.person_id} does not exist`);
        } else if (person.name === '') {
          problems.push(`person ${p.person_id}: name must not be empty`);
        }
      }
    });
  }

  return problems;
}

/** Every distinct `tuneId` a stream's performances name. */
function tuneIdsOf(saved: GenetStream): number[] {
  return [...new Set(saved.performances.map((p) => p.tune_id))];
}

/** Every distinct `personId` an already-read set of tunes names in their attributes. */
function personIdsOf(tunes: Iterable<GenetTune>): number[] {
  const ids = new Set<number>();

  for (const tune of tunes) {
    for (const a of tune.attributes) {
      for (const p of a.people) ids.add(p.person_id);
    }
  }

  return [...ids];
}

interface LatestRevisionRow {
  entity_key: string;
  revision_id: number;
  action: string;
  body: string | null;
}

/** The latest `revision` row for every `entity_key` an entity has one for, oldest concerns first - the same query footprints-publish.ts's own `latestRevisions` runs, parameterized here because this file tracks three entities instead of one. */
async function latestRevisions(env: Env, entity: string): Promise<LatestRevisionRow[]> {
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
 * POST /admin/api/genet/streams/:videoId/publish.
 *
 * 400 with every failing condition when `saved`, or a tune or person it
 * performs, is not ready; otherwise `status` becomes `published` and a
 * `publish` revision is logged for the stream, and for every tune and person
 * it performs whose current shape does not already match its own latest
 * revision - all in one `db.batch`, so the stream and the tunes/people it
 * depends on cannot end up with a revision history that disagrees about what
 * was actually published together. Publishing an already-published stream is
 * allowed, the same as footprints-publish.ts's `publishEvent`.
 */
export async function publishStream(env: Env, videoId: string): Promise<Response> {
  const saved = await readStream(env, videoId);

  if (saved === null) return errorResponse(404, `no stream ${videoId}`);

  const tuneIds = tuneIdsOf(saved);
  const tunes = await readTunes(env, tuneIds);
  const personIds = personIdsOf(tunes.values());
  const people = await readPeople(env, personIds);

  const problems = publishProblems(saved, tunes, people);

  if (problems.length > 0) return jsonResponse({ errors: problems }, { status: 400 });

  const [tuneRevisions, personRevisions] = await Promise.all([
    latestRevisions(env, 'genet_tune'),
    latestRevisions(env, 'genet_person'),
  ]);

  const tuneRevisionByKey = new Map(tuneRevisions.map((r) => [r.entity_key, r]));
  const personRevisionByKey = new Map(personRevisions.map((r) => [r.entity_key, r]));

  const changedTunes = [...tunes.values()].filter((tune) => {
    const latest = tuneRevisionByKey.get(String(tune.tune.tune_id));
    const current = JSON.stringify(tunePublicShapeOf(tune));

    return latest === undefined || latest.body === null || JSON.stringify(JSON.parse(latest.body)) !== current;
  });

  const changedPeople = [...people.values()].filter((person) => {
    const latest = personRevisionByKey.get(String(person.person_id));
    const current = JSON.stringify(personPublicShapeOf(person));

    return latest === undefined || latest.body === null || JSON.stringify(JSON.parse(latest.body)) !== current;
  });

  // The readStream above and this batch are two round trips, not one, so a
  // concurrent deleteStream can land in between - genet_stream has no
  // ON DELETE CASCADE, and nothing stops that delete's own batch from
  // running once this one has (see deleteStream's own comment on the same
  // race from its side). Gating the stream's own revision INSERT on EXISTS,
  // the same way footprints-publish.ts's publishEvent does, ties "did we log
  // a revision" to the row as this batch actually finds it: the UPDATE above
  // still runs even when the row is gone (SET on nothing changes nothing),
  // but no `publish` revision is logged for a stream no longer there to
  // publish. `changedTunes`/`changedPeople` below are not gated the same
  // way - a tune or person is never deleted by deleteStream, so nothing here
  // races their own rows.
  const results = await env.DB.batch([
    env.DB.prepare(`UPDATE genet_stream SET status = 'published' WHERE video_id = ?1`).bind(videoId),
    env.DB.prepare(
      `INSERT INTO revision (entity, entity_key, action, body, created_via)
       SELECT 'genet_stream', ?1, 'publish', ?2, 'admin'
       WHERE EXISTS (SELECT 1 FROM genet_stream WHERE video_id = ?1)
       RETURNING revision_id`,
    ).bind(videoId, JSON.stringify(streamPublicShapeOf(saved))),
    ...changedTunes.map((tune) =>
      revisionStatement(env.DB, 'genet_tune', String(tune.tune.tune_id), 'publish', tunePublicShapeOf(tune)),
    ),
    ...changedPeople.map((person) =>
      revisionStatement(env.DB, 'genet_person', String(person.person_id), 'publish', personPublicShapeOf(person)),
    ),
  ]);

  // `RETURNING` rather than `results[1].meta.last_row_id`: when the EXISTS
  // guard above skips the INSERT (the concurrent-delete race the comment
  // above this batch explains), `last_row_id` would answer with whatever the
  // last statement in this same batch that did insert left behind - one of
  // changedTunes/changedPeople's own revisions, not this stream's - rather
  // than admitting no revision was actually logged for it.
  const streamRevision = (results[1].results as { revision_id: number }[])[0];

  return jsonResponse({
    stream: presentStream(withStatus(saved, 'published')),
    ...(streamRevision === undefined ? {} : { revisionId: streamRevision.revision_id }),
    tuneRevisionCount: changedTunes.length,
    personRevisionCount: changedPeople.length,
  });
}

/**
 * POST /admin/api/genet/streams/:videoId/withdraw. `status` becomes `draft`
 * and a `withdraw` revision (a `null` body) is logged for the stream alone -
 * the tunes and people it performs keep whatever `revision` they already
 * have. Withdrawing is a decision about this one stream's own place in the
 * public JSON, not about whether a tune or person it once performed still
 * belongs there; "publish now" (`publishGenetMusicNow`) is what actually
 * decides that, from which streams are still `published` at the time it
 * runs.
 */
export async function withdrawStream(env: Env, videoId: string): Promise<Response> {
  const saved = await readStream(env, videoId);

  if (saved === null) return errorResponse(404, `no stream ${videoId}`);

  const results = await env.DB.batch([
    env.DB.prepare(`UPDATE genet_stream SET status = 'draft' WHERE video_id = ?1`).bind(videoId),
    revisionStatement(env.DB, 'genet_stream', videoId, 'withdraw', null),
  ]);

  return jsonResponse({
    stream: presentStream(withStatus(saved, 'draft')),
    revisionId: results[1].meta.last_row_id,
  });
}

function withStatus(saved: GenetStream, status: string): GenetStream {
  return { ...saved, stream: { ...saved.stream, status } };
}

/**
 * GET /admin/api/genet/pending.
 *
 * "公開を待っているもの": any of the three entities whose latest revision is
 * newer than the last "いま公開する" run for `genet_music`.
 *
 * "公開後に変更あり": a stream that is currently `published` whose working
 * row (with its performances and scenes) no longer matches the `publish`
 * revision that made it live, or a tune/person that has ever been published
 * whose working row no longer matches its own latest revision - a tune or
 * person has no `status` of its own, so "has a revision at all" stands in
 * for "is currently live" the way `status = 'published'` does for a stream.
 *
 * `shapeOutdated`: the stored JSON is in an older shape than this code builds
 * (`shapeIsOutdated`), so "いま公開する" would build it again even when
 * nothing above is waiting.
 */
export async function pendingGenetMusic(env: Env): Promise<Response> {
  const [lastRevisionId, streamRevisions, tuneRevisions, personRevisions] = await Promise.all([
    lastPublishedRevisionId(env, 'genet_music'),
    latestRevisions(env, 'genet_stream'),
    latestRevisions(env, 'genet_tune'),
    latestRevisions(env, 'genet_person'),
  ]);

  const pending = [
    ...streamRevisions.map((r) => ({
      entity: 'genet_stream' as const,
      key: r.entity_key,
      revisionId: r.revision_id,
      latestAction: r.action,
    })),
    ...tuneRevisions.map((r) => ({
      entity: 'genet_tune' as const,
      key: r.entity_key,
      revisionId: r.revision_id,
      latestAction: r.action,
    })),
    ...personRevisions.map((r) => ({
      entity: 'genet_person' as const,
      key: r.entity_key,
      revisionId: r.revision_id,
      latestAction: r.action,
    })),
  ].filter((row) => row.revisionId > lastRevisionId);

  const changed: { entity: 'genet_stream' | 'genet_tune' | 'genet_person'; key: string; title: string }[] = [];

  const { results: publishedStreams } = await env.DB.prepare(
    `SELECT video_id FROM genet_stream WHERE status = 'published' ORDER BY video_id`,
  ).all<{ video_id: string }>();

  const streamRevisionByKey = new Map(streamRevisions.map((r) => [r.entity_key, r]));
  const streamsById = await readStreams(
    env,
    publishedStreams.map((row) => row.video_id),
  );

  for (const { video_id: videoId } of publishedStreams) {
    const revision = streamRevisionByKey.get(videoId);

    if (revision === undefined || revision.body === null) continue;

    const saved = streamsById.get(videoId);

    if (saved === undefined) continue;

    const current = JSON.stringify(streamPublicShapeOf(saved));
    const publishedBody = JSON.stringify(JSON.parse(revision.body));

    if (current !== publishedBody) changed.push({ entity: 'genet_stream', key: videoId, title: saved.stream.title });
  }

  const everPublishedTuneIds = tuneRevisions.filter((r) => r.body !== null).map((r) => Number(r.entity_key));
  const tunesById = await readTunes(env, everPublishedTuneIds);
  const tuneRevisionByKey = new Map(tuneRevisions.map((r) => [r.entity_key, r]));

  for (const tuneId of everPublishedTuneIds) {
    const tune = tunesById.get(tuneId);
    const revision = tuneRevisionByKey.get(String(tuneId));

    if (tune === undefined || revision === undefined || revision.body === null) continue;

    const current = JSON.stringify(tunePublicShapeOf(tune));
    const publishedBody = JSON.stringify(JSON.parse(revision.body));

    if (current !== publishedBody) changed.push({ entity: 'genet_tune', key: String(tuneId), title: tune.tune.title });
  }

  const everPublishedPersonIds = personRevisions.filter((r) => r.body !== null).map((r) => Number(r.entity_key));
  const peopleById = await readPeople(env, everPublishedPersonIds);
  const personRevisionByKey = new Map(personRevisions.map((r) => [r.entity_key, r]));

  for (const personId of everPublishedPersonIds) {
    const person = peopleById.get(personId);
    const revision = personRevisionByKey.get(String(personId));

    if (person === undefined || revision === undefined || revision.body === null) continue;

    const current = JSON.stringify(personPublicShapeOf(person));
    const publishedBody = JSON.stringify(JSON.parse(revision.body));

    if (current !== publishedBody) changed.push({ entity: 'genet_person', key: String(personId), title: person.name });
  }

  const shapeOutdated = await shapeIsOutdated(env, newestRevisionIdOf(streamRevisions, tuneRevisions, personRevisions));

  return jsonResponse({ pending, changed, shapeOutdated });
}

interface PublicStream {
  video_id: string;
  platform: string;
  published_at: string;
  performances: { tune_id: number }[];
}

interface PublicTune {
  tune_id: number;
  attributes: { people: { person_id: number }[] }[];
}

interface PublicPerson {
  person_id: number;
}

/**
 * The shape of the JSON `publishGenetMusicNow` writes. Raise it whenever that
 * shape changes, and a run that finds an older one already stored builds again
 * even though no revision is newer than the last run (see
 * `storedShapeVersion`). Without it, a new field would not reach the public
 * JSON until somebody happened to edit a stream, and every later change of
 * shape would need its own one-off condition for the same reason.
 *
 * 1: streams, tunes and people (a JSON that carries no `shape_version` at all).
 * 2: adds `shape_version` and `channel_id`.
 */
export const GENET_MUSIC_SHAPE_VERSION = 2;

const GENET_MUSIC_OBJECT_KEY = 'genet/music.json';

/**
 * The `shape_version` of the JSON stored in `PUBLIC_DATA`. A JSON with no such
 * field is version 1, and so is one that is missing or cannot be read: building
 * again gives the same result however often it runs, so when in doubt the safe
 * side is to build.
 *
 * It is read from the object itself, not from the `publication` row in D1.
 * D1 and R2 do not share a transaction (#170), so D1 can say a run finished
 * while the R2 write beneath it failed; the row would then claim a version the
 * stored JSON does not have, and a stale JSON would go on being served.
 */
async function storedShapeVersion(env: Env): Promise<number> {
  const object = await env.PUBLIC_DATA.get(GENET_MUSIC_OBJECT_KEY);

  if (object === null) return 1;

  try {
    const stored = JSON.parse(await object.text()) as { shape_version?: unknown } | null;

    return typeof stored?.shape_version === 'number' ? stored.shape_version : 1;
  } catch {
    return 1;
  }
}

/** The newest `revision_id` across every row given, or 0 when there is none. */
function newestRevisionIdOf(...lists: readonly LatestRevisionRow[][]): number {
  return lists.flat().reduce((max, row) => Math.max(max, row.revision_id), 0);
}

/**
 * Whether the stored JSON is in an older shape than this code builds, so that
 * a run should build it again with no revision newer than the last one.
 *
 * `publishGenetMusicNow` decides to build with this, and `pendingGenetMusic`
 * reports it to the admin screen so that the screen lets the run be asked for.
 * The two must never disagree - a screen that refuses what the run would do
 * leaves an older JSON in place with no way to replace it - so both call this
 * one function.
 *
 * With no revision at all there is nothing to build from, so that is not "an
 * older shape": the publication row a run writes could not name a revision.
 */
async function shapeIsOutdated(env: Env, newestRevisionId: number): Promise<boolean> {
  return newestRevisionId > 0 && (await storedShapeVersion(env)) < GENET_MUSIC_SHAPE_VERSION;
}

/**
 * The channel whose icon the page draws beside its title, or null when the
 * published streams do not point clearly at one.
 *
 * A stream's channel is not part of what is published, so it is looked up from
 * `video`, by counting which channel the YouTube streams belong to. The first
 * stream cannot stand for the rest: a few are collaborations hosted on another
 * member's channel, and if one of those came first (or there were only a few
 * streams) the page would show that member's icon. A channel wins only with at
 * least half of the streams that could be looked up, and only when it is ahead
 * of every other; a tie or a scattering answers null, and the page keeps its
 * plain coloured circle, which is better than a wrong face.
 *
 * TikTok streams are left out of the count: `video` holds no row for them, so
 * counting them would make the half unreachable. So are YouTube streams with no
 * `video` row yet.
 *
 * `streams` is read here from the revision bodies, before the public arrays
 * are built, so the count does not depend on what the public shape carries.
 */
async function majorityChannelId(env: Env, streams: readonly PublicStream[]): Promise<string | null> {
  const youtubeIds = streams.filter((s) => s.platform === 'youtube').map((s) => s.video_id);

  const rows = await queryInChunks(youtubeIds, async (chunk) => {
    const placeholders = chunk.map((_, index) => `?${index + 1}`).join(', ');
    const { results } = await env.DB.prepare(
      `SELECT channel_id, COUNT(*) AS n FROM video WHERE video_id IN (${placeholders}) GROUP BY channel_id`,
    )
      .bind(...chunk)
      .all<{ channel_id: string; n: number }>();

    return results;
  });

  // A channel can come back once per chunk, so the counts are added up here.
  const counts = new Map<string, number>();

  for (const row of rows) counts.set(row.channel_id, (counts.get(row.channel_id) ?? 0) + row.n);

  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const matched = ranked.reduce((sum, [, n]) => sum + n, 0);
  const [top, second] = ranked;

  if (top === undefined) return null;
  if (top[1] * 2 < matched) return null;
  if (second !== undefined && second[1] === top[1]) return null;

  return top[0];
}

/**
 * POST /admin/api/genet/publish - "いま公開する". Builds `genet/music.json`
 * from the latest `revision` of every `genet_stream` entity whose latest
 * action is not `withdraw`, together with every tune and person those
 * streams' own published bodies name - not from a fresh read of
 * `genet_performance`/`genet_tune_attribute_person`, so a tune or person
 * dropped from a stream after it was published cannot leak back in from a
 * table this JSON is not built from. Writes the result to `PUBLIC_DATA` and
 * appends one `publication` row. Nothing is written, and 200 answers
 * `{ published: false }`, when there is nothing newer than the last run.
 *
 * The three entities share one `publication` row and one `last_revision_id`:
 * "newer than last time" is asked once, across whichever of the three
 * changed, the same way #141's design describes one `target` per public JSON
 * file rather than one per table.
 *
 * A JSON stored in an older shape (`GENET_MUSIC_SHAPE_VERSION`) is built again
 * even when no revision is newer, so a change of shape reaches the public
 * JSON without anyone having to edit a stream first.
 */
export async function publishGenetMusicNow(env: Env, now: Date): Promise<Response> {
  const [lastRevisionId, streamRevisions, tuneRevisions, personRevisions] = await Promise.all([
    lastPublishedRevisionId(env, 'genet_music'),
    latestRevisions(env, 'genet_stream'),
    latestRevisions(env, 'genet_tune'),
    latestRevisions(env, 'genet_person'),
  ]);

  const newestRevisionId = newestRevisionIdOf(streamRevisions, tuneRevisions, personRevisions);
  const nothingNewer = newestRevisionId <= lastRevisionId;

  if (nothingNewer && !(await shapeIsOutdated(env, newestRevisionId))) {
    return jsonResponse({ published: false });
  }

  const streams = streamRevisions
    .filter((r) => r.action !== 'withdraw' && r.body !== null)
    .map((r) => JSON.parse(r.body!) as PublicStream);

  const channelId = await majorityChannelId(env, streams);

  const tuneIds = new Set<number>();

  for (const s of streams) for (const p of s.performances) tuneIds.add(p.tune_id);

  const tuneRevisionByKey = new Map(tuneRevisions.map((r) => [r.entity_key, r]));
  const tunes = [...tuneIds]
    .map((tuneId) => tuneRevisionByKey.get(String(tuneId)))
    .filter((r): r is LatestRevisionRow => r !== undefined && r.body !== null)
    .map((r) => JSON.parse(r.body!) as PublicTune);

  const personIds = new Set<number>();

  for (const t of tunes) for (const a of t.attributes) for (const p of a.people) personIds.add(p.person_id);

  const personRevisionByKey = new Map(personRevisions.map((r) => [r.entity_key, r]));
  const people = [...personIds]
    .map((personId) => personRevisionByKey.get(String(personId)))
    .filter((r): r is LatestRevisionRow => r !== undefined && r.body !== null)
    .map((r) => JSON.parse(r.body!) as PublicPerson);

  streams.sort((a, b) => (a.published_at === b.published_at ? 0 : a.published_at < b.published_at ? 1 : -1));
  tunes.sort((a, b) => a.tune_id - b.tune_id);
  people.sort((a, b) => a.person_id - b.person_id);

  const objectKey = GENET_MUSIC_OBJECT_KEY;
  const json = JSON.stringify({
    published_at: formatTimestamp(now),
    shape_version: GENET_MUSIC_SHAPE_VERSION,
    channel_id: channelId,
    streams,
    tunes,
    people,
  });
  const jsonByteLength = byteLength(json);

  await env.PUBLIC_DATA.put(objectKey, json, {
    httpMetadata: { contentType: 'application/json; charset=UTF-8' },
  });

  const inserted = await env.DB.prepare(
    `INSERT INTO publication (target, last_revision_id, object_key, byte_length) VALUES ('genet_music', ?1, ?2, ?3)`,
  )
    .bind(newestRevisionId, objectKey, jsonByteLength)
    .run();

  return jsonResponse({
    published: true,
    publicationId: inserted.meta.last_row_id,
    streamCount: streams.length,
    tuneCount: tunes.length,
    personCount: people.length,
    byteLength: jsonByteLength,
  });
}
