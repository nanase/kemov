import type { Env } from '../lib/env';
import { errorResponse, jsonResponse } from '../lib/json';

/**
 * Reading, saving and deleting `genet_tune` (#141, #139): one tune's own
 * material - title, credits, reference videos and sheet music - shared
 * across every `genet_stream` that performs it. Like `genet_person`,
 * `genet_tune` has no `status` of its own, so a save here logs no
 * `revision`; only publishing a stream that performs it does, in
 * genet-publish.ts.
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

  const placeholders = ids.map((_, index) => `?${index + 1}`).join(', ');

  const [tunes, attrRows, personRows, videoRows, scoreRows] = await Promise.all([
    env.DB.prepare(
      `SELECT tune_id, title, original_title, subtunes, memo FROM genet_tune WHERE tune_id IN (${placeholders})`,
    )
      .bind(...ids)
      .all<TuneRow>(),
    env.DB.prepare(
      `SELECT tune_id, position, name, text FROM genet_tune_attribute WHERE tune_id IN (${placeholders}) ORDER BY tune_id, position`,
    )
      .bind(...ids)
      .all<RawAttributeRow & { tune_id: number }>(),
    env.DB.prepare(
      `SELECT tune_id, attribute_position, person_id, credited_as, note
         FROM genet_tune_attribute_person WHERE tune_id IN (${placeholders}) ORDER BY tune_id, attribute_position, position`,
    )
      .bind(...ids)
      .all<RawAttributePersonRow & { tune_id: number }>(),
    env.DB.prepare(
      `SELECT tune_id, video_id, title, start_seconds, description FROM genet_tune_video WHERE tune_id IN (${placeholders}) ORDER BY tune_id, position`,
    )
      .bind(...ids)
      .all<VideoRow & { tune_id: number }>(),
    env.DB.prepare(
      `SELECT tune_id, url, title FROM genet_tune_score WHERE tune_id IN (${placeholders}) ORDER BY tune_id, position`,
    )
      .bind(...ids)
      .all<ScoreRow & { tune_id: number }>(),
  ]);

  const peopleByTuneAndPosition = new Map<number, Map<number, AttributePersonRow[]>>();

  for (const { tune_id: tuneId, attribute_position: position, ...person } of personRows.results) {
    if (!peopleByTuneAndPosition.has(tuneId)) peopleByTuneAndPosition.set(tuneId, new Map());

    const byPosition = peopleByTuneAndPosition.get(tuneId)!;

    if (!byPosition.has(position)) byPosition.set(position, []);
    byPosition.get(position)!.push(person);
  }

  const attrsByTune = new Map<number, RawAttributeRow[]>();

  for (const { tune_id: tuneId, ...attr } of attrRows.results) {
    if (!attrsByTune.has(tuneId)) attrsByTune.set(tuneId, []);
    attrsByTune.get(tuneId)!.push(attr);
  }

  const videosByTune = new Map<number, VideoRow[]>();

  for (const { tune_id: tuneId, ...video } of videoRows.results) {
    if (!videosByTune.has(tuneId)) videosByTune.set(tuneId, []);
    videosByTune.get(tuneId)!.push(video);
  }

  const scoresByTune = new Map<number, ScoreRow[]>();

  for (const { tune_id: tuneId, ...score } of scoreRows.results) {
    if (!scoresByTune.has(tuneId)) scoresByTune.set(tuneId, []);
    scoresByTune.get(tuneId)!.push(score);
  }

  return new Map(
    tunes.results.map((tune) => [
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

/** GET /admin/api/genet/tunes/:tuneId. 404 when there is no such tune. */
export async function getTune(env: Env, tuneId: number): Promise<Response> {
  const saved = await readTune(env, tuneId);

  if (saved === null) return errorResponse(404, `no tune ${tuneId}`);

  return jsonResponse({ tune: present(saved) });
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

interface TuneFields {
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

function readAttributeFields(value: unknown): AttributeFields | { error: string } {
  if (typeof value !== 'object' || value === null) return { error: 'each attribute must be an object' };

  const { name, text, people } = value as Record<string, unknown>;

  if (name !== undefined && name !== null && typeof name !== 'string')
    return { error: 'attribute name must be a string or null' };
  if (text !== undefined && text !== null && typeof text !== 'string')
    return { error: 'attribute text must be a string or null' };

  const peopleValue = people ?? [];

  if (!Array.isArray(peopleValue)) return { error: 'attribute people must be an array' };

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
      return { error: 'each attribute person must be { personId: number, creditedAs?, note? }' };
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

function readVideoFields(value: unknown): VideoFields | { error: string } {
  if (typeof value !== 'object' || value === null) return { error: 'each video must be an object' };

  const { videoId, title, startSeconds, description } = value as Record<string, unknown>;

  if (typeof videoId !== 'string') return { error: 'video videoId must be a string' };
  if (typeof title !== 'string') return { error: 'video title must be a string' };
  if (startSeconds !== undefined && startSeconds !== null && typeof startSeconds !== 'number') {
    return { error: 'video startSeconds must be a number or null' };
  }
  if (description !== undefined && description !== null && typeof description !== 'string') {
    return { error: 'video description must be a string or null' };
  }

  return {
    videoId,
    title,
    startSeconds: (startSeconds as number | null) ?? null,
    description: (description as string | null) ?? null,
  };
}

function readScoreFields(value: unknown): ScoreFields | { error: string } {
  if (typeof value !== 'object' || value === null) return { error: 'each score must be an object' };

  const { url, title } = value as Record<string, unknown>;

  if (typeof url !== 'string') return { error: 'score url must be a string' };
  if (typeof title !== 'string') return { error: 'score title must be a string' };

  return { url, title };
}

/**
 * Reads the fields a POST or PUT body carries, the same full-replace shape
 * `readEventFields` gives `footprints_event`.
 */
function readTuneFields(body: Record<string, unknown>): TuneFields | { error: string } {
  const subtunes = body.subtunes ?? [];

  if (!isStringArray(subtunes)) return { error: 'subtunes must be an array of strings' };

  const attributesValue = body.attributes ?? [];

  if (!Array.isArray(attributesValue)) return { error: 'attributes must be an array' };

  const attributes: AttributeFields[] = [];

  for (const a of attributesValue) {
    const read = readAttributeFields(a);

    if ('error' in read) return read;

    attributes.push(read);
  }

  const videosValue = body.videos ?? [];

  if (!Array.isArray(videosValue)) return { error: 'videos must be an array' };

  const videos: VideoFields[] = [];

  for (const v of videosValue) {
    const read = readVideoFields(v);

    if ('error' in read) return read;

    videos.push(read);
  }

  const scoresValue = body.scores ?? [];

  if (!Array.isArray(scoresValue)) return { error: 'scores must be an array' };

  const scores: ScoreFields[] = [];

  for (const s of scoresValue) {
    const read = readScoreFields(s);

    if ('error' in read) return read;

    scores.push(read);
  }

  if (typeof body.title !== 'string') return { error: 'title must be a string' };

  if (body.originalTitle !== undefined && body.originalTitle !== null && typeof body.originalTitle !== 'string') {
    return { error: 'originalTitle must be a string or null' };
  }

  if (body.memo !== undefined && body.memo !== null && typeof body.memo !== 'string') {
    return { error: 'memo must be a string or null' };
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
function tuneFieldsProblem(fields: TuneFields): string | null {
  if (fields.title === '') return 'title must not be empty';

  for (const [index, a] of fields.attributes.entries()) {
    if (a.name === null && a.text === null) return `attributes[${index}] needs a name or a text`;
    if (a.name === '') return `attributes[${index}].name must not be empty`;
    if (a.text === '') return `attributes[${index}].text must not be empty`;

    for (const [personIndex, p] of a.people.entries()) {
      if (p.creditedAs === '') return `attributes[${index}].people[${personIndex}].creditedAs must not be empty`;
      if (p.note === '') return `attributes[${index}].people[${personIndex}].note must not be empty`;
    }
  }

  for (const [index, s] of fields.scores.entries()) {
    if (!s.url.startsWith('https://')) return `scores[${index}].url must start with https://`;
  }

  for (const [index, v] of fields.videos.entries()) {
    if (v.startSeconds !== null && v.startSeconds < 0) return `videos[${index}].startSeconds must be 0 or more`;
  }

  return null;
}

/** Every `personId` in `personIds` that `genet_person` has no row for - the same shape as footprints.ts's `unknownChannelIds`, needed because `genet_tune_attribute_person.person_id`'s foreign key is enforced. */
async function unknownPersonIds(env: Env, personIds: readonly number[]): Promise<number[]> {
  const ids = [...new Set(personIds)];

  if (ids.length === 0) return [];

  const { results } = await env.DB.prepare(
    `SELECT person_id FROM genet_person WHERE person_id IN (${ids.map((_, index) => `?${index + 1}`).join(', ')})`,
  )
    .bind(...ids)
    .all<{ person_id: number }>();

  const known = new Set(results.map((row) => row.person_id));

  return ids.filter((id) => !known.has(id));
}

async function validatedTuneFields(env: Env, body: Record<string, unknown>): Promise<TuneFields | { error: Response }> {
  const fields = readTuneFields(body);

  if ('error' in fields) return { error: errorResponse(400, fields.error) };

  const problem = tuneFieldsProblem(fields);

  if (problem !== null) return { error: errorResponse(400, problem) };

  const unknown = await unknownPersonIds(
    env,
    fields.attributes.flatMap((a) => a.people.map((p) => p.personId)),
  );

  if (unknown.length > 0) return { error: errorResponse(400, `unknown personIds: ${unknown.join(', ')}`) };

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

/** The same statements as `childStatementsForNewTune`, for an existing `tuneId` bound directly rather than read off `last_insert_rowid()`. */
function childStatements(env: Env, tuneId: number, fields: TuneFields): D1PreparedStatement[] {
  const statements: D1PreparedStatement[] = [];

  fields.attributes.forEach((a, index) => {
    const position = index + 1;

    statements.push(
      env.DB.prepare('INSERT INTO genet_tune_attribute (tune_id, position, name, text) VALUES (?1, ?2, ?3, ?4)').bind(
        tuneId,
        position,
        a.name,
        a.text,
      ),
    );

    a.people.forEach((p, personIndex) => {
      statements.push(
        env.DB.prepare(
          `INSERT INTO genet_tune_attribute_person
             (tune_id, attribute_position, position, person_id, credited_as, note)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
        ).bind(tuneId, position, personIndex + 1, p.personId, p.creditedAs, p.note),
      );
    });
  });

  fields.videos.forEach((v, index) => {
    statements.push(
      env.DB.prepare(
        'INSERT INTO genet_tune_video (tune_id, position, video_id, title, start_seconds, description) VALUES (?1, ?2, ?3, ?4, ?5, ?6)',
      ).bind(tuneId, index + 1, v.videoId, v.title, v.startSeconds, v.description),
    );
  });

  fields.scores.forEach((s, index) => {
    statements.push(
      env.DB.prepare('INSERT INTO genet_tune_score (tune_id, position, url, title) VALUES (?1, ?2, ?3, ?4)').bind(
        tuneId,
        index + 1,
        s.url,
        s.title,
      ),
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

/** PUT /admin/api/genet/tunes/:tuneId. Replaces every attribute, video and score row. */
export async function updateTune(env: Env, tuneId: number, body: Record<string, unknown>): Promise<Response> {
  const existing = await readTune(env, tuneId);

  if (existing === null) return errorResponse(404, `no tune ${tuneId}`);

  const fields = await validatedTuneFields(env, body);

  if ('error' in fields) return fields.error;

  await env.DB.batch([
    env.DB.prepare(
      'UPDATE genet_tune SET title = ?1, original_title = ?2, subtunes = ?3, memo = ?4 WHERE tune_id = ?5',
    ).bind(fields.title, fields.originalTitle, JSON.stringify(fields.subtunes), fields.memo, tuneId),
    env.DB.prepare('DELETE FROM genet_tune_attribute_person WHERE tune_id = ?1').bind(tuneId),
    env.DB.prepare('DELETE FROM genet_tune_attribute WHERE tune_id = ?1').bind(tuneId),
    env.DB.prepare('DELETE FROM genet_tune_video WHERE tune_id = ?1').bind(tuneId),
    env.DB.prepare('DELETE FROM genet_tune_score WHERE tune_id = ?1').bind(tuneId),
    ...childStatements(env, tuneId, fields),
  ]);

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

  if (existing === null) return errorResponse(404, `no tune ${tuneId}`);

  const referenced = await env.DB.prepare('SELECT 1 FROM genet_performance WHERE tune_id = ?1').bind(tuneId).first();

  if (referenced !== null) return errorResponse(409, 'this tune is performed by a stream; remove it there first');

  await env.DB.batch([
    env.DB.prepare('DELETE FROM genet_tune_attribute_person WHERE tune_id = ?1').bind(tuneId),
    env.DB.prepare('DELETE FROM genet_tune_attribute WHERE tune_id = ?1').bind(tuneId),
    env.DB.prepare('DELETE FROM genet_tune_video WHERE tune_id = ?1').bind(tuneId),
    env.DB.prepare('DELETE FROM genet_tune_score WHERE tune_id = ?1').bind(tuneId),
    env.DB.prepare('DELETE FROM genet_tune WHERE tune_id = ?1').bind(tuneId),
  ]);

  return jsonResponse({});
}
