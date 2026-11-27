import { queryInChunks } from '../lib/d1';
import type { Env } from '../lib/env';
import { jsonResponse } from '../lib/json';
import { malformed, refusal, refuse, type Refusal } from '../lib/refusal';

/**
 * Reading, saving and deleting `genet_tune` (#141, #139): one tune's own
 * material - title, credits, reference videos and sheet music - shared
 * across every `genet_stream` that performs it. Like `genet_person`,
 * `genet_tune` has no `status` of its own. A save here logs no `revision`:
 * publishing a stream that performs it does, in genet-publish.ts, and so
 * does saving a tune a published stream performs, which goes there too.
 *
 * A save replaces every attribute, video and score row wholesale, the same
 * full-replace shape footprints.ts gives `footprints_event`'s members and
 * sources - there is no partial edit of "just one attribute".
 */

export interface TuneRow {
  tune_id: number;
  title: string;
  original_title: string | null;
  subtunes: string;
  memo: string | null;
}

export interface AttributePersonRow {
  person_id: number;
  credited_as: string | null;
  note: string | null;
}

export interface Attribute {
  name: string | null;
  text: string | null;
  people: AttributePersonRow[];
}

export interface VideoRow {
  video_id: string;
  title: string;
  start_seconds: number | null;
  description: string | null;
}

export interface ScoreRow {
  url: string;
  title: string;
}

export interface GenetTune {
  tune: TuneRow;
  attributes: Attribute[];
  videos: VideoRow[];
  scores: ScoreRow[];
}

export function present(saved: GenetTune) {
  const { tune } = saved;

  return {
    tuneId: tune.tune_id,
    title: tune.title,
    originalTitle: tune.original_title,
    subtunes: JSON.parse(tune.subtunes) as string[],
    attributes: saved.attributes.map((a) => ({
      name: a.name,
      text: a.text,
      people: a.people.map((p) => ({ personId: p.person_id, creditedAs: p.credited_as, note: p.note })),
    })),
    videos: saved.videos.map((v) => ({
      videoId: v.video_id,
      title: v.title,
      startSeconds: v.start_seconds,
      description: v.description,
    })),
    scores: saved.scores.map((s) => ({ url: s.url, title: s.title })),
    memo: tune.memo,
  };
}

/**
 * The shape #141's design gives one element of the public JSON's `tunes`
 * array, built from a saved tune - genet-publish.ts uses this both for a
 * `publish` revision's `body` and for comparing a working tune against its
 * last published version. `memo` is left out, the same as `publicShapeOf` in
 * footprints.ts leaves it out for the same reason: it is not part of the
 * public shape.
 */
export function publicShapeOf(saved: GenetTune) {
  const { tune } = saved;

  return {
    tune_id: tune.tune_id,
    title: tune.title,
    original_title: tune.original_title,
    subtunes: JSON.parse(tune.subtunes) as string[],
    attributes: saved.attributes.map((a) => ({
      name: a.name,
      text: a.text,
      people: a.people.map((p) => ({ person_id: p.person_id, credited_as: p.credited_as, note: p.note })),
    })),
    videos: saved.videos.map((v) => ({
      video_id: v.video_id,
      title: v.title,
      start_seconds: v.start_seconds,
      description: v.description,
    })),
    scores: saved.scores.map((s) => ({ url: s.url, title: s.title })),
  };
}

interface RawAttributeRow {
  position: number;
  name: string | null;
  text: string | null;
}

interface RawAttributePersonRow {
  attribute_position: number;
  person_id: number;
  credited_as: string | null;
  note: string | null;
}

