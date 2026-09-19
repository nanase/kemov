import { queryInChunks } from '../lib/d1';
import type { Env } from '../lib/env';
import { errorResponse, jsonResponse } from '../lib/json';
import { isSchemaTimestamp } from '../lib/time';

/**
 * Reading, saving and deleting `genet_stream` (#141, #139): one stream, the
 * unit the admin site edits and publishes. Unlike `genet_tune` and
 * `genet_person`, `genet_stream` carries its own `status` - #141's design
 * gives it, and only it, a publish gate - so a save here logs no `revision`
 * either; only genet-publish.ts's publish/withdraw do.
 *
 * `video_id` is the caller's own primary key (the YouTube id, or TikTok's
 * numeric video id), not one this file assigns - unlike footprints_event and
 * genet_tune there is no `last_insert_rowid()` trick anywhere here, because
 * every child row already has the id it needs the moment the request body is
 * read.
 */

const PLATFORMS = ['youtube', 'tiktok'] as const;
const VIDEO_TYPES = ['live', 'video', 'short'] as const;
const SCENE_STYLES = ['play', 'sing', 'bgm', 'talk'] as const;

export interface StreamRow {
  video_id: string;
  platform: string;
  url: string | null;
  video_type: string;
  title: string;
  short_title: string | null;
  published_at: string;
  categories: string;
  keywords: string;
  status: string;
  memo: string | null;
  created_at: string;
  updated_at: string;
}

export interface Scene {
  style: string;
  video_id: string;
  start_seconds: number | null;
}

export interface Performance {
  tune_id: number;
  description: string | null;
  scenes: Scene[];
}

export interface GenetStream {
  stream: StreamRow;
  performances: Performance[];
}

export function present(saved: GenetStream) {
  const { stream } = saved;

  return {
    videoId: stream.video_id,
    platform: stream.platform,
    url: stream.url,
    videoType: stream.video_type,
    title: stream.title,
    shortTitle: stream.short_title,
    publishedAt: stream.published_at,
    categories: JSON.parse(stream.categories) as string[],
    keywords: JSON.parse(stream.keywords) as string[],
    status: stream.status,
    memo: stream.memo,
    createdAt: stream.created_at,
    updatedAt: stream.updated_at,
    performances: saved.performances.map((p) => ({
      tuneId: p.tune_id,
      description: p.description,
      scenes: p.scenes.map((s) => ({ style: s.style, videoId: s.video_id, startSeconds: s.start_seconds })),
    })),
  };
}

/**
 * The shape #141's design gives one element of the public JSON's `streams`
 * array - `memo`, `status` and the timestamp columns left out, the same as
 * `publicShapeOf` in footprints.ts and genet-tunes.ts.
 */
export function publicShapeOf(saved: GenetStream) {
  const { stream } = saved;

  return {
    video_id: stream.video_id,
    platform: stream.platform,
    url: stream.url,
    video_type: stream.video_type,
    title: stream.title,
    short_title: stream.short_title,
    published_at: stream.published_at,
    categories: JSON.parse(stream.categories) as string[],
    keywords: JSON.parse(stream.keywords) as string[],
    performances: saved.performances.map((p) => ({
      tune_id: p.tune_id,
      description: p.description,
      scenes: p.scenes.map((s) => ({ style: s.style, video_id: s.video_id, start_seconds: s.start_seconds })),
    })),
  };
}

interface RawPerformanceRow {
  position: number;
  tune_id: number;
  description: string | null;
}

interface RawSceneRow {
  position: number;
  scene_position: number;
  style: string;
  scene_video_id: string;
  start_seconds: number | null;
}

/** `genet_stream`, its performances and each performance's scenes, all in display order. */
export async function readStream(env: Env, videoId: string): Promise<GenetStream | null> {
  const stream = await env.DB.prepare(
    `SELECT video_id, platform, url, video_type, title, short_title, published_at, categories, keywords,
            status, memo, created_at, updated_at
       FROM genet_stream WHERE video_id = ?1`,
  )
    .bind(videoId)
    .first<StreamRow>();

  if (stream === null) return null;

  const [perfRows, sceneRows] = await Promise.all([
    env.DB.prepare('SELECT position, tune_id, description FROM genet_performance WHERE video_id = ?1 ORDER BY position')
      .bind(videoId)
      .all<RawPerformanceRow>(),
    env.DB.prepare(
      'SELECT position, scene_position, style, scene_video_id, start_seconds FROM genet_scene WHERE video_id = ?1 ORDER BY position, scene_position',
    )
      .bind(videoId)
      .all<RawSceneRow>(),
  ]);

  const scenesByPosition = new Map<number, Scene[]>();

  for (const row of sceneRows.results) {
    if (!scenesByPosition.has(row.position)) scenesByPosition.set(row.position, []);
    scenesByPosition
      .get(row.position)!
      .push({ style: row.style, video_id: row.scene_video_id, start_seconds: row.start_seconds });
  }

  return {
    stream,
    performances: perfRows.results.map((row) => ({
      tune_id: row.tune_id,
      description: row.description,
      scenes: scenesByPosition.get(row.position) ?? [],
    })),
  };
}

