import { byteLength } from '../lib/backup';
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

  if (stream.platform === 'youtube' && stream.video_id.length !== VIDEO_ID_LENGTH) {
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
      if (s.video_id.length !== VIDEO_ID_LENGTH) {
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

  const results = await env.DB.batch([
    env.DB.prepare(`UPDATE genet_stream SET status = 'published' WHERE video_id = ?1`).bind(videoId),
    revisionStatement(env.DB, 'genet_stream', videoId, 'publish', streamPublicShapeOf(saved)),
    ...changedTunes.map((tune) =>
      revisionStatement(env.DB, 'genet_tune', String(tune.tune.tune_id), 'publish', tunePublicShapeOf(tune)),
    ),
    ...changedPeople.map((person) =>
      revisionStatement(env.DB, 'genet_person', String(person.person_id), 'publish', personPublicShapeOf(person)),
    ),
  ]);

  return jsonResponse({
    stream: presentStream(withStatus(saved, 'published')),
    revisionId: results[1].meta.last_row_id,
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

  return jsonResponse({ pending, changed });
}

interface PublicStream {
  video_id: string;
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
 */
export async function publishGenetMusicNow(env: Env, now: Date): Promise<Response> {
  const [lastRevisionId, streamRevisions, tuneRevisions, personRevisions] = await Promise.all([
    lastPublishedRevisionId(env, 'genet_music'),
    latestRevisions(env, 'genet_stream'),
    latestRevisions(env, 'genet_tune'),
    latestRevisions(env, 'genet_person'),
  ]);

  const newestRevisionId = [...streamRevisions, ...tuneRevisions, ...personRevisions].reduce(
    (max, row) => Math.max(max, row.revision_id),
    0,
  );

  if (newestRevisionId <= lastRevisionId) {
    return jsonResponse({ published: false });
  }

  const streams = streamRevisions
    .filter((r) => r.action !== 'withdraw' && r.body !== null)
    .map((r) => JSON.parse(r.body!) as PublicStream);

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

  const objectKey = 'genet/music.json';
  const json = JSON.stringify({ published_at: formatTimestamp(now), streams, tunes, people });
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