/** `genet_tune`, its attributes (with the people each names), its videos and its scores, all in display order. */
export async function readTune(env: Env, tuneId: number): Promise<GenetTune | null> {
  const tune = await env.DB.prepare(
    'SELECT tune_id, title, original_title, subtunes, memo FROM genet_tune WHERE tune_id = ?1',
  )
    .bind(tuneId)
    .first<TuneRow>();

  if (tune === null) return null;

  const [attrRows, personRows, videoRows, scoreRows] = await Promise.all([
    env.DB.prepare('SELECT position, name, text FROM genet_tune_attribute WHERE tune_id = ?1 ORDER BY position')
      .bind(tuneId)
      .all<RawAttributeRow>(),
    env.DB.prepare(
      `SELECT attribute_position, person_id, credited_as, note
         FROM genet_tune_attribute_person WHERE tune_id = ?1 ORDER BY attribute_position, position`,
    )
      .bind(tuneId)
      .all<RawAttributePersonRow>(),
    env.DB.prepare(
      'SELECT video_id, title, start_seconds, description FROM genet_tune_video WHERE tune_id = ?1 ORDER BY position',
    )
      .bind(tuneId)
      .all<VideoRow>(),
    env.DB.prepare('SELECT url, title FROM genet_tune_score WHERE tune_id = ?1 ORDER BY position')
      .bind(tuneId)
      .all<ScoreRow>(),
  ]);

  const peopleByPosition = new Map<number, AttributePersonRow[]>();

  for (const { attribute_position: position, ...person } of personRows.results) {
    if (!peopleByPosition.has(position)) peopleByPosition.set(position, []);
    peopleByPosition.get(position)!.push(person);
  }

  return {
    tune,
    attributes: attrRows.results.map((row) => ({
      name: row.name,
      text: row.text,
      people: peopleByPosition.get(row.position) ?? [],
    })),
    videos: videoRows.results,
    scores: scoreRows.results,
  };
}