/** `readStream` for several video ids at once - listStreams and genet-publish.ts's pending/publish-now both want every stream at once rather than one query per id. */
export async function readStreams(env: Env, videoIds: readonly string[]): Promise<Map<string, GenetStream>> {
  const ids = [...new Set(videoIds)];

  if (ids.length === 0) return new Map();

  const [streamRows, perfRows, sceneRows] = await Promise.all([
    queryInChunks(ids, async (chunk) => {
      const placeholders = chunk.map((_, index) => `?${index + 1}`).join(', ');

      const { results } = await env.DB.prepare(
        `SELECT video_id, platform, url, video_type, title, short_title, published_at, categories, keywords,
                status, memo, created_at, updated_at
           FROM genet_stream WHERE video_id IN (${placeholders})`,
      )
        .bind(...chunk)
        .all<StreamRow>();

      return results;
    }),
    queryInChunks(ids, async (chunk) => {
      const placeholders = chunk.map((_, index) => `?${index + 1}`).join(', ');

      const { results } = await env.DB.prepare(
        `SELECT video_id, position, tune_id, description FROM genet_performance WHERE video_id IN (${placeholders}) ORDER BY video_id, position`,
      )
        .bind(...chunk)
        .all<RawPerformanceRow & { video_id: string }>();

      return results;
    }),
    queryInChunks(ids, async (chunk) => {
      const placeholders = chunk.map((_, index) => `?${index + 1}`).join(', ');

      const { results } = await env.DB.prepare(
        `SELECT video_id, position, scene_position, style, scene_video_id, start_seconds
           FROM genet_scene WHERE video_id IN (${placeholders}) ORDER BY video_id, position, scene_position`,
      )
        .bind(...chunk)
        .all<RawSceneRow & { video_id: string }>();

      return results;
    }),
  ]);

  const scenesByStreamAndPosition = new Map<string, Map<number, Scene[]>>();

  for (const row of sceneRows) {
    if (!scenesByStreamAndPosition.has(row.video_id)) scenesByStreamAndPosition.set(row.video_id, new Map());

    const byPosition = scenesByStreamAndPosition.get(row.video_id)!;

    if (!byPosition.has(row.position)) byPosition.set(row.position, []);
    byPosition
      .get(row.position)!
      .push({ style: row.style, video_id: row.scene_video_id, start_seconds: row.start_seconds });
  }

  const perfsByStream = new Map<string, RawPerformanceRow[]>();

  for (const row of perfRows) {
    if (!perfsByStream.has(row.video_id)) perfsByStream.set(row.video_id, []);
    perfsByStream.get(row.video_id)!.push(row);
  }

  return new Map(
    streamRows.map((stream) => [
      stream.video_id,
      {
        stream,
        performances: (perfsByStream.get(stream.video_id) ?? []).map((row) => ({
          tune_id: row.tune_id,
          description: row.description,
          scenes: scenesByStreamAndPosition.get(stream.video_id)?.get(row.position) ?? [],
        })),
      },
    ]),
  );
}

/** GET /admin/api/genet/streams - optionally narrowed by status and by a substring of title. */
export async function listStreams(env: Env, status: string | null, q: string | null): Promise<Response> {
  if (status !== null && !isStatus(status)) {
    return errorResponse(400, `status must be one of draft, review, published`);
  }

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (status !== null) {
    params.push(status);
    conditions.push(`status = ?${params.length}`);
  }

  if (q !== null) {
    params.push(`%${q.replace(/[\\%_]/g, '\\$&')}%`);
    conditions.push(`title LIKE ?${params.length} ESCAPE '\\'`);
  }

  const where = conditions.length === 0 ? '' : `WHERE ${conditions.join(' AND ')}`;

  const { results } = await env.DB.prepare(`SELECT video_id FROM genet_stream ${where} ORDER BY published_at DESC`)
    .bind(...params)
    .all<{ video_id: string }>();

  const byId = await readStreams(
    env,
    results.map((row) => row.video_id),
  );

  return jsonResponse({ streams: results.map((row) => present(byId.get(row.video_id)!)) });
}

