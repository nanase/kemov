import { queryInChunks } from '../lib/d1';
import type { Env } from '../lib/env';
import { changedElsewhereResponse, jsonResponse } from '../lib/json';
import { refusal, refuse } from '../lib/refusal';
import type { RevisionEntity } from '../lib/revision';
import { formatTimestamp } from '../lib/time';
import { heldToVersion, writtenAt, type HeldToVersion } from '../lib/edit-version';
import { publicShapeOf as personPublicShapeOf, readPeople, type PersonRow } from './genet-people';
import {
  newestRevisionOf as newestStreamRevisionOf,
  noStreamResponse,
  present as presentStream,
  publicShapeOf as streamPublicShapeOf,
  readStream,
  readStreams,
  savedRow,
  saveStatements as streamSaveStatements,
  updateStream,
  validatedStreamFields,
  withFields as streamWithFields,
  type GenetStream,
  type StreamFields,
  type StreamStatus,
} from './genet-streams';
import {
  isPerformedLive,
  NEWEST_TUNE_REVISION,
  newestRevisionOf as newestTuneRevisionOf,
  noTuneResponse,
  present as presentTune,
  publicShapeOf as tunePublicShapeOf,
  readTune,
  readTunes,
  savedTuneRow,
  saveStatements as tuneSaveStatements,
  tuneSavedElsewhereResponse,
  validatedTuneFields,
  withFields as tuneWithFields,
  type GenetTune,
} from './genet-tunes';
import {
  isBehind,
  latestRevisions,
  liveBodiesOf,
  loggedRevisions,
  publishChange,
  republish,
  type LatestRevisionRow,
  type LoggedRevision,
  type PublishOutcome,
  type PublishTarget,
} from './publishing';

/**
 * Publishing ジェネット楽曲一覧 (#141, #284): the validation that lets a
 * stream become part of the public JSON, and the requests that change what
 * `genet/music.json` holds - 「公開」 on a draft stream, 「保存」 on a
 * published one, 「非公開に戻す」, and the 保存 of a tune a published stream
 * performs (#277's 6-5). Each writes the JSON itself, through
 * publishing.ts's `publishChange`, built from `revision` rather than from
 * the working rows. A stream's publish also logs a `publish` revision for
 * each tune and person it performs whose public shape changed.
 * genet-streams.ts, genet-tunes.ts and genet-people.ts are everything else -
 * reading, saving a draft and deleting each of the three without ever
 * touching a `revision` row.
 */

const VIDEO_ID_LENGTH = 11;

const GENET_MUSIC_OBJECT_KEY = 'genet/music.json';

/** What the screen says when the public JSON could not be written; which step failed, and why, stays in `detail`. */
const NOT_WRITTEN_TEXT = '本番の楽曲一覧への反映に失敗しました';

/**
 * One way a stream falls short of publishing: the part of the form it is
 * about, and the sentence the edit panel lists under 「公開できません」 as it
 * stands (#277's decision 1d) - the screen does not check these again.
 * `performanceIndex` names the performance, counted from 0, for a problem
 * with one; it is null otherwise.
 */
export interface StreamPublishProblem {
  field: 'title' | 'videoId' | 'performances';
  performanceIndex: number | null;
  message: string;
}

/** One way a tune falls short of publishing, for a tune a published stream performs (#284's 6-5). */
export interface TunePublishProblem {
  field: 'attributes';
  /** The attribute, counted from 0. */
  attributeIndex: number;
  message: string;
}

/** Why `tune`'s attributes would not pass publishing, the `k` in each sentence counted from 1. */
function attributeProblems(tune: GenetTune): { attributeIndex: number; sentence: string }[] {
  return tune.attributes.flatMap((a, index) =>
    a.text !== null && a.people.length > 0
      ? [
          {
            attributeIndex: index,
            sentence: `作曲・作詞などの ${index + 1} 番目に、文章と人物の両方が書かれています。どちらか一方にしてください。`,
          },
        ]
      : [],
  );
}

/**
 * Every way `saved`, and the tunes it performs, fall short of what
 * `publish` requires, collected rather than stopped at the first one - the
 * same shape footprints-publish.ts's `publishProblems` uses.
 *
 * What saving already refuses is not checked again here, as
 * footprints-publish.ts does not either: `published_at`'s shape, a scene's
 * `start_seconds`, an unknown `tune_id` or `person_id`
 * (genet-streams.ts's and genet-tunes.ts's `validated*Fields`, and the
 * foreign keys behind them), a tune's empty title and a person's empty name.
 * Nothing that can be saved fails them. A tune `tunes` has no entry for is
 * passed over for the same reason.
 *
 * A tune is shared, so its problem is said once, at the first performance
 * of it.
 */