/** `readTune` for several tune ids at once - genet-streams.ts (a stream's own tunes) and genet-publish.ts (every referenced tune) both want this rather than one call per id. */
export async function readTunes(env: Env, tuneIds: readonly number[]): Promise<Map<number, GenetTune>> {
  const ids = [...new Set(tuneIds)];

  if (ids.length === 0) return new Map();

  const [tuneRows, attrRows, personRows, videoRows, scoreRows] = await Promise.all([
    queryInChunks(ids, async (chunk) => {
      const placeholders = chunk.map((_, index) => `?${index + 1}`).join(', ');
      const { results } = await env.DB.prepare(
        `SELECT tune_id, title, original_title, subtunes, memo FROM genet_tune WHERE tune_id IN (${placeholders})`,
      )
        .bind(...chunk)
        .all<TuneRow>();

      return results;
    }),
    queryInChunks(ids, async (chunk) => {
      const placeholders = chunk.map((_, index) => `?${index + 1}`).join(', ');
      const { results } = await env.DB.prepare(
        `SELECT tune_id, position, name, text FROM genet_tune_attribute WHERE tune_id IN (${placeholders}) ORDER BY tune_id, position`,
      )
        .bind(...chunk)
        .all<RawAttributeRow & { tune_id: number }>();

      return results;
    }),
    queryInChunks(ids, async (chunk) => {
      const placeholders = chunk.map((_, index) => `?${index + 1}`).join(', ');
      const { results } = await env.DB.prepare(
        `SELECT tune_id, attribute_position, person_id, credited_as, note
           FROM genet_tune_attribute_person WHERE tune_id IN (${placeholders}) ORDER BY tune_id, attribute_position, position`,
      )
        .bind(...chunk)
        .all<RawAttributePersonRow & { tune_id: number }>();

      return results;
    }),
    queryInChunks(ids, async (chunk) => {
      const placeholders = chunk.map((_, index) => `?${index + 1}`).join(', ');
      const { results } = await env.DB.prepare(
        `SELECT tune_id, video_id, title, start_seconds, description FROM genet_tune_video WHERE tune_id IN (${placeholders}) ORDER BY tune_id, position`,
      )
        .bind(...chunk)
        .all<VideoRow & { tune_id: number }>();

      return results;
    }),
    queryInChunks(ids, async (chunk) => {
      const placeholders = chunk.map((_, index) => `?${index + 1}`).join(', ');
      const { results } = await env.DB.prepare(
        `SELECT tune_id, url, title FROM genet_tune_score WHERE tune_id IN (${placeholders}) ORDER BY tune_id, position`,
      )
        .bind(...chunk)
        .all<ScoreRow & { tune_id: number }>();

      return results;
    }),
  ]);

  const peopleByTuneAndPosition = new Map<number, Map<number, AttributePersonRow[]>>();

  for (const { tune_id: tuneId, attribute_position: position, ...person } of personRows) {
    if (!peopleByTuneAndPosition.has(tuneId)) peopleByTuneAndPosition.set(tuneId, new Map());

    const byPosition = peopleByTuneAndPosition.get(tuneId)!;

    if (!byPosition.has(position)) byPosition.set(position, []);
    byPosition.get(position)!.push(person);
  }

  const attrsByTune = new Map<number, RawAttributeRow[]>();

  for (const { tune_id: tuneId, ...attr } of attrRows) {
    if (!attrsByTune.has(tuneId)) attrsByTune.set(tuneId, []);
    attrsByTune.get(tuneId)!.push(attr);
  }

  const videosByTune = new Map<number, VideoRow[]>();

  for (const { tune_id: tuneId, ...video } of videoRows) {
    if (!videosByTune.has(tuneId)) videosByTune.set(tuneId, []);
    videosByTune.get(tuneId)!.push(video);
  }

  const scoresByTune = new Map<number, ScoreRow[]>();

  for (const { tune_id: tuneId, ...score } of scoreRows) {
    if (!scoresByTune.has(tuneId)) scoresByTune.set(tuneId, []);
    scoresByTune.get(tuneId)!.push(score);
  }

  return new Map(
    tuneRows.map((tune) => [
      tune.tune_id,
      {
        tune,
        attributes: (attrsByTune.get(tune.tune_id) ?? []).map((row) => ({
          name: row.name,
          text: row.text,
          people: peopleByTuneAndPosition.get(tune.tune_id)?.get(row.position) ?? [],
        })),
        videos: videosByTune.get(tune.tune_id) ?? [],
        scores: scoresByTune.get(tune.tune_id) ?? [],
      },
    ]),
  );
}

/** GET /admin/api/genet/tunes - optionally narrowed by a substring of title. */
export async function listTunes(env: Env, q: string | null): Promise<Response> {
  const where = q === null ? '' : `WHERE title LIKE ?1 ESCAPE '\\'`;
  const params = q === null ? [] : [`%${q.replace(/[\\%_]/g, '\\$&')}%`];

  const { results } = await env.DB.prepare(`SELECT tune_id FROM genet_tune ${where} ORDER BY tune_id`)
    .bind(...params)
    .all<{ tune_id: number }>();

  const byId = await readTunes(
    env,
    results.map((row) => row.tune_id),
  );

  return jsonResponse({ tunes: results.map((row) => present(byId.get(row.tune_id)!)) });
}

/**
 * Whether a published stream performs tune `tuneId`: some stream's latest
 * revision is not a `withdraw`, and its body performs it - the streams
 * publishing.ts's `liveBodiesOf` builds the public JSON from. That is what
 * puts a tune in the JSON (genet-publish.ts), so its save has to reach the
 * JSON too (#284's 6-5).
 */
export async function isPerformedLive(env: Env, tuneId: number): Promise<boolean> {
  const row = await env.DB.prepare(
    `SELECT 1
       FROM revision r
       JOIN (SELECT MAX(revision_id) AS revision_id
               FROM revision
              WHERE entity = 'genet_stream'
              GROUP BY entity_key) latest
         ON latest.revision_id = r.revision_id
      WHERE r.action <> 'withdraw'
        AND r.body IS NOT NULL
        AND EXISTS (SELECT 1 FROM json_each(r.body, '$.performances') p
                     WHERE json_extract(p.value, '$.tune_id') = ?1)
      LIMIT 1`,
  )
    .bind(tuneId)
    .first();

  return row !== null;
}