/** GET /admin/api/genet/streams/:videoId. 404 when there is no such stream. */
export async function getStream(env: Env, videoId: string): Promise<Response> {
  const saved = await readStream(env, videoId);

  if (saved === null) return errorResponse(404, `no stream ${videoId}`);

  return jsonResponse({ stream: present(saved) });
}

function isStatus(value: unknown): value is 'draft' | 'review' | 'published' {
  return value === 'draft' || value === 'review' || value === 'published';
}

interface SceneFields {
  style: string;
  videoId: string;
  startSeconds: number | null;
}

interface PerformanceFields {
  tuneId: number;
  description: string | null;
  scenes: SceneFields[];
}

export interface StreamFields {
  platform: string;
  url: string | null;
  videoType: string;
  title: string;
  shortTitle: string | null;
  publishedAt: string;
  categories: string[];
  keywords: string[];
  memo: string | null;
  performances: PerformanceFields[];
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function readSceneFields(value: unknown): SceneFields | { error: string } {
  if (typeof value !== 'object' || value === null) return { error: 'each scene must be an object' };

  const { style, videoId, startSeconds } = value as Record<string, unknown>;

  if (typeof style !== 'string') return { error: 'scene style must be a string' };
  if (typeof videoId !== 'string') return { error: 'scene videoId must be a string' };
  if (startSeconds !== undefined && startSeconds !== null && typeof startSeconds !== 'number') {
    return { error: 'scene startSeconds must be a number or null' };
  }

  return { style, videoId, startSeconds: (startSeconds as number | null) ?? null };
}

function readPerformanceFields(value: unknown): PerformanceFields | { error: string } {
  if (typeof value !== 'object' || value === null) return { error: 'each performance must be an object' };

  const { tuneId, description, scenes } = value as Record<string, unknown>;

  if (typeof tuneId !== 'number') return { error: 'performance tuneId must be a number' };
  if (description !== undefined && description !== null && typeof description !== 'string') {
    return { error: 'performance description must be a string or null' };
  }

  const scenesValue = scenes ?? [];

  if (!Array.isArray(scenesValue)) return { error: 'performance scenes must be an array' };

  const readScenes: SceneFields[] = [];

  for (const s of scenesValue) {
    const read = readSceneFields(s);

    if ('error' in read) return read;

    readScenes.push(read);
  }

  return { tuneId, description: (description as string | null) ?? null, scenes: readScenes };
}

/** Reads the fields a POST or PUT body carries - the same full-replace shape `readTuneFields` gives `genet_tune`. `status` is never read here: creating always starts a stream in `draft`, and updating never moves it. */
function readStreamFields(body: Record<string, unknown>): StreamFields | { error: string } {
  const categories = body.categories ?? [];
  const keywords = body.keywords ?? [];

  if (!isStringArray(categories)) return { error: 'categories must be an array of strings' };
  if (!isStringArray(keywords)) return { error: 'keywords must be an array of strings' };

  const performancesValue = body.performances ?? [];

  if (!Array.isArray(performancesValue)) return { error: 'performances must be an array' };

  const performances: PerformanceFields[] = [];

  for (const p of performancesValue) {
    const read = readPerformanceFields(p);

    if ('error' in read) return read;

    performances.push(read);
  }

  if (typeof body.platform !== 'string' && body.platform !== undefined) return { error: 'platform must be a string' };
  if (typeof body.videoType !== 'string') return { error: 'videoType must be a string' };
  if (typeof body.title !== 'string') return { error: 'title must be a string' };
  if (body.shortTitle !== undefined && body.shortTitle !== null && typeof body.shortTitle !== 'string') {
    return { error: 'shortTitle must be a string or null' };
  }
  if (typeof body.publishedAt !== 'string') return { error: 'publishedAt must be a string' };
  if (body.url !== undefined && body.url !== null && typeof body.url !== 'string') {
    return { error: 'url must be a string or null' };
  }
  if (body.memo !== undefined && body.memo !== null && typeof body.memo !== 'string') {
    return { error: 'memo must be a string or null' };
  }

  return {
    platform: (body.platform as string | undefined) ?? 'youtube',
    url: (body.url as string | null) ?? null,
    videoType: body.videoType,
    title: body.title,
    shortTitle: (body.shortTitle as string | null) ?? null,
    publishedAt: body.publishedAt,
    categories,
    keywords,
    memo: (body.memo as string | null) ?? null,
    performances,
  };
}

/**
 * The schema's own CHECKs, mirrored for a 400 with a reason. `videoId`'s
 * 11-character shape and every `tuneId`/scene existence check are not here -
 * #141's design (task 10's handoff) asks for those only when the stream is
 * published, the same as footprints_event defers its own `videoId` length
 * check to publishProblems.
 */
function streamFieldsProblem(fields: StreamFields): string | null {
  if (!(PLATFORMS as readonly string[]).includes(fields.platform)) {
    return `platform must be one of ${PLATFORMS.join(', ')}`;
  }

  if ((fields.platform === 'youtube') !== (fields.url === null)) {
    return fields.platform === 'youtube'
      ? 'url must be null when platform is youtube'
      : 'url is required when platform is not youtube';
  }

  if (fields.url !== null && !fields.url.startsWith('https://')) return 'url must start with https://';

  if (!(VIDEO_TYPES as readonly string[]).includes(fields.videoType)) {
    return `videoType must be one of ${VIDEO_TYPES.join(', ')}`;
  }

  if (!isSchemaTimestamp(fields.publishedAt)) return 'publishedAt must be YYYY-MM-DDTHH:MM:SSZ';

  for (const [index, p] of fields.performances.entries()) {
    for (const [sceneIndex, s] of p.scenes.entries()) {
      if (!(SCENE_STYLES as readonly string[]).includes(s.style)) {
        return `performances[${index}].scenes[${sceneIndex}].style must be one of ${SCENE_STYLES.join(', ')}`;
      }
      if (s.startSeconds !== null && s.startSeconds < 0) {
        return `performances[${index}].scenes[${sceneIndex}].startSeconds must be 0 or more`;
      }
    }
  }

  return null;
}

/** Every `tuneId` in `tuneIds` that `genet_tune` has no row for - the same shape as footprints.ts's `unknownChannelIds`, needed for the same reason: `genet_performance.tune_id`'s foreign key is enforced, so an unknown id would otherwise fail the whole batch with a raw constraint error instead of a 400. */
async function unknownTuneIds(env: Env, tuneIds: readonly number[]): Promise<number[]> {
  const ids = [...new Set(tuneIds)];

  if (ids.length === 0) return [];

  const rows = await queryInChunks(ids, async (chunk) => {
    const placeholders = chunk.map((_, index) => `?${index + 1}`).join(', ');
    const { results } = await env.DB.prepare(`SELECT tune_id FROM genet_tune WHERE tune_id IN (${placeholders})`)
      .bind(...chunk)
      .all<{ tune_id: number }>();

    return results;
  });

  const known = new Set(rows.map((row) => row.tune_id));

  return ids.filter((id) => !known.has(id));
}

async function validatedStreamFields(
  env: Env,
  body: Record<string, unknown>,
): Promise<StreamFields | { error: Response }> {
  const fields = readStreamFields(body);

  if ('error' in fields) return { error: errorResponse(400, fields.error) };

  const problem = streamFieldsProblem(fields);

  if (problem !== null) return { error: errorResponse(400, problem) };

  const unknown = await unknownTuneIds(
    env,
    fields.performances.map((p) => p.tuneId),
  );

  if (unknown.length > 0) return { error: errorResponse(400, `unknown tuneIds: ${unknown.join(', ')}`) };

  return fields;
}

function childStatements(env: Env, videoId: string, fields: StreamFields): D1PreparedStatement[] {
  const statements: D1PreparedStatement[] = [];

  fields.performances.forEach((p, index) => {
    const position = index + 1;

    statements.push(
      env.DB.prepare(
        'INSERT INTO genet_performance (video_id, position, tune_id, description) VALUES (?1, ?2, ?3, ?4)',
      ).bind(videoId, position, p.tuneId, p.description),
    );

    p.scenes.forEach((s, sceneIndex) => {
      statements.push(
        env.DB.prepare(
          `INSERT INTO genet_scene (video_id, position, scene_position, style, scene_video_id, start_seconds)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
        ).bind(videoId, position, sceneIndex + 1, s.style, s.videoId, s.startSeconds),
      );
    });
  });

  return statements;
}

/**
 * POST /admin/api/genet/streams. Always creates in `draft`. 409 when
 * `videoId` is already taken.
 *
 * `videoId` comes from the body rather than the URL - unlike every PUT/DELETE
 * in this admin API, a POST that creates a `genet_stream` has no id in its
 * path to read one from, because the id is the caller's own choice (the
 * YouTube id, or TikTok's numeric video id) rather than something D1 assigns.
 */
export async function createStream(env: Env, body: Record<string, unknown>): Promise<Response> {
  if (typeof body.videoId !== 'string' || body.videoId === '') {
    return errorResponse(400, 'videoId must be a non-empty string');
  }

  const videoId = body.videoId;

  const existing = await env.DB.prepare('SELECT 1 FROM genet_stream WHERE video_id = ?1').bind(videoId).first();

  if (existing !== null) return errorResponse(409, `stream ${videoId} already exists`);

  const fields = await validatedStreamFields(env, body);

  if ('error' in fields) return fields.error;

  // The SELECT above and this INSERT are two round trips, not one batch, so a
  // concurrent createStream for the same videoId can pass that same check in
  // between: video_id is genet_stream's own primary key, so the later INSERT
  // fails on the constraint rather than silently succeeding. Caught here and
  // turned into the same 409 the check above already gives a slower caller,
  // rather than surfacing as an unhandled exception.
  try {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO genet_stream
           (video_id, platform, url, video_type, title, short_title, published_at, categories, keywords, status, memo, created_via)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'draft', ?10, 'admin')`,
      ).bind(
        videoId,
        fields.platform,
        fields.url,
        fields.videoType,
        fields.title,
        fields.shortTitle,
        fields.publishedAt,
        JSON.stringify(fields.categories),
        JSON.stringify(fields.keywords),
        fields.memo,
      ),
      ...childStatements(env, videoId, fields),
    ]);
  } catch (error) {
    if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
      return errorResponse(409, `stream ${videoId} already exists`);
    }

    throw error;
  }

  const saved = await readStream(env, videoId);

  return jsonResponse({ stream: present(saved!) }, { status: 201 });
}

/** PUT /admin/api/genet/streams/:videoId. Replaces performances and scenes; `status` is left untouched. */
export async function updateStream(env: Env, videoId: string, body: Record<string, unknown>): Promise<Response> {
  const existing = await readStream(env, videoId);

  if (existing === null) return errorResponse(404, `no stream ${videoId}`);

  const fields = await validatedStreamFields(env, body);

  if ('error' in fields) return fields.error;

  await env.DB.batch([
    env.DB.prepare(
      `UPDATE genet_stream
          SET platform = ?1, url = ?2, video_type = ?3, title = ?4, short_title = ?5, published_at = ?6,
              categories = ?7, keywords = ?8, memo = ?9, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
        WHERE video_id = ?10`,
    ).bind(
      fields.platform,
      fields.url,
      fields.videoType,
      fields.title,
      fields.shortTitle,
      fields.publishedAt,
      JSON.stringify(fields.categories),
      JSON.stringify(fields.keywords),
      fields.memo,
      videoId,
    ),
    env.DB.prepare('DELETE FROM genet_scene WHERE video_id = ?1').bind(videoId),
    env.DB.prepare('DELETE FROM genet_performance WHERE video_id = ?1').bind(videoId),
    ...childStatements(env, videoId, fields),
  ]);

  const saved = await readStream(env, videoId);

  return jsonResponse({ stream: present(saved!) });
}

/**
 * DELETE /admin/api/genet/streams/:videoId. 404 when there is no such
 * stream, 409 when it is `published` - the same reasoning as
 * footprints.ts's deleteEvent: the public JSON is built from `revision`, not
 * the working row, so withdrawing first is what makes a delete safe.
 */
export async function deleteStream(env: Env, videoId: string): Promise<Response> {
  const existing = await readStream(env, videoId);

  if (existing === null) return errorResponse(404, `no stream ${videoId}`);

  if (existing.stream.status === 'published') {
    return errorResponse(409, 'withdraw this stream before deleting it');
  }

  // The check above and this batch are two round trips, not one, so a
  // concurrent publishStream can land in between and this would otherwise
  // delete a stream that is published by the time the batch actually runs -
  // genet_stream has no ON DELETE CASCADE, so each DELETE needs its own
  // guard, not just the parent row's. Every statement re-checks the current
  // status itself rather than trusting `existing`, the same way
  // footprints-publish.ts's own publish/withdraw gate a revision INSERT on
  // the row EXISTS finds at batch time.
  await env.DB.batch([
    env.DB.prepare(
      `DELETE FROM genet_scene
        WHERE video_id = ?1
          AND EXISTS (SELECT 1 FROM genet_stream WHERE video_id = ?1 AND status <> 'published')`,
    ).bind(videoId),
    env.DB.prepare(
      `DELETE FROM genet_performance
        WHERE video_id = ?1
          AND EXISTS (SELECT 1 FROM genet_stream WHERE video_id = ?1 AND status <> 'published')`,
    ).bind(videoId),
    env.DB.prepare(`DELETE FROM genet_stream WHERE video_id = ?1 AND status <> 'published'`).bind(videoId),
  ]);

  return jsonResponse({});
}