function publishProblems(saved: GenetStream, tunes: ReadonlyMap<number, GenetTune>): StreamPublishProblem[] {
  const { stream, performances } = saved;
  const problems: StreamPublishProblem[] = [];

  // The 11-character length is YouTube's own; a TikTok id is 19 digits, and
  // a scene points at the same id as its stream, so the scenes follow the
  // stream's platform.
  const isYoutube = stream.platform === 'youtube';

  if (stream.title === '')
    problems.push({ field: 'title', performanceIndex: null, message: 'タイトルを書いてください。' });

  if (isYoutube && stream.video_id.length !== VIDEO_ID_LENGTH) {
    problems.push({
      field: 'videoId',
      performanceIndex: null,
      message: `動画 ID は ${VIDEO_ID_LENGTH} 文字です。いまは ${stream.video_id.length} 文字です。`,
    });
  }

  if (performances.length === 0) {
    problems.push({ field: 'performances', performanceIndex: null, message: '曲を 1 曲以上足してください。' });
  }

  const told = new Set<number>();

  performances.forEach((p, index) => {
    p.scenes.forEach((s, sceneIndex) => {
      if (isYoutube && s.video_id.length !== VIDEO_ID_LENGTH) {
        problems.push({
          field: 'performances',
          performanceIndex: index,
          message: `${index + 1} 曲目の場面 ${sceneIndex + 1} の動画 ID は ${VIDEO_ID_LENGTH} 文字です。いまは ${s.video_id.length} 文字です。`,
        });
      }
    });

    const tune = tunes.get(p.tune_id);

    if (tune === undefined || told.has(p.tune_id)) return;

    told.add(p.tune_id);

    for (const { sentence } of attributeProblems(tune)) {
      problems.push({ field: 'performances', performanceIndex: index, message: `${index + 1} 曲目の${sentence}` });
    }
  });

  return problems;
}