/** The 404 for a tune that is not there - gone, or never was. */
export function noTuneResponse(tuneId: number | string): Response {
  return refuse(404, refusal('この曲が見つかりません', `no tune ${tuneId}`));
}

/**
 * GET /admin/api/genet/tunes/:tuneId. 404 when there is no such tune.
 * `live` says whether a published stream performs it, so that its 保存
 * reaches the public JSON.
 */
export async function getTune(env: Env, tuneId: number): Promise<Response> {
  const saved = await readTune(env, tuneId);

  if (saved === null) return noTuneResponse(tuneId);

  return jsonResponse({ tune: present(saved), live: await isPerformedLive(env, tuneId) });
}

interface AttributeFields {
  name: string | null;
  text: string | null;
  people: { personId: number; creditedAs: string | null; note: string | null }[];
}

interface VideoFields {
  videoId: string;
  title: string;
  startSeconds: number | null;
  description: string | null;
}

interface ScoreFields {
  url: string;
  title: string;
}

export interface TuneFields {
  title: string;
  originalTitle: string | null;
  subtunes: string[];
  attributes: AttributeFields[];
  videos: VideoFields[];
  scores: ScoreFields[];
  memo: string | null;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function readAttributeFields(value: unknown): AttributeFields | { error: Refusal } {
  if (typeof value !== 'object' || value === null) return { error: malformed('each attribute must be an object') };

  const { name, text, people } = value as Record<string, unknown>;

  if (name !== undefined && name !== null && typeof name !== 'string')
    return { error: malformed('attribute name must be a string or null') };
  if (text !== undefined && text !== null && typeof text !== 'string')
    return { error: malformed('attribute text must be a string or null') };

  const peopleValue = people ?? [];

  if (!Array.isArray(peopleValue)) return { error: malformed('attribute people must be an array') };

  const readPeople: AttributeFields['people'] = [];

  for (const p of peopleValue) {
    if (
      typeof p !== 'object' ||
      p === null ||
      typeof (p as Record<string, unknown>).personId !== 'number' ||
      ((p as Record<string, unknown>).creditedAs !== undefined &&
        (p as Record<string, unknown>).creditedAs !== null &&
        typeof (p as Record<string, unknown>).creditedAs !== 'string') ||
      ((p as Record<string, unknown>).note !== undefined &&
        (p as Record<string, unknown>).note !== null &&
        typeof (p as Record<string, unknown>).note !== 'string')
    ) {
      return { error: malformed('each attribute person must be { personId: number, creditedAs?, note? }') };
    }

    const rec = p as Record<string, unknown>;

    readPeople.push({
      personId: rec.personId as number,
      creditedAs: (rec.creditedAs as string | null) ?? null,
      note: (rec.note as string | null) ?? null,
    });
  }

  return {
    name: (name as string | null) ?? null,
    text: (text as string | null) ?? null,
    people: readPeople,
  };
}

function readVideoFields(value: unknown): VideoFields | { error: Refusal } {
  if (typeof value !== 'object' || value === null) return { error: malformed('each video must be an object') };

  const { videoId, title, startSeconds, description } = value as Record<string, unknown>;

  if (typeof videoId !== 'string') return { error: malformed('video videoId must be a string') };
  if (typeof title !== 'string') return { error: malformed('video title must be a string') };
  if (startSeconds !== undefined && startSeconds !== null && typeof startSeconds !== 'number') {
    return { error: malformed('video startSeconds must be a number or null') };
  }
  if (description !== undefined && description !== null && typeof description !== 'string') {
    return { error: malformed('video description must be a string or null') };
  }

  return {
    videoId,
    title,
    startSeconds: (startSeconds as number | null) ?? null,
    description: (description as string | null) ?? null,
  };
}

function readScoreFields(value: unknown): ScoreFields | { error: Refusal } {
  if (typeof value !== 'object' || value === null) return { error: malformed('each score must be an object') };

  const { url, title } = value as Record<string, unknown>;

  if (typeof url !== 'string') return { error: malformed('score url must be a string') };
  if (typeof title !== 'string') return { error: malformed('score title must be a string') };

  return { url, title };
}

/**
 * Reads the fields a POST or PUT body carries, the same full-replace shape
 * `readEventFields` gives `footprints_event`.
 */
function readTuneFields(body: Record<string, unknown>): TuneFields | { error: Refusal } {
  const subtunes = body.subtunes ?? [];

  if (!isStringArray(subtunes)) return { error: malformed('subtunes must be an array of strings') };

  const attributesValue = body.attributes ?? [];

  if (!Array.isArray(attributesValue)) return { error: malformed('attributes must be an array') };

  const attributes: AttributeFields[] = [];

  for (const a of attributesValue) {
    const read = readAttributeFields(a);

    if ('error' in read) return read;

    attributes.push(read);
  }

  const videosValue = body.videos ?? [];

  if (!Array.isArray(videosValue)) return { error: malformed('videos must be an array') };

  const videos: VideoFields[] = [];

  for (const v of videosValue) {
    const read = readVideoFields(v);

    if ('error' in read) return read;

    videos.push(read);
  }

  const scoresValue = body.scores ?? [];

  if (!Array.isArray(scoresValue)) return { error: malformed('scores must be an array') };

  const scores: ScoreFields[] = [];

  for (const s of scoresValue) {
    const read = readScoreFields(s);

    if ('error' in read) return read;

    scores.push(read);
  }

  if (typeof body.title !== 'string') return { error: malformed('title must be a string') };

  if (body.originalTitle !== undefined && body.originalTitle !== null && typeof body.originalTitle !== 'string') {
    return { error: malformed('originalTitle must be a string or null') };
  }

  if (body.memo !== undefined && body.memo !== null && typeof body.memo !== 'string') {
    return { error: malformed('memo must be a string or null') };
  }

  return {
    title: body.title,
    originalTitle: (body.originalTitle as string | null) ?? null,
    subtunes,
    attributes,
    videos,
    scores,
    memo: (body.memo as string | null) ?? null,
  };
}

/**
 * The schema's own CHECKs, mirrored for a 400 with a reason. `text` and
 * `people` both present on the same attribute is left alone - #141's design
 * allows it at save time and only refuses it when the stream that performs
 * this tune is published (genet-publish.ts).
 */
function tuneFieldsProblem(fields: TuneFields): Refusal | null {
  if (fields.title === '') return refusal('曲名を書いてください', 'title must not be empty');

  // Counted from 1 in the sentences, as the publish refusals in
  // genet-publish.ts count them.
  for (const [index, a] of fields.attributes.entries()) {
    const attribute = `作曲・作詞などの ${index + 1} 番目`;

    if (a.name === null && a.text === null) {
      return refusal(`${attribute}に、項目の名前か中身を書いてください`, `attributes[${index}] needs a name or a text`);
    }

    if (a.name === '') {
      return refusal(`${attribute}の項目の名前が空になっています`, `attributes[${index}].name must not be empty`);
    }

    if (a.text === '')
      return refusal(`${attribute}の中身が空になっています`, `attributes[${index}].text must not be empty`);

    for (const [personIndex, p] of a.people.entries()) {
      if (p.creditedAs === '') {
        return refusal(
          `${attribute}の ${personIndex + 1} 人目の表示名が空になっています`,
          `attributes[${index}].people[${personIndex}].creditedAs must not be empty`,
        );
      }

      // The screen has no field for a credit's note.
      if (p.note === '') return malformed(`attributes[${index}].people[${personIndex}].note must not be empty`);
    }
  }

  for (const [index, s] of fields.scores.entries()) {
    if (!s.url.startsWith('https://')) {
      return refusal(
        `外部資料の ${index + 1} 番目のリンクが https:// で始まっていません`,
        `scores[${index}].url must start with https://`,
      );
    }
  }

  for (const [index, v] of fields.videos.entries()) {
    if (v.startSeconds !== null && v.startSeconds < 0) {
      return refusal(
        `参考動画の ${index + 1} 番目の秒は 0 以上にしてください`,
        `videos[${index}].startSeconds must be 0 or more`,
      );
    }
  }

  return null;
}

/** Every `personId` in `personIds` that `genet_person` has no row for - the same shape as footprints.ts's `unknownChannelIds`, needed because `genet_tune_attribute_person.person_id`'s foreign key is enforced. */
async function unknownPersonIds(env: Env, personIds: readonly number[]): Promise<number[]> {
  const ids = [...new Set(personIds)];

  if (ids.length === 0) return [];

  const rows = await queryInChunks(ids, async (chunk) => {
    const placeholders = chunk.map((_, index) => `?${index + 1}`).join(', ');
    const { results } = await env.DB.prepare(`SELECT person_id FROM genet_person WHERE person_id IN (${placeholders})`)
      .bind(...chunk)
      .all<{ person_id: number }>();

    return results;
  });

  const known = new Set(rows.map((row) => row.person_id));

  return ids.filter((id) => !known.has(id));
}

export async function validatedTuneFields(
  env: Env,
  body: Record<string, unknown>,
): Promise<TuneFields | { error: Response }> {
  const fields = readTuneFields(body);

  if ('error' in fields) return { error: refuse(400, fields.error) };

  const problem = tuneFieldsProblem(fields);

  if (problem !== null) return { error: refuse(400, problem) };

  const unknown = await unknownPersonIds(
    env,
    fields.attributes.flatMap((a) => a.people.map((p) => p.personId)),
  );

  if (unknown.length > 0) {
    return {
      error: refuse(400, refusal('見つからない人物が含まれています', `unknown personIds: ${unknown.join(', ')}`)),
    };
  }

  return fields;
}

/**
 * Attribute/person/video/score statements for `tuneId`, an id this same
 * batch's own INSERT into `genet_tune` is about to create - `last_insert_rowid()`
 * embedded in the SQL text rather than bound, the same as
 * memberStatementsForNewEvent in footprints.ts and for the same reason: every
 * child table here is `WITHOUT ROWID`, so none of these inserts ever move
 * what `last_insert_rowid()` reports.
 */
function childStatementsForNewTune(env: Env, fields: TuneFields): D1PreparedStatement[] {
  const statements: D1PreparedStatement[] = [];

  fields.attributes.forEach((a, index) => {
    const position = index + 1;

    statements.push(
      env.DB.prepare(
        'INSERT INTO genet_tune_attribute (tune_id, position, name, text) VALUES (last_insert_rowid(), ?1, ?2, ?3)',
      ).bind(position, a.name, a.text),
    );

    a.people.forEach((p, personIndex) => {
      statements.push(
        env.DB.prepare(
          `INSERT INTO genet_tune_attribute_person
             (tune_id, attribute_position, position, person_id, credited_as, note)
           VALUES (last_insert_rowid(), ?1, ?2, ?3, ?4, ?5)`,
        ).bind(position, personIndex + 1, p.personId, p.creditedAs, p.note),
      );
    });
  });

  fields.videos.forEach((v, index) => {
    statements.push(
      env.DB.prepare(
        'INSERT INTO genet_tune_video (tune_id, position, video_id, title, start_seconds, description) VALUES (last_insert_rowid(), ?1, ?2, ?3, ?4, ?5)',
      ).bind(index + 1, v.videoId, v.title, v.startSeconds, v.description),
    );
  });

  fields.scores.forEach((s, index) => {
    statements.push(
      env.DB.prepare(
        'INSERT INTO genet_tune_score (tune_id, position, url, title) VALUES (last_insert_rowid(), ?1, ?2, ?3)',
      ).bind(index + 1, s.url, s.title),
    );
  });

  return statements;
}

/**
 * The same statements as `childStatementsForNewTune`, for an existing
 * `tuneId` bound directly rather than read off `last_insert_rowid()`. Each is
 * inserted only while the tune is still there, as genet-streams.ts's own
 * `childStatements` are and for the same reason: a tune deleted between the
 * caller's read and its batch would otherwise fail a publish's batch on the
 * foreign key, after the public JSON was already written.
 */
function childStatements(env: Env, tuneId: number, fields: TuneFields): D1PreparedStatement[] {
  const statements: D1PreparedStatement[] = [];

  fields.attributes.forEach((a, index) => {
    const position = index + 1;

    statements.push(
      env.DB.prepare(
        `INSERT INTO genet_tune_attribute (tune_id, position, name, text)
         SELECT ?1, ?2, ?3, ?4 WHERE EXISTS (SELECT 1 FROM genet_tune WHERE tune_id = ?1)`,
      ).bind(tuneId, position, a.name, a.text),
    );

    a.people.forEach((p, personIndex) => {
      statements.push(
        env.DB.prepare(
          `INSERT INTO genet_tune_attribute_person
             (tune_id, attribute_position, position, person_id, credited_as, note)
           SELECT ?1, ?2, ?3, ?4, ?5, ?6 WHERE EXISTS (SELECT 1 FROM genet_tune WHERE tune_id = ?1)`,
        ).bind(tuneId, position, personIndex + 1, p.personId, p.creditedAs, p.note),
      );
    });
  });

  fields.videos.forEach((v, index) => {
    statements.push(
      env.DB.prepare(
        `INSERT INTO genet_tune_video (tune_id, position, video_id, title, start_seconds, description)
         SELECT ?1, ?2, ?3, ?4, ?5, ?6 WHERE EXISTS (SELECT 1 FROM genet_tune WHERE tune_id = ?1)`,
      ).bind(tuneId, index + 1, v.videoId, v.title, v.startSeconds, v.description),
    );
  });

  fields.scores.forEach((s, index) => {
    statements.push(
      env.DB.prepare(
        `INSERT INTO genet_tune_score (tune_id, position, url, title)
         SELECT ?1, ?2, ?3, ?4 WHERE EXISTS (SELECT 1 FROM genet_tune WHERE tune_id = ?1)`,
      ).bind(tuneId, index + 1, s.url, s.title),
    );
  });

  return statements;
}

/** POST /admin/api/genet/tunes. One `db.batch`; see childStatementsForNewTune for how the children name the row it creates. */
export async function createTune(env: Env, body: Record<string, unknown>): Promise<Response> {
  const fields = await validatedTuneFields(env, body);

  if ('error' in fields) return fields.error;

  const results = await env.DB.batch([
    env.DB.prepare('INSERT INTO genet_tune (title, original_title, subtunes, memo) VALUES (?1, ?2, ?3, ?4)').bind(
      fields.title,
      fields.originalTitle,
      JSON.stringify(fields.subtunes),
      fields.memo,
    ),
    ...childStatementsForNewTune(env, fields),
  ]);

  const tuneId = results[0].meta.last_row_id;
  const saved = await readTune(env, tuneId);

  return jsonResponse({ tune: present(saved!) }, { status: 201 });
}

/** The statements that save `fields` over tune `tuneId`, replacing every attribute, video and score row. */
export function saveStatements(env: Env, tuneId: number, fields: TuneFields): D1PreparedStatement[] {
  return [
    env.DB.prepare(
      'UPDATE genet_tune SET title = ?1, original_title = ?2, subtunes = ?3, memo = ?4 WHERE tune_id = ?5',
    ).bind(fields.title, fields.originalTitle, JSON.stringify(fields.subtunes), fields.memo, tuneId),
    env.DB.prepare('DELETE FROM genet_tune_attribute_person WHERE tune_id = ?1').bind(tuneId),
    env.DB.prepare('DELETE FROM genet_tune_attribute WHERE tune_id = ?1').bind(tuneId),
    env.DB.prepare('DELETE FROM genet_tune_video WHERE tune_id = ?1').bind(tuneId),
    env.DB.prepare('DELETE FROM genet_tune_score WHERE tune_id = ?1').bind(tuneId),
    ...childStatements(env, tuneId, fields),
  ];
}

/** `saved` as it reads once `fields` are saved over it, without reading it back. */
export function withFields(saved: GenetTune, fields: TuneFields): GenetTune {
  return {
    tune: {
      ...saved.tune,
      title: fields.title,
      original_title: fields.originalTitle,
      subtunes: JSON.stringify(fields.subtunes),
      memo: fields.memo,
    },
    attributes: fields.attributes.map((a) => ({
      name: a.name,
      text: a.text,
      people: a.people.map((p) => ({ person_id: p.personId, credited_as: p.creditedAs, note: p.note })),
    })),
    videos: fields.videos.map((v) => ({
      video_id: v.videoId,
      title: v.title,
      start_seconds: v.startSeconds,
      description: v.description,
    })),
    scores: fields.scores.map((s) => ({ url: s.url, title: s.title })),
  };
}

/**
 * PUT /admin/api/genet/tunes/:tuneId for a tune no published stream
 * performs. Replaces every attribute, video and score row. A tune a
 * published stream performs reaches the public JSON when it is saved, and
 * goes through genet-publish.ts's `saveTune` instead (#284).
 */
export async function updateTune(env: Env, tuneId: number, body: Record<string, unknown>): Promise<Response> {
  const existing = await readTune(env, tuneId);

  if (existing === null) return noTuneResponse(tuneId);

  const fields = await validatedTuneFields(env, body);

  if ('error' in fields) return fields.error;

  await env.DB.batch(saveStatements(env, tuneId, fields));

  const saved = await readTune(env, tuneId);

  return jsonResponse({ tune: present(saved!) });
}

/**
 * DELETE /admin/api/genet/tunes/:tuneId. 404 when there is no such tune, 409
 * when any `genet_performance` still performs it - the same shape as
 * genet-people.ts's deletePerson.
 */
export async function deleteTune(env: Env, tuneId: number): Promise<Response> {
  const existing = await env.DB.prepare('SELECT 1 FROM genet_tune WHERE tune_id = ?1').bind(tuneId).first();

  if (existing === null) return noTuneResponse(tuneId);

  const referenced = await env.DB.prepare('SELECT 1 FROM genet_performance WHERE tune_id = ?1').bind(tuneId).first();

  if (referenced !== null) {
    return refuse(
      409,
      refusal(
        'この曲を演奏している配信があるため削除できませんでした',
        'this tune is performed by a stream; remove it there first',
      ),
    );
  }

  await env.DB.batch([
    env.DB.prepare('DELETE FROM genet_tune_attribute_person WHERE tune_id = ?1').bind(tuneId),
    env.DB.prepare('DELETE FROM genet_tune_attribute WHERE tune_id = ?1').bind(tuneId),
    env.DB.prepare('DELETE FROM genet_tune_video WHERE tune_id = ?1').bind(tuneId),
    env.DB.prepare('DELETE FROM genet_tune_score WHERE tune_id = ?1').bind(tuneId),
    env.DB.prepare('DELETE FROM genet_tune WHERE tune_id = ?1').bind(tuneId),
  ]);

  return jsonResponse({});
}