/** Every way `tune` falls short of publishing, for the save of a tune a published stream performs. */
export function tunePublishProblems(tune: GenetTune): TunePublishProblem[] {
  return attributeProblems(tune).map(({ attributeIndex, sentence }) => ({
    field: 'attributes',
    attributeIndex,
    message: sentence,
  }));
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

/** The `last_revision_id` of the newest `publication` row for `target`, or 0 when there has never been one. */
async function lastPublishedRevisionId(env: Env, target: string): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT last_revision_id FROM publication WHERE target = ?1 ORDER BY publication_id DESC LIMIT 1`,
  )
    .bind(target)
    .first<{ last_revision_id: number }>();

  return row?.last_revision_id ?? 0;
}

const GENET_ENTITIES = ['genet_stream', 'genet_tune', 'genet_person'] as const satisfies readonly RevisionEntity[];

/**
 * The streams, tunes and people `genet/music.json` holds, from `latest` - the
 * latest revisions of all three - with `logged` applied over them: every
 * stream whose latest revision is a `publish`, every tune those streams'
 * bodies perform, and every person those tunes' bodies name. Built from the
 * revision bodies, not from a fresh read of `genet_performance` or
 * `genet_tune_attribute_person`, so a tune or person dropped from a stream
 * after it was published cannot leak back in from a table this JSON is not
 * built from. Sorted as the JSON has them.
 */
function musicData(latest: readonly LatestRevisionRow[], logged: readonly LoggedRevision[]) {
  const streams = liveBodiesOf(latest, 'genet_stream', logged) as unknown as PublicStream[];
  const tunesById = new Map(
    (liveBodiesOf(latest, 'genet_tune', logged) as unknown as PublicTune[]).map((t) => [t.tune_id, t]),
  );
  const peopleById = new Map(
    (liveBodiesOf(latest, 'genet_person', logged) as unknown as PublicPerson[]).map((p) => [p.person_id, p]),
  );

  const tuneIds = new Set(streams.flatMap((s) => s.performances.map((p) => p.tune_id)));
  const tunes = [...tuneIds].flatMap((tuneId) => tunesById.get(tuneId) ?? []);
  const personIds = new Set(tunes.flatMap((t) => t.attributes.flatMap((a) => a.people.map((p) => p.person_id))));
  const people = [...personIds].flatMap((personId) => peopleById.get(personId) ?? []);

  streams.sort((a, b) => (a.published_at === b.published_at ? 0 : a.published_at < b.published_at ? 1 : -1));
  tunes.sort((a, b) => a.tune_id - b.tune_id);
  people.sort((a, b) => a.person_id - b.person_id);

  return { streams, tunes, people };
}

/** `genet/music.json`'s text for `data`, with the channel the page draws beside its title. */
async function musicJson(env: Env, now: Date, data: ReturnType<typeof musicData>): Promise<string> {
  return JSON.stringify({
    published_at: formatTimestamp(now),
    shape_version: GENET_MUSIC_SHAPE_VERSION,
    channel_id: await majorityChannelId(env, data.streams),
    streams: data.streams,
    tunes: data.tunes,
    people: data.people,
  });
}

/**
 * What publishing.ts needs to know about ジェネット楽曲一覧, for a change whose
 * own row is of `entity`. A stream's 「公開」 and 「保存」 change a stream, and
 * a tune's 保存 a tune (#284's 6-5); both write the one `genet/music.json`,
 * built from all three entities' revisions.
 */
function genetTarget(entity: 'genet_stream' | 'genet_tune', table: string, keyColumn: string): PublishTarget {
  const target: PublishTarget = {
    entity,
    alsoBuiltFrom: GENET_ENTITIES.filter((e) => e !== entity),
    target: 'genet_music',
    objectKey: GENET_MUSIC_OBJECT_KEY,
    table,
    keyColumn,
    async buildJson(env, now, latest, change) {
      return await musicJson(env, now, musicData(latest, change === null ? [] : loggedRevisions(target, change)));
    },
  };

  return target;
}

export const GENET_STREAM_TARGET = genetTarget('genet_stream', 'genet_stream', 'video_id');
export const GENET_TUNE_TARGET = genetTarget('genet_tune', 'genet_tune', 'tune_id');

/** Whether `body`, a revision's, says something other than `shape`, the row's public shape now. */
function differs(body: string | null, shape: Record<string, unknown>): boolean {
  return body === null || JSON.stringify(JSON.parse(body)) !== JSON.stringify(shape);
}

/** The latest revisions of every tune and person, as `changedAlongside` compares them. */
interface AlongsideRevisions {
  tunes: readonly LatestRevisionRow[];
  people: readonly LatestRevisionRow[];
}

/**
 * The latest revisions of every tune and person - read before the tunes and
 * people themselves are, so that a tune saved in between is newer than what
 * `changedAlongside` was told, and its `whileLatest` keeps the stale body out.
 */
async function readAlongsideRevisions(env: Env): Promise<AlongsideRevisions> {
  const [tunes, people] = await Promise.all([latestRevisions(env, 'genet_tune'), latestRevisions(env, 'genet_person')]);

  return { tunes, people };
}

/**
 * The `publish` revisions of `tunes` and `people` whose public shape is not
 * what their latest revision in `revisions` already says - what a stream's
 * publish, or a tune's, brings along, so that the JSON has them as they are
 * now. Each is logged only while that revision is still the latest
 * (publishing.ts's `whileLatest`).
 */
function changedAlongside(
  revisions: AlongsideRevisions,
  tunes: readonly GenetTune[],
  people: readonly PersonRow[],
): LoggedRevision[] {
  const tuneRevision = new Map(revisions.tunes.map((r) => [r.entity_key, r]));
  const personRevision = new Map(revisions.people.map((r) => [r.entity_key, r]));

  return [
    ...tunes.flatMap((tune) => {
      const shape = tunePublicShapeOf(tune);
      const key = String(tune.tune.tune_id);
      const latest = tuneRevision.get(key);

      return differs(latest?.body ?? null, shape)
        ? [
            {
              entity: 'genet_tune' as const,
              key,
              action: 'publish' as const,
              body: shape,
              whileLatest: latest?.revision_id ?? 0,
            },
          ]
        : [];
    }),
    ...people.flatMap((person) => {
      const shape = personPublicShapeOf(person);
      const key = String(person.person_id);
      const latest = personRevision.get(key);

      return differs(latest?.body ?? null, shape)
        ? [
            {
              entity: 'genet_person' as const,
              key,
              action: 'publish' as const,
              body: shape,
              whileLatest: latest?.revision_id ?? 0,
            },
          ]
        : [];
    }),
  ];
}

/**
 * The 400 a refused publish answers: every problem, and whether the fields
 * sent were saved anyway. `errors` carries the messages alone, the shape
 * every other refusal under /admin/api has.
 */
function refusalResponse(problems: readonly { message: string }[], saved: boolean): Response {
  return jsonResponse({ errors: problems.map((p) => p.message), problems, saved }, { status: 400 });
}

/**
 * The answer when the fields were saved but the public JSON could not be
 * written, or could not be brought up to date after the change was recorded
 * (publishing.ts): 502, since what failed is R2 behind this worker, with
 * `saved: true` and the stream as it now stands, so the screen can tell it
 * apart from a request that changed nothing, and say what to press next by
 * the status the stream has now.
 */
async function notWrittenResponse(env: Env, videoId: string, outcome: Extract<PublishOutcome, { written: false }>) {
  // Deleted, published, withdrawn or saved elsewhere before the batch ran,
  // which then logged no revision for it, and the JSON already written with
  // the change could not be built again without it.
  if (outcome.recorded && outcome.revisionId === null) {
    return jsonResponse(
      {
        error: NOT_WRITTEN_TEXT,
        detail: `stream ${videoId} changed while this request was saving it, and ${GENET_MUSIC_OBJECT_KEY} could not be built again without the change: ${outcome.error}`,
        saved: false,
      },
      { status: 502 },
    );
  }

  const saved = await readStream(env, videoId);

  return jsonResponse(
    {
      error: NOT_WRITTEN_TEXT,
      detail: `saved, but ${GENET_MUSIC_OBJECT_KEY} could not be written: ${outcome.error}`,
      saved: true,
      stream: saved === null ? null : presentStream(saved),
    },
    { status: 502 },
  );
}

/**
 * The 200 once a change reached the public JSON: the stream as it now
 * stands, and what was recorded for it. When no revision was logged for it,
 * `notLoggedResponse`'s 404 or 409: the JSON was built again without the
 * change.
 */
async function writtenResponse(env: Env, videoId: string, outcome: Extract<PublishOutcome, { written: true }>) {
  if (outcome.revisionId === null) return await notLoggedResponse(env, videoId);

  const saved = await readStream(env, videoId);

  return jsonResponse({
    stream: saved === null ? null : presentStream(saved),
    revisionId: outcome.revisionId,
    publicationId: outcome.publicationId,
    tuneRevisionCount: outcome.loggedAlongside.filter((r) => r.entity === 'genet_tune').length,
    personRevisionCount: outcome.loggedAlongside.filter((r) => r.entity === 'genet_person').length,
  });
}

/**
 * The answer when the batch logged no revision for the stream: 404 when it
 * was deleted, 409 when it was still there but no longer as the request read
 * it - published, withdrawn or saved elsewhere.
 */
async function notLoggedResponse(env: Env, videoId: string): Promise<Response> {
  if ((await readStream(env, videoId)) === null) return noStreamResponse(videoId);

  return changedMeanwhileResponse(videoId);
}

/** The answer when the stream changed under a request that read it: published, withdrawn or saved elsewhere. */
function changedMeanwhileResponse(videoId: string): Response {
  return changedElsewhereResponse(`stream ${videoId} changed while this request was saving it`);
}

/**
 * `RevisionChange.whileRow` for a batch whose row statements write only
 * while no revision was recorded since `revisionBefore`, and at the version
 * `held` names - subscriber-milestones-publish.ts's `leftAs` for a stream. The tunes and
 * people a publish brings along are logged before the stream's own revision
 * (publishing.ts), so this answers the same for each of them.
 */
function leftAs(status: StreamStatus, revisionBefore: number, held: HeldToVersion): string {
  // Written into the SQL, so never anything but an integer from D1.
  if (!Number.isSafeInteger(revisionBefore)) throw new Error(`not a revision id: ${revisionBefore}`);

  return `status = '${status}'
          AND (SELECT COALESCE(MAX(revision_id), 0) FROM revision
                WHERE entity = 'genet_stream' AND entity_key = genet_stream.video_id) = ${revisionBefore}${writtenAt(held)}`;
}

/**
 * Saves `fields` over `existing` and puts the result in the public JSON, or
 * refuses - 「公開」 on a draft and 「保存」 on a published stream both come
 * here, as on あしあと (footprints-publish.ts's `saveAndPublish`):
 *
 * - A refused draft's fields are saved anyway, and it stays a draft
 * - A refused published stream is left exactly as it was (#277's decision 1d)
 *
 * The tunes and people the stream performs get a `publish` revision of their
 * own in the same batch, each one whose public shape is not what its latest
 * revision says (`changedAlongside`).
 *
 * When the JSON cannot be written, the fields are saved and nothing else
 * changes, and 502 says so. When it was written but could not be brought up
 * to date after the revisions were recorded, the stream is published all
 * the same, and 502 says that too.
 *
 * The stream is written only while it is still as it was read, at the
 * version `held` names too (#307), as subscriber-milestones-publish.ts's
 * `saveAndPublish` writes a milestone, its performances and scenes with it
 * - and 409 says when it was not. So is a publish that finds a tune it
 * performs saved since it read the tune (#303): the JSON written before the
 * batch has the tune as it was read, and a save that logged no revision
 * would be left out of it. A person saved since its latest revision was
 * read keeps its newer revision (publishing.ts's `whileLatest`), and the
 * JSON is built with that.
 */
async function saveAndPublish(
  env: Env,
  existing: GenetStream,
  revisionBefore: number,
  held: HeldToVersion,
  fields: StreamFields,
  now: Date,
): Promise<Response> {
  const videoId = existing.stream.video_id;
  const wasPublished = existing.stream.status === 'published';
  const next = streamWithFields(existing, fields, 'published');
  const revisions = await readAlongsideRevisions(env);
  const tunes = await readTunes(env, tuneIdsOf(next));
  const problems = publishProblems(next, tunes);

  if (problems.length > 0) {
    if (wasPublished) return refusalResponse(problems, false);

    // Saved only while it is still the draft it was read as: one published
    // in between is not written over with no revision, and 409 says so - or
    // 404, for one deleted in between.
    if (!savedRow(await env.DB.batch(streamSaveStatements(env, videoId, fields, { whileStatus: 'draft', ...held })))) {
      return await notLoggedResponse(env, videoId);
    }

    return refusalResponse(problems, true);
  }

  const people = await readPeople(env, personIdsOf(tunes.values()));
  const alongside = changedAlongside(revisions, [...tunes.values()], [...people.values()]);

  const outcome = await publishChange(
    env,
    GENET_STREAM_TARGET,
    {
      key: videoId,
      action: 'publish',
      body: streamPublicShapeOf(next),
      alongside,
      whileRow: leftAs('published', revisionBefore, held),
    },
    streamSaveStatements(env, videoId, fields, {
      status: 'published',
      whileStatus: wasPublished ? 'published' : 'draft',
      whileRevision: revisionBefore,
      ...held,
      whileTunes: new Map([...tunes.values()].map((t) => [t.tune.tune_id, t.tune.edit_version])),
    }),
    now,
  );

  if (!outcome.written) {
    if (!outcome.recorded) {
      const fallback = await env.DB.batch(
        streamSaveStatements(env, videoId, fields, {
          whileStatus: wasPublished ? 'published' : 'draft',
          whileRevision: revisionBefore,
          ...held,
          unlogged: wasPublished,
        }),
      );

      if (!savedRow(fallback)) return await notLoggedResponse(env, videoId);
    }

    return await notWrittenResponse(env, videoId, outcome);
  }

  return await writtenResponse(env, videoId, outcome);
}

/**
 * POST /admin/api/genet/streams/:videoId/publish - 「公開」. The body is the
 * stream's fields, the same as a PUT's: what is typed is saved, checked and
 * published in this one request (#284). A stream already published is saved
 * as `saveStream` saves one.
 */
export async function publishStream(
  env: Env,
  videoId: string,
  body: Record<string, unknown>,
  now: Date,
): Promise<Response> {
  const revisionBefore = await newestStreamRevisionOf(env, videoId);
  const existing = await readStream(env, videoId);

  if (existing === null) return noStreamResponse(videoId);

  const held = heldToVersion(body, existing.stream.edit_version, `stream ${videoId}`);

  if ('error' in held) return held.error;

  const fields = await validatedStreamFields(env, body);

  if ('error' in fields) return fields.error;

  return await saveAndPublish(env, existing, revisionBefore, held, fields, now);
}

/**
 * PUT /admin/api/genet/streams/:videoId - 「保存」. A draft is saved as a
 * draft (genet-streams.ts's `updateStream`). A published stream's save
 * reaches the public JSON at once, and is refused, leaving the stream and
 * the JSON as they were, when the fields would not pass publishing.
 */
export async function saveStream(
  env: Env,
  videoId: string,
  body: Record<string, unknown>,
  now: Date,
): Promise<Response> {
  const revisionBefore = await newestStreamRevisionOf(env, videoId);
  const existing = await readStream(env, videoId);

  if (existing === null) return noStreamResponse(videoId);

  if (existing.stream.status !== 'published') return await updateStream(env, videoId, body);

  const held = heldToVersion(body, existing.stream.edit_version, `stream ${videoId}`);

  if ('error' in held) return held.error;

  const fields = await validatedStreamFields(env, body);

  if ('error' in fields) return fields.error;

  return await saveAndPublish(env, existing, revisionBefore, held, fields, now);
}

/**
 * POST /admin/api/genet/streams/:videoId/withdraw - 「非公開に戻す」. The body
 * is the stream's fields, the same as a PUT's: what is typed is kept, as the
 * draft the stream becomes. Takes the stream off `genet/music.json`, then
 * saves the fields as a draft and logs a `withdraw` revision for the stream
 * alone - the tunes and people it performs keep the revisions they have, and
 * leave the JSON with it unless another published stream performs them.
 *
 * Nothing at all changes when the JSON cannot be written, and 502 says so.
 * When it was written but could not be brought up to date after the revision
 * was recorded, the stream is a draft all the same, and 502 says so with
 * `saved: true`. 409 for a stream that is not published - when it was read,
 * or by the time the batch runs: one withdrawn or saved again in between is
 * not written over, and no second `withdraw` revision is recorded.
 */
export async function withdrawStream(
  env: Env,
  videoId: string,
  body: Record<string, unknown>,
  now: Date,
): Promise<Response> {
  const revisionBefore = await newestStreamRevisionOf(env, videoId);
  const saved = await readStream(env, videoId);

  if (saved === null) return noStreamResponse(videoId);

  const held = heldToVersion(body, saved.stream.edit_version, `stream ${videoId}`);

  if ('error' in held) return held.error;

  if (saved.stream.status !== 'published') return changedElsewhereResponse('only a published stream can be withdrawn');

  const fields = await validatedStreamFields(env, body);

  if ('error' in fields) return fields.error;

  const outcome = await publishChange(
    env,
    GENET_STREAM_TARGET,
    { key: videoId, action: 'withdraw', body: null, whileRow: leftAs('draft', revisionBefore, held) },
    streamSaveStatements(env, videoId, fields, {
      status: 'draft',
      whileStatus: 'published',
      whileRevision: revisionBefore,
      ...held,
    }),
    now,
  );

  if (!outcome.written) {
    if (outcome.recorded) return await notWrittenResponse(env, videoId, outcome);

    return refuse(502, refusal(NOT_WRITTEN_TEXT, `${GENET_MUSIC_OBJECT_KEY} could not be written: ${outcome.error}`));
  }

  return await writtenResponse(env, videoId, outcome);
}

/**
 * PUT /admin/api/genet/tunes/:tuneId - この曲を保存 (#284's 6-5). A tune no
 * published stream performs is saved, and nothing else. One a published
 * stream performs is in the public JSON, so its save reaches the JSON at
 * once, with a `publish` revision for the tune and for each person it names
 * whose public shape changed - or is refused, nothing saved, when the tune
 * would not pass publishing, as a published stream's save is.
 *
 * `live` in the answer says which of the two it was. When the JSON cannot be
 * written, the fields are saved, the tune keeps its last revision, and 502
 * says so with `saved: true`; when it was written but could not be brought
 * up to date, the revisions are recorded all the same, and 502 says that too.
 *
 * Written only at the version the screen read the tune at, and 409 when it
 * was saved since (#303), as a stream's save is. A tune no published stream
 * performed when it was read is written only while that is still so: one
 * published in between has put the tune in the JSON as it was, so the save
 * goes on to reach the JSON as a live tune's does.
 */
export async function saveTune(env: Env, tuneId: number, body: Record<string, unknown>, now: Date): Promise<Response> {
  let revisionBefore = await newestTuneRevisionOf(env, tuneId);
  const existing = await readTune(env, tuneId);

  if (existing === null) return noTuneResponse(tuneId);

  const held = heldToVersion(body, existing.tune.edit_version, `tune ${tuneId}`);

  if ('error' in held) return held.error;

  const fields = await validatedTuneFields(env, body);

  if ('error' in fields) return fields.error;

  if (!(await isPerformedLive(env, tuneId))) {
    // Written only while no published stream performs it yet (#303): one
    // published in between put the tune in the JSON as it was read, and the
    // save goes on below to reach the JSON too.
    const results = await env.DB.batch(
      tuneSaveStatements(env, tuneId, fields, { ...held, whileUnperformed: true, unlogged: true }),
    );

    if (savedTuneRow(results)) return await tuneResponse(env, tuneId, false, {});

    // Read before the row, as above: the publish in between logged the tune.
    revisionBefore = await newestTuneRevisionOf(env, tuneId);

    const after = await readTune(env, tuneId);

    if (after === null) return noTuneResponse(tuneId);
    if (after.tune.edit_version !== held.whileVersion) return tuneSavedElsewhereResponse(tuneId);
  }

  const next = tuneWithFields(existing, fields);
  const problems = tunePublishProblems(next);

  if (problems.length > 0) return refusalResponse(problems, false);

  const revisions = await readAlongsideRevisions(env);
  const people = await readPeople(env, personIdsOf([next]));
  const alongside = changedAlongside(revisions, [], [...people.values()]);

  const outcome = await publishChange(
    env,
    GENET_TUNE_TARGET,
    {
      key: String(tuneId),
      action: 'publish',
      body: tunePublicShapeOf(next),
      alongside,
      whileRow: tuneLeftAs(revisionBefore, held),
    },
    tuneSaveStatements(env, tuneId, fields, { whileRevision: revisionBefore, ...held }),
    now,
  );

  if (!outcome.written) {
    if (!outcome.recorded) {
      const fallback = await env.DB.batch(
        tuneSaveStatements(env, tuneId, fields, { whileRevision: revisionBefore, ...held, unlogged: true }),
      );

      if (!savedTuneRow(fallback)) return await tuneNotLoggedResponse(env, tuneId);
    } else if (outcome.revisionId === null) {
      return jsonResponse(
        {
          error: NOT_WRITTEN_TEXT,
          detail: `tune ${tuneId} changed while this request was saving it, and ${GENET_MUSIC_OBJECT_KEY} could not be built again without the change: ${outcome.error}`,
          saved: false,
        },
        { status: 502 },
      );
    }

    return await tuneResponse(
      env,
      tuneId,
      true,
      {
        error: NOT_WRITTEN_TEXT,
        detail: `saved, but ${GENET_MUSIC_OBJECT_KEY} could not be written: ${outcome.error}`,
        saved: true,
      },
      502,
    );
  }

  if (outcome.revisionId === null) return await tuneNotLoggedResponse(env, tuneId);

  return await tuneResponse(env, tuneId, true, {
    revisionId: outcome.revisionId,
    publicationId: outcome.publicationId,
  });
}

/**
 * `RevisionChange.whileRow` for a tune's save whose row statements write
 * only while no revision of the tune was recorded since `revisionBefore`,
 * and at the version `held` names - `leftAs` for a tune, which has no status.
 */
function tuneLeftAs(revisionBefore: number, held: HeldToVersion): string {
  // Written into the SQL, so never anything but an integer from D1.
  if (!Number.isSafeInteger(revisionBefore)) throw new Error(`not a revision id: ${revisionBefore}`);

  return `${NEWEST_TUNE_REVISION} = ${revisionBefore}${writtenAt(held)}`;
}

/** The answer when a tune's save wrote nothing: 404 when it was deleted, 409 when another screen saved it first. */
async function tuneNotLoggedResponse(env: Env, tuneId: number): Promise<Response> {
  if ((await readTune(env, tuneId)) === null) return noTuneResponse(tuneId);

  return tuneSavedElsewhereResponse(tuneId);
}

/** The tune as it now stands, whether a published stream performs it, and `extra`. 404 when it is gone. */
async function tuneResponse(
  env: Env,
  tuneId: number,
  live: boolean,
  extra: Record<string, unknown>,
  status = 200,
): Promise<Response> {
  const saved = await readTune(env, tuneId);

  if (saved === null) return noTuneResponse(tuneId);

  return jsonResponse({ tune: presentTune(saved), live, ...extra }, { status });
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
 * Since #284 every publish writes the JSON, so nothing waits once the rows
 * from before it have been published again; and a published stream changes
 * only together with its revision, unless the JSON could not be written.
 *
 * `shapeOutdated`: the stored JSON is in an older shape than this code builds
 * (`shapeIsOutdated`), so "いま公開する" would build it again even when
 * nothing above is waiting. `behind`: a write of the JSON was sent that no
 * check found up to date since (publishing.ts's `isBehind`).
 */
export async function pendingGenetMusic(env: Env): Promise<Response> {
  const { pending, shapeOutdated, behind, streamRevisions, tuneRevisions, personRevisions } = await readWaiting(env);

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

  return jsonResponse({ pending, changed, shapeOutdated, behind });
}

export interface WaitingGenetEntry {
  entity: 'genet_stream' | 'genet_tune' | 'genet_person';
  key: string;
  revisionId: number;
  latestAction: string;
}

/**
 * What "いま公開する" for `genet_music` would act on: every entity whose
 * latest revision is newer than the last run, whether the stored JSON is in
 * an older shape, and whether it may be behind. `pendingGenetMusic`,
 * `publishGenetMusicNow` and the sidebar's mark (drafts.ts) all
 * read it here, so they cannot count differently.
 */
export async function waitingGenetMusic(
  env: Env,
): Promise<{ pending: WaitingGenetEntry[]; shapeOutdated: boolean; behind: boolean }> {
  const { pending, shapeOutdated, behind } = await readWaiting(env);

  return { pending, shapeOutdated, behind };
}

/** `waitingGenetMusic`, with the latest revisions it was worked out from left in for `pendingGenetMusic` to compare against. */
async function readWaiting(env: Env) {
  const [lastRevisionId, streamRevisions, tuneRevisions, personRevisions, behind] = await Promise.all([
    lastPublishedRevisionId(env, 'genet_music'),
    latestRevisions(env, 'genet_stream'),
    latestRevisions(env, 'genet_tune'),
    latestRevisions(env, 'genet_person'),
    isBehind(env, 'genet_music'),
  ]);

  const pending: WaitingGenetEntry[] = [
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

  const newestRevisionId = newestRevisionIdOf(streamRevisions, tuneRevisions, personRevisions);
  // Read from R2 only when nothing else already asks for a build: a failed
  // read must not stop one that would go ahead without it.
  const shapeOutdated = pending.length === 0 && !behind && (await shapeIsOutdated(env, newestRevisionId));

  return {
    pending,
    nothingNewer: newestRevisionId <= lastRevisionId,
    shapeOutdated,
    behind,
    streamRevisions,
    tuneRevisions,
    personRevisions,
  };
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
 * The shape of the JSON `musicJson` writes. Raise it whenever that
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
 * from the latest revisions of all three entities alone (`musicData`),
 * writes it to `PUBLIC_DATA`, and appends one `publication` row. Nothing is
 * written, and 200 answers `{ published: false }`, when there is nothing
 * newer than the last run, the stored JSON is in the current shape
 * (`GENET_MUSIC_SHAPE_VERSION`), and the JSON is not counted as behind
 * (publishing.ts's `isBehind`).
 *
 * Pressed from the ジェネット楽曲一覧 list while the JSON needs it (#285): a
 * stream left waiting from before #284, a JSON in an older shape or one that
 * may be behind. The next publish of any stream or live tune builds from the
 * same revisions too.
 *
 * The three entities share one `publication` row and one `last_revision_id`:
 * "newer than last time" is asked once, across whichever of the three
 * changed, the same way #141's design describes one `target` per public JSON
 * file rather than one per table.
 *
 * Written through publishing.ts's `republish`, which checks the JSON again
 * after writing it as a publish does. 502 when the JSON could not be
 * brought up to date, with no `publication` row recorded for it.
 */
export async function publishGenetMusicNow(env: Env, now: Date): Promise<Response> {
  const { nothingNewer, shapeOutdated, behind } = await readWaiting(env);

  if (nothingNewer && !shapeOutdated && !behind) return jsonResponse({ published: false });

  const outcome = await republish(env, GENET_STREAM_TARGET, now);

  if (!outcome.current) {
    return refuse(
      502,
      refusal(NOT_WRITTEN_TEXT, `${GENET_MUSIC_OBJECT_KEY} could not be brought up to date: ${outcome.error}`),
    );
  }

  const data = musicData(outcome.latest, []);

  return jsonResponse({
    published: true,
    publicationId: outcome.publicationId,
    streamCount: data.streams.length,
    tuneCount: data.tunes.length,
    personCount: data.people.length,
    byteLength: outcome.byteLength,
  });
}
