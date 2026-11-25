import { env } from 'cloudflare:test';

import { createPerson, updatePerson } from '../src/admin/genet-people';
import {
  GENET_MUSIC_SHAPE_VERSION,
  pendingGenetMusic,
  publishGenetMusicNow,
  publishStream,
  saveStream,
  saveTune,
  withdrawStream,
} from '../src/admin/genet-publish';
import { createStream, getStream } from '../src/admin/genet-streams';
import { createTune, getTune } from '../src/admin/genet-tunes';
import { clearEverything } from './reset-db';

async function clearPublicData(): Promise<void> {
  const listed = await env.PUBLIC_DATA.list();

  await Promise.all(listed.objects.map((object) => env.PUBLIC_DATA.delete(object.key)));
}

beforeEach(async () => {
  await clearEverything();
  await clearPublicData();
});

const NOW = new Date('2026-09-18T00:00:00Z');

async function revisionRows(entity: string): Promise<{ entity_key: string; action: string; body: string | null }[]> {
  const { results } = await env.DB.prepare(
    'SELECT entity_key, action, body FROM revision WHERE entity = ?1 ORDER BY revision_id',
  )
    .bind(entity)
    .all<{ entity_key: string; action: string; body: string | null }>();

  return results;
}

async function createValidPerson(overrides: Record<string, unknown> = {}): Promise<number> {
  const response = await createPerson(env, { name: '作曲者', link: null, memo: null, ...overrides });
  const body = (await response.json()) as { person: { personId: number } };

  return body.person.personId;
}

function validTuneBody(overrides: Record<string, unknown> = {}) {
  return {
    title: '曲名',
    originalTitle: null,
    subtunes: [],
    attributes: [],
    videos: [],
    scores: [],
    memo: null,
    ...overrides,
  };
}

async function createValidTune(overrides: Record<string, unknown> = {}): Promise<number> {
  const response = await createTune(env, validTuneBody(overrides));
  const body = (await response.json()) as { tune: { tuneId: number } };

  return body.tune.tuneId;
}

function validStreamBody(overrides: Record<string, unknown> = {}) {
  return {
    videoId: 'abcdefghijk',
    videoType: 'live',
    title: '配信題',
    shortTitle: null,
    publishedAt: '2026-01-01T00:00:00Z',
    categories: [],
    keywords: [],
    memo: null,
    performances: [],
    ...overrides,
  };
}

async function createValidStream(overrides: Record<string, unknown> = {}): Promise<string> {
  const response = await createStream(env, validStreamBody(overrides));
  const body = (await response.json()) as { stream: { videoId: string } };

  return body.stream.videoId;
}

async function createPerformableStream(): Promise<{ videoId: string; tuneId: number; personId: number }> {
  const personId = await createValidPerson();
  const tuneId = await createValidTune({
    attributes: [{ name: '作曲', text: null, people: [{ personId, creditedAs: null, note: null }] }],
  });
  const videoId = await createValidStream({
    performances: [
      { tuneId, description: '演奏として', scenes: [{ style: 'play', videoId: 'zzzzzzzzzzz', startSeconds: 0 }] },
    ],
  });

  return { videoId, tuneId, personId };
}

/** The stream's fields as the edit screen sends them: what `GET` answers, with `overrides` typed over them. */
async function fieldsOf(videoId: string, overrides: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const body = (await (await getStream(env, videoId)).json()) as { stream: Record<string, unknown> };

  return { ...body.stream, ...overrides };
}

async function publish(videoId: string, overrides: Record<string, unknown> = {}): Promise<Response> {
  return await publishStream(env, videoId, await fieldsOf(videoId, overrides), NOW);
}

async function withdraw(videoId: string, overrides: Record<string, unknown> = {}): Promise<Response> {
  return await withdrawStream(env, videoId, await fieldsOf(videoId, overrides), NOW);
}

async function tuneFieldsOf(tuneId: number, overrides: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const body = (await (await getTune(env, tuneId)).json()) as { tune: Record<string, unknown> };

  return { ...body.tune, ...overrides };
}

interface PublishedMusic {
  published_at: string;
  shape_version?: number;
  channel_id?: string | null;
  streams: { video_id: string; title: string }[];
  tunes: { tune_id: number; title: string }[];
  people: { person_id: number; name: string }[];
}

async function readPublished(): Promise<PublishedMusic | null> {
  const object = await env.PUBLIC_DATA.get('genet/music.json');

  if (object === null) return null;

  return JSON.parse(await object.text());
}

async function streamStatus(videoId: string): Promise<string | undefined> {
  const row = await env.DB.prepare('SELECT status FROM genet_stream WHERE video_id = ?1')
    .bind(videoId)
    .first<{ status: string }>();

  return row?.status;
}

/** An env whose R2 refuses every write, as when R2 is down. */
function failingPutEnv(): typeof env {
  return {
    ...env,
    PUBLIC_DATA: {
      put: () => Promise.reject(new Error('R2 is down')),
      head: env.PUBLIC_DATA.head.bind(env.PUBLIC_DATA),
      get: env.PUBLIC_DATA.get.bind(env.PUBLIC_DATA),
    },
  } as unknown as typeof env;
}

describe('publishStream', () => {
  test('answers 404 for a stream that does not exist', async () => {
    expect((await publishStream(env, 'nope', validStreamBody(), NOW)).status).toEqual(404);
  });

  // The reads at the top of publishStream and its own batch are separate
  // round trips, so a concurrent deleteStream can land in between - rigs
  // env.DB.prepare to delete the stream (the same three DELETEs
  // deleteStream itself runs) right after the first read of the latest
  // revisions, the same moment a real race would land in. The batch then
  // finds no row: no performance is inserted, no `publish` revision is
  // logged for the stream, and the JSON already written with it is built
  // again without it.
  test('logs no revision for a stream deleted concurrently, and leaves it out of the JSON', async () => {
    const { videoId } = await createPerformableStream();
    const fields = await fieldsOf(videoId);
    const realPrepare = env.DB.prepare.bind(env.DB);
    let deleted = false;

    const riggedDB = {
      batch: env.DB.batch.bind(env.DB),
      prepare: (sql: string) => {
        const stmt = realPrepare(sql);

        if (!sql.startsWith('SELECT r.entity, r.entity_key, r.revision_id, r.action, r.body')) return stmt;

        return {
          bind: (...args: unknown[]) => {
            const bound = stmt.bind(...args);

            return {
              all: async <T = unknown>() => {
                const result = await bound.all<T>();

                if (!deleted) {
                  deleted = true;
                  await env.DB.batch([
                    env.DB.prepare('DELETE FROM genet_scene WHERE video_id = ?1').bind(videoId),
                    env.DB.prepare('DELETE FROM genet_performance WHERE video_id = ?1').bind(videoId),
                    env.DB.prepare('DELETE FROM genet_stream WHERE video_id = ?1').bind(videoId),
                  ]);
                }

                return result;
              },
              first: bound.first.bind(bound),
              run: bound.run.bind(bound),
              raw: bound.raw.bind(bound),
            };
          },
        };
      },
    };

    const response = await publishStream({ ...env, DB: riggedDB } as typeof env, videoId, fields, NOW);

    expect(response.status).toEqual(404);
    expect(await revisionRows('genet_stream')).toEqual([]);
    expect(await env.DB.prepare('SELECT count(*) AS n FROM genet_performance').first<{ n: number }>()).toEqual({
      n: 0,
    });
    expect((await readPublished())!.streams).toEqual([]);
  });

  test('publishes a ready stream, writes the JSON, and logs publish revisions for the stream, its tune and its person', async () => {
    const { videoId, tuneId, personId } = await createPerformableStream();

    const response = await publish(videoId);

    expect(response.status).toEqual(200);

    const body = (await response.json()) as {
      stream: { status: string };
      publicationId: number;
      tuneRevisionCount: number;
      personRevisionCount: number;
    };

    expect(body.stream.status).toEqual('published');
    expect(body.publicationId).toEqual(expect.any(Number));
    expect(body.tuneRevisionCount).toEqual(1);
    expect(body.personRevisionCount).toEqual(1);

    expect(await revisionRows('genet_stream')).toEqual([
      { entity_key: videoId, action: 'publish', body: expect.any(String) },
    ]);
    expect(await revisionRows('genet_tune')).toEqual([
      { entity_key: String(tuneId), action: 'publish', body: expect.any(String) },
    ]);
    expect(await revisionRows('genet_person')).toEqual([
      { entity_key: String(personId), action: 'publish', body: expect.any(String) },
    ]);

    const published = await readPublished();

    expect(published!.published_at).toEqual('2026-09-18T00:00:00Z');
    expect(published!.streams.map((s) => s.video_id)).toEqual([videoId]);
    expect(published!.tunes.map((t) => t.tune_id)).toEqual([tuneId]);
    expect(published!.people.map((p) => p.person_id)).toEqual([personId]);
    expect(
      await env.DB.prepare("SELECT target, object_key FROM publication WHERE target = 'genet_music'").first(),
    ).toEqual({ target: 'genet_music', object_key: 'genet/music.json' });
  });

  test('saves what is typed before publishing it', async () => {
    const { videoId } = await createPerformableStream();

    await publish(videoId, { title: '打ち直した題' });

    expect((await readPublished())!.streams[0]!.title).toEqual('打ち直した題');
    expect(((await fieldsOf(videoId)) as { title: string }).title).toEqual('打ち直した題');
  });

  test('does not log a tune/person revision the second time nothing about them changed', async () => {
    const { videoId } = await createPerformableStream();

    await publish(videoId);
    await withdraw(videoId);

    const response = await publish(videoId);
    const body = (await response.json()) as { tuneRevisionCount: number; personRevisionCount: number };

    expect(response.status).toEqual(200);
    expect(body.tuneRevisionCount).toEqual(0);
    expect(body.personRevisionCount).toEqual(0);
    expect(await revisionRows('genet_tune')).toHaveLength(1);
    expect(await revisionRows('genet_person')).toHaveLength(1);
  });

  test('refuses an empty title, saves the draft anyway, and logs nothing', async () => {
    const { videoId } = await createPerformableStream();

    const response = await publish(videoId, { title: '', memo: '書きかけ' });

    expect(response.status).toEqual(400);
    expect(await response.json()).toEqual({
      errors: ['タイトルを書いてください。'],
      problems: [{ field: 'title', performanceIndex: null, message: 'タイトルを書いてください。' }],
      saved: true,
    });
    expect(await revisionRows('genet_stream')).toEqual([]);
    expect(await streamStatus(videoId)).toEqual('draft');
    expect(((await fieldsOf(videoId)) as { memo: string }).memo).toEqual('書きかけ');
    expect(await readPublished()).toBeNull();
  });

  test('refuses a videoId that is not 11 characters, for a youtube stream', async () => {
    expect((await createStream(env, validStreamBody({ videoId: 'short' }))).status).toEqual(201);

    const response = await publish('short');

    expect(response.status).toEqual(400);
    expect(await response.json()).toMatchObject({
      problems: [
        { field: 'videoId', performanceIndex: null, message: '動画 ID は 11 文字です。いまは 5 文字です。' },
        { field: 'performances', performanceIndex: null, message: '曲を 1 曲以上足してください。' },
      ],
    });
  });

  // A performance naming a tune that does not exist, or a tune attribute
  // naming a person that does not exist, cannot be saved - genet_performance
  // and genet_tune_attribute_person point at them by foreign key, and
  // saving refuses an unknown id first - so publishing does not check again.

  test('refuses a scene videoId that is not 11 characters, naming its performance', async () => {
    const tuneId = await createValidTune();
    const videoId = await createValidStream({
      performances: [
        { tuneId, description: null, scenes: [] },
        { tuneId, description: null, scenes: [{ style: 'play', videoId: 'a'.repeat(19), startSeconds: 0 }] },
      ],
    });

    const response = await publish(videoId);

    expect(response.status).toEqual(400);
    expect(await response.json()).toMatchObject({
      problems: [
        {
          field: 'performances',
          performanceIndex: 1,
          message: '2 曲目の場面 1 の動画 ID は 11 文字です。いまは 19 文字です。',
        },
      ],
    });
  });

  test('publishes a tiktok stream whose stream and scene ids are 19 digits', async () => {
    const tiktokId = '7300000000000000001';
    const tuneId = await createValidTune();
    const videoId = await createValidStream({
      videoId: tiktokId,
      platform: 'tiktok',
      url: `https://www.tiktok.com/@example/video/${tiktokId}`,
      performances: [{ tuneId, description: null, scenes: [{ style: 'play', videoId: tiktokId, startSeconds: 0 }] }],
    });

    const response = await publish(videoId);

    expect(response.status).toEqual(200);
    expect(await revisionRows('genet_stream')).toEqual([
      { entity_key: tiktokId, action: 'publish', body: expect.any(String) },
    ]);
  });

  test('refuses a tune attribute with both text and people, once for a tune performed twice', async () => {
    const personId = await createValidPerson();
    const tuneId = await createValidTune({
      attributes: [
        { name: '作曲', text: null, people: [] },
        { name: '作詞', text: '文', people: [{ personId, creditedAs: null, note: null }] },
      ],
    });
    const videoId = await createValidStream({
      performances: [
        { tuneId, description: null, scenes: [] },
        { tuneId, description: null, scenes: [] },
      ],
    });

    const response = await publish(videoId);

    expect(response.status).toEqual(400);
    expect(((await response.json()) as { errors: string[] }).errors).toEqual([
      '1 曲目の作曲・作詞などの 2 番目に、文章と人物の両方が書かれています。どちらか一方にしてください。',
    ]);
  });

  test('collects every failing condition in one answer', async () => {
    const videoId = await createValidStream({ title: '', performances: [] });

    const body = (await (await publish(videoId)).json()) as { errors: string[] };

    expect(body.errors).toEqual(['タイトルを書いてください。', '曲を 1 曲以上足してください。']);
  });

  test('saves the fields and leaves the stream a draft when the JSON cannot be written', async () => {
    const { videoId } = await createPerformableStream();
    const response = await publishStream(failingPutEnv(), videoId, await fieldsOf(videoId, { title: '新しい題' }), NOW);

    expect(response.status).toEqual(502);
    expect(await response.json()).toMatchObject({ saved: true, stream: { status: 'draft', title: '新しい題' } });
    expect(await revisionRows('genet_stream')).toEqual([]);
  });
});

describe('saveStream', () => {
  test('saves a draft as a draft, and writes no JSON', async () => {
    const { videoId } = await createPerformableStream();

    const response = await saveStream(env, videoId, await fieldsOf(videoId, { title: '直した題' }), NOW);

    expect(response.status).toEqual(200);
    expect(await streamStatus(videoId)).toEqual('draft');
    expect(await revisionRows('genet_stream')).toEqual([]);
    expect(await readPublished()).toBeNull();
  });

  test('puts a published stream’s save in the JSON at once, with a fresh revision', async () => {
    const { videoId } = await createPerformableStream();

    await publish(videoId);

    const response = await saveStream(env, videoId, await fieldsOf(videoId, { title: '新しい題' }), NOW);

    expect(response.status).toEqual(200);
    expect(await revisionRows('genet_stream')).toHaveLength(2);
    expect((await readPublished())!.streams[0]!.title).toEqual('新しい題');
  });

  test('refuses a published stream’s save that would not pass, and leaves the stream and the JSON as they were', async () => {
    const { videoId } = await createPerformableStream();

    await publish(videoId);

    const response = await saveStream(env, videoId, await fieldsOf(videoId, { title: '' }), NOW);

    expect(response.status).toEqual(400);
    expect(await response.json()).toMatchObject({ saved: false });
    expect(((await fieldsOf(videoId)) as { title: string }).title).toEqual('配信題');
    expect((await readPublished())!.streams[0]!.title).toEqual('配信題');
    expect(await revisionRows('genet_stream')).toHaveLength(1);
  });
});

describe('withdrawStream', () => {
  test('answers 404 for a stream that does not exist', async () => {
    expect((await withdrawStream(env, 'nope', validStreamBody(), NOW)).status).toEqual(404);
  });

  test('answers 409 for a stream that is not published', async () => {
    const videoId = await createValidStream();

    expect((await withdraw(videoId)).status).toEqual(409);
  });

  test('takes the stream and what it alone performed out of the JSON, and keeps the tune/person revisions', async () => {
    const { videoId } = await createPerformableStream();

    await publish(videoId);

    const response = await withdraw(videoId, { memo: '戻した' });

    expect(response.status).toEqual(200);
    expect(((await response.json()) as { stream: { status: string; memo: string } }).stream).toMatchObject({
      status: 'draft',
      memo: '戻した',
    });

    const streamRows = await revisionRows('genet_stream');

    expect(streamRows[streamRows.length - 1]).toEqual({ entity_key: videoId, action: 'withdraw', body: null });
    expect(await revisionRows('genet_tune')).toHaveLength(1);
    expect(await revisionRows('genet_person')).toHaveLength(1);

    const published = await readPublished();

    expect(published!.streams).toEqual([]);
    expect(published!.tunes).toEqual([]);
    expect(published!.people).toEqual([]);
  });

  test('changes nothing when the JSON cannot be written', async () => {
    const { videoId } = await createPerformableStream();

    await publish(videoId);

    const response = await withdrawStream(failingPutEnv(), videoId, await fieldsOf(videoId), NOW);

    expect(response.status).toEqual(502);
    expect(await streamStatus(videoId)).toEqual('published');
    expect(await revisionRows('genet_stream')).toHaveLength(1);
  });
});

describe('saveTune', () => {
  test('saves a tune no published stream performs, and logs nothing', async () => {
    const { tuneId } = await createPerformableStream();

    const response = await saveTune(env, tuneId, await tuneFieldsOf(tuneId, { title: '直した曲名' }), NOW);

    expect(response.status).toEqual(200);
    expect(await response.json()).toMatchObject({ tune: { title: '直した曲名' }, live: false });
    expect(await revisionRows('genet_tune')).toEqual([]);
    expect(await readPublished()).toBeNull();
  });

  // #284's 6-5: the tune is shared, and the public JSON has it for every
  // published stream that performs it.
  test('puts the save of a tune a published stream performs in the JSON at once', async () => {
    const { videoId, tuneId } = await createPerformableStream();

    await publish(videoId);

    const response = await saveTune(env, tuneId, await tuneFieldsOf(tuneId, { title: '直した曲名' }), NOW);

    expect(response.status).toEqual(200);
    expect(await response.json()).toMatchObject({ tune: { title: '直した曲名' }, live: true });
    expect(await revisionRows('genet_tune')).toHaveLength(2);
    expect((await readPublished())!.tunes[0]!.title).toEqual('直した曲名');
  });

  test('brings along a person it names whose name changed since the last publish', async () => {
    const { videoId, tuneId, personId } = await createPerformableStream();

    await publish(videoId);
    await updatePerson(env, personId, { name: '新しい名前', link: null, memo: null });
    await saveTune(env, tuneId, await tuneFieldsOf(tuneId), NOW);

    expect(await revisionRows('genet_person')).toHaveLength(2);
    expect((await readPublished())!.people[0]!.name).toEqual('新しい名前');
  });

  test('refuses a tune that would not pass, and saves nothing', async () => {
    const { videoId, tuneId, personId } = await createPerformableStream();

    await publish(videoId);

    const response = await saveTune(
      env,
      tuneId,
      await tuneFieldsOf(tuneId, {
        title: '直した曲名',
        attributes: [{ name: '作曲', text: '文', people: [{ personId, creditedAs: null, note: null }] }],
      }),
      NOW,
    );

    expect(response.status).toEqual(400);
    expect(await response.json()).toEqual({
      errors: ['作曲・作詞などの 1 番目に、文章と人物の両方が書かれています。どちらか一方にしてください。'],
      problems: [
        {
          field: 'attributes',
          attributeIndex: 0,
          message: '作曲・作詞などの 1 番目に、文章と人物の両方が書かれています。どちらか一方にしてください。',
        },
      ],
      saved: false,
    });
    expect(((await tuneFieldsOf(tuneId)) as { title: string }).title).toEqual('曲名');
  });

  test('leaves a tune only a withdrawn stream performs out of the JSON', async () => {
    const { videoId, tuneId } = await createPerformableStream();

    await publish(videoId);
    await withdraw(videoId);

    const response = await saveTune(env, tuneId, await tuneFieldsOf(tuneId, { title: '直した曲名' }), NOW);

    expect(await response.json()).toMatchObject({ live: false });
    expect((await readPublished())!.tunes).toEqual([]);
  });

  test('saves the tune, and says so, when the JSON cannot be written', async () => {
    const { videoId, tuneId } = await createPerformableStream();

    await publish(videoId);

    const response = await saveTune(failingPutEnv(), tuneId, await tuneFieldsOf(tuneId, { title: '直した曲名' }), NOW);

    expect(response.status).toEqual(502);
    expect(await response.json()).toMatchObject({ saved: true, live: true, tune: { title: '直した曲名' } });
    expect(await revisionRows('genet_tune')).toHaveLength(1);
  });

  test('getTune says whether a published stream performs the tune', async () => {
    const { videoId, tuneId } = await createPerformableStream();

    expect(await (await getTune(env, tuneId)).json()).toMatchObject({ live: false });

    await publish(videoId);

    expect(await (await getTune(env, tuneId)).json()).toMatchObject({ live: true });
  });

  // The JSON is built from every stream whose latest revision is not a
  // withdraw (publishing.ts's liveBodiesOf), an import among them.
  test('counts a stream whose latest revision is an import, and not one withdrawn', async () => {
    const { videoId, tuneId } = await createPerformableStream();
    const body = JSON.stringify({ video_id: videoId, performances: [{ tune_id: tuneId }] });
    const record = (action: string, text: string | null) =>
      env.DB.prepare(
        `INSERT INTO revision (entity, entity_key, action, body, created_via) VALUES ('genet_stream', ?1, ?2, ?3, 'claude_code')`,
      )
        .bind(videoId, action, text)
        .run();

    await record('import', body);

    expect(await (await getTune(env, tuneId)).json()).toMatchObject({ live: true });

    await record('withdraw', null);

    expect(await (await getTune(env, tuneId)).json()).toMatchObject({ live: false });
  });
});

/** A `publish` revision recorded with no JSON written after it, as a publish from before #284 left one. */
async function recordWaiting(videoId: string, title: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO revision (entity, entity_key, action, body, created_via) VALUES ('genet_stream', ?1, 'publish', ?2, 'admin')`,
  )
    .bind(
      videoId,
      JSON.stringify({
        video_id: videoId,
        platform: 'youtube',
        url: null,
        video_type: 'live',
        title,
        short_title: null,
        published_at: '2026-01-01T00:00:00Z',
        categories: [],
        keywords: [],
        performances: [],
      }),
    )
    .run();
}

describe('pendingGenetMusic', () => {
  test('is empty after a publish, which wrote the JSON itself', async () => {
    const { videoId } = await createPerformableStream();

    await publish(videoId);

    expect(await (await pendingGenetMusic(env)).json()).toEqual({
      pending: [],
      changed: [],
      shapeOutdated: false,
      behind: false,
    });
  });

  test('lists a revision recorded with no JSON written after it', async () => {
    const { videoId } = await createPerformableStream();

    await publish(videoId);
    await recordWaiting(videoId, '前の題');

    const body = (await (await pendingGenetMusic(env)).json()) as { pending: unknown[] };

    expect(body.pending).toEqual([
      { entity: 'genet_stream', key: videoId, revisionId: expect.any(Number), latestAction: 'publish' },
    ]);
  });

  test('reports a published stream whose row no longer matches its revision as changed', async () => {
    const { videoId } = await createPerformableStream();

    await publish(videoId);
    await env.DB.prepare("UPDATE genet_stream SET title = '新しい題' WHERE video_id = ?1").bind(videoId).run();

    const body = (await (await pendingGenetMusic(env)).json()) as { changed: unknown[] };

    expect(body.changed).toEqual([{ entity: 'genet_stream', key: videoId, title: '新しい題' }]);
  });

  test('says the JSON may be behind while a write is not found up to date', async () => {
    await env.DB.prepare("INSERT INTO publication_write (target) VALUES ('genet_music')").run();

    expect(await (await pendingGenetMusic(env)).json()).toMatchObject({ behind: true });
  });

  // D1 refuses a statement bound to more than 100 parameters. readStreams
  // (genet-streams.ts) builds `IN (?1, ...)` from every published stream at
  // once - #144's real streaming.yml migration alone carries 113 of them -
  // so this stays green only because it chunks (worker/src/lib/d1.ts). The
  // streams are written straight to the tables: publishing 150 of them one
  // by one would write the JSON 150 times.
  test('reads more published streams than one D1 statement can bind', async () => {
    const count = 150;
    const statements: D1PreparedStatement[] = [];

    for (let i = 0; i < count; i++) {
      const videoId = `pub${String(i).padStart(8, '0')}`;

      statements.push(
        env.DB.prepare(
          `INSERT INTO genet_stream (video_id, video_type, title, published_at, status)
           VALUES (?1, 'live', ?1, '2026-01-01T00:00:00Z', 'published')`,
        ).bind(videoId),
      );
    }

    await env.DB.batch(statements);

    for (let i = 0; i < count; i++) {
      const videoId = `pub${String(i).padStart(8, '0')}`;

      await env.DB.prepare(
        `INSERT INTO revision (entity, entity_key, action, body, created_via) VALUES ('genet_stream', ?1, 'publish', ?2, 'admin')`,
      )
        .bind(
          videoId,
          JSON.stringify({
            video_id: videoId,
            platform: 'youtube',
            url: null,
            video_type: 'live',
            title: videoId,
            short_title: null,
            published_at: '2026-01-01T00:00:00Z',
            categories: [],
            keywords: [],
            performances: [],
          }),
        )
        .run();
    }

    const body = (await (await pendingGenetMusic(env)).json()) as {
      pending: { entity: string }[];
      changed: unknown[];
    };

    expect(body.pending.filter((row) => row.entity === 'genet_stream')).toHaveLength(count);
    expect(body.changed).toEqual([]);
  }, 20000);
});

describe('publishGenetMusicNow', () => {
  test('writes nothing and answers published: false when nothing is pending', async () => {
    const response = await publishGenetMusicNow(env, NOW);

    expect(await response.json()).toEqual({ published: false });
    expect(await readPublished()).toBeNull();
  });

  test('has nothing to do after a publish', async () => {
    const { videoId } = await createPerformableStream();

    await publish(videoId);

    expect(await (await publishGenetMusicNow(env, NOW)).json()).toEqual({ published: false });
  });

  test('builds the JSON from a revision left waiting, and adds a publication row', async () => {
    const { videoId } = await createPerformableStream();

    await publish(videoId);
    await recordWaiting(videoId, '前の題');

    const response = await publishGenetMusicNow(env, NOW);

    expect(await response.json()).toMatchObject({ published: true, streamCount: 1, tuneCount: 0, personCount: 0 });
    expect((await readPublished())!.streams[0]!.title).toEqual('前の題');
    expect(await (await pendingGenetMusic(env)).json()).toMatchObject({ pending: [] });
  });

  test('builds from a revision left waiting without reading the stored JSON first', async () => {
    const { videoId } = await createPerformableStream();

    await publish(videoId);
    await recordWaiting(videoId, '前の題');

    // A read of the stored JSON (its shape) that fails must not stop a build already asked for.
    const bucket = env.PUBLIC_DATA;
    const unreadable = new Proxy(bucket, {
      get(target, property) {
        if (property === 'get') return () => Promise.reject(new Error('R2 is down'));

        const value = Reflect.get(target, property) as unknown;

        return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value;
      },
    });

    const response = await publishGenetMusicNow({ ...env, PUBLIC_DATA: unreadable }, NOW);

    expect(await response.json()).toMatchObject({ published: true, streamCount: 1 });
  });

  test('builds the JSON again while it may be behind', async () => {
    const { videoId } = await createPerformableStream();

    await publish(videoId);
    await env.PUBLIC_DATA.put('genet/music.json', JSON.stringify({ shape_version: GENET_MUSIC_SHAPE_VERSION }));
    // A write R2 answered, as one left by a request that ended after it: a
    // write still on its way stays until a check after it (publishing.ts).
    await env.DB.prepare("INSERT INTO publication_write (target, finished) VALUES ('genet_music', 1)").run();

    expect(await (await publishGenetMusicNow(env, NOW)).json()).toMatchObject({ published: true, streamCount: 1 });
    expect((await readPublished())!.streams.map((s) => s.video_id)).toEqual([videoId]);
    expect(await (await pendingGenetMusic(env)).json()).toMatchObject({ behind: false });
  });
});

describe('the JSON', () => {
  test("does not hold a draft stream's tune or person, even though they exist", async () => {
    const personId = await createValidPerson();
    const unpublishedTuneId = await createValidTune({
      title: '未公開の曲',
      attributes: [{ name: '作曲', text: null, people: [{ personId, creditedAs: null, note: null }] }],
    });
    const publishedTuneId = await createValidTune({ title: '公開される曲' });

    await createValidStream({
      videoId: 'aaaaaaaaaaa',
      performances: [{ tuneId: unpublishedTuneId, description: null, scenes: [] }],
    }); // left as draft, never published

    const publishedVideoId = await createValidStream({
      videoId: 'bbbbbbbbbbb',
      performances: [{ tuneId: publishedTuneId, description: null, scenes: [] }],
    });

    await publish(publishedVideoId);

    const published = await readPublished();

    expect(published!.tunes.map((t) => t.tune_id)).toEqual([publishedTuneId]);
    expect(published!.people).toEqual([]);
  });

  test('keeps the other published streams when one is published', async () => {
    const tuneId = await createValidTune();
    const first = await createValidStream({
      videoId: 'aaaaaaaaaaa',
      performances: [{ tuneId, description: null, scenes: [] }],
    });
    const second = await createValidStream({
      videoId: 'bbbbbbbbbbb',
      performances: [{ tuneId, description: null, scenes: [] }],
    });

    await publish(first);
    await publish(second);

    expect((await readPublished())!.streams.map((s) => s.video_id).sort()).toEqual([first, second]);
  });

  test('orders streams by publishedAt descending, tunes and people by id ascending', async () => {
    const personA = await createValidPerson({ name: 'a' });
    const personB = await createValidPerson({ name: 'b' });
    const tuneA = await createValidTune({
      title: 'A',
      attributes: [{ name: '作曲', text: null, people: [{ personId: personB, creditedAs: null, note: null }] }],
    });
    const tuneB = await createValidTune({
      title: 'B',
      attributes: [{ name: '作曲', text: null, people: [{ personId: personA, creditedAs: null, note: null }] }],
    });

    const earlier = await createValidStream({
      videoId: 'aaaaaaaaaaa',
      publishedAt: '2026-01-01T00:00:00Z',
      performances: [{ tuneId: tuneA, description: null, scenes: [] }],
    });
    const later = await createValidStream({
      videoId: 'bbbbbbbbbbb',
      publishedAt: '2026-03-01T00:00:00Z',
      performances: [{ tuneId: tuneB, description: null, scenes: [] }],
    });

    await publish(earlier);
    await publish(later);

    const published = await readPublished();

    expect(published!.streams.map((s) => s.video_id)).toEqual([later, earlier]);
    expect(published!.tunes.map((t) => t.tune_id)).toEqual([tuneA, tuneB].sort((a, b) => a - b));
    expect(published!.people.map((p) => p.person_id)).toEqual([personA, personB].sort((a, b) => a - b));
  });
});

describe('the JSON: channel_id and shape_version', () => {
  const GENET = 'UCgenet00000000000000000';
  const GUEST = 'UCguest00000000000000000';
  const OTHER = 'UCother00000000000000000';

  async function insertVideo(videoId: string, channelId: string): Promise<void> {
    await env.DB.prepare(
      `INSERT INTO channel (channel_id, name, fullname, color_key, color_sub, color_light, color_back, activity_start_date)
       VALUES (?1, ?1, ?1, '#000000', '#000000', '#000000', '#000000', '2021-01-01')
       ON CONFLICT (channel_id) DO NOTHING`,
    )
      .bind(channelId)
      .run();
    await env.DB.prepare(
      `INSERT INTO video (video_id, channel_id, title, published_at, availability, live_broadcast_content, type, fetched_at)
       VALUES (?1, ?2, 't', '2026-01-01T00:00:00Z', 'public', 'none', 'streaming', '2026-01-01T00:00:00Z')`,
    )
      .bind(videoId, channelId)
      .run();
  }

  /** Eleven characters, the length a YouTube id has. */
  const youtubeId = (index: number) => `yt${String(index).padStart(9, '0')}`;

  /**
   * Publishes one stream per entry. A `channelId` also records, in `video`,
   * which channel that stream belongs to; a stream without one has no `video` row.
   */
  async function publishStreams(
    streams: { videoId: string; channelId?: string; platform?: 'youtube' | 'tiktok'; publishedAt?: string }[],
  ): Promise<void> {
    const tuneId = await createValidTune();

    for (const { videoId, channelId, platform, publishedAt } of streams) {
      if (channelId !== undefined) await insertVideo(videoId, channelId);

      await createValidStream({
        videoId,
        publishedAt: publishedAt ?? '2026-01-01T00:00:00Z',
        ...(platform === 'tiktok' ? { platform, url: `https://www.tiktok.com/@example/video/${videoId}` } : {}),
        performances: [{ tuneId, description: null, scenes: [] }],
      });
      await publish(videoId);
    }
  }

  async function published(): Promise<PublishedMusic> {
    return (await readPublished())!;
  }

  describe('channel_id', () => {
    test('is the channel most of the streams belong to, even when the first one is a collaboration', async () => {
      await publishStreams([
        // The newest stream comes first in the JSON, and it is the guest's.
        { videoId: youtubeId(4), channelId: GUEST, publishedAt: '2026-04-01T00:00:00Z' },
        { videoId: youtubeId(1), channelId: GENET, publishedAt: '2026-01-01T00:00:00Z' },
        { videoId: youtubeId(2), channelId: GENET, publishedAt: '2026-02-01T00:00:00Z' },
        { videoId: youtubeId(3), channelId: GENET, publishedAt: '2026-03-01T00:00:00Z' },
      ]);

      const json = await published();

      expect(json.streams[0]!.video_id).toEqual(youtubeId(4));
      expect(json.channel_id).toEqual(GENET);
    });

    test('adds up the counts of every chunk the lookup is split into', async () => {
      // 60 streams are read in two chunks of at most 50: 40 belong to one channel and 20 to another.
      // Seeded as revisions and built once: publishing them one by one would
      // write an ever larger JSON 60 times.
      const insert = env.DB.prepare(
        `INSERT INTO revision (entity, entity_key, action, body, created_via) VALUES ('genet_stream', ?1, 'publish', ?2, 'admin')`,
      );

      for (let index = 0; index < 60; index += 1) {
        const videoId = youtubeId(index);

        await insertVideo(videoId, index < 40 ? GENET : GUEST);
        await insert
          .bind(
            videoId,
            JSON.stringify({
              video_id: videoId,
              platform: 'youtube',
              published_at: '2026-01-01T00:00:00Z',
              performances: [],
            }),
          )
          .run();
      }

      expect(await (await publishGenetMusicNow(env, NOW)).json()).toMatchObject({ published: true, streamCount: 60 });
      expect((await published()).channel_id).toEqual(GENET);
    });

    test('leaves out TikTok streams and streams with no video row from the count', async () => {
      await publishStreams([
        { videoId: youtubeId(1), channelId: GENET },
        { videoId: youtubeId(2), channelId: GENET },
        { videoId: youtubeId(3), channelId: GUEST },
        // Not in `video` yet: cannot be matched, so it is not counted against anyone.
        { videoId: youtubeId(4) },
        { videoId: youtubeId(5) },
        { videoId: '7300000000000000001', platform: 'tiktok' },
        { videoId: '7300000000000000002', platform: 'tiktok' },
        { videoId: '7300000000000000003', platform: 'tiktok' },
      ]);

      expect((await published()).channel_id).toEqual(GENET);
    });

    test('is null when no stream can be matched to a video', async () => {
      await publishStreams([{ videoId: youtubeId(1) }, { videoId: youtubeId(2) }]);

      expect((await published()).channel_id).toBeNull();
    });

    test('is null when only TikTok streams are published', async () => {
      await publishStreams([{ videoId: '7300000000000000001', platform: 'tiktok' }]);

      expect((await published()).channel_id).toBeNull();
    });

    test('is null when two channels tie', async () => {
      await publishStreams([
        { videoId: youtubeId(1), channelId: GENET },
        { videoId: youtubeId(2), channelId: GUEST },
      ]);

      expect((await published()).channel_id).toBeNull();
    });

    test('is null when the leading channel has less than half of the matched streams', async () => {
      // 2 of 5: ahead of every other channel, but not clearly the page's own.
      await publishStreams([
        { videoId: youtubeId(1), channelId: GENET },
        { videoId: youtubeId(2), channelId: GENET },
        { videoId: youtubeId(3), channelId: GUEST },
        { videoId: youtubeId(4), channelId: OTHER },
        { videoId: youtubeId(5), channelId: 'UCthird000000000000000000' },
      ]);

      expect((await published()).channel_id).toBeNull();
    });

    test('is the leading channel when it has exactly half and every other one is behind it', async () => {
      // 2 of 4, the rest split: half is enough, and nothing is level with it.
      await publishStreams([
        { videoId: youtubeId(1), channelId: GENET },
        { videoId: youtubeId(2), channelId: GENET },
        { videoId: youtubeId(3), channelId: GUEST },
        { videoId: youtubeId(4), channelId: OTHER },
      ]);

      expect((await published()).channel_id).toEqual(GENET);
    });
  });

  describe('shape_version', () => {
    async function publishOneStream(): Promise<void> {
      await publishStreams([{ videoId: youtubeId(1), channelId: GENET }]);
    }

    test('is written into the JSON', async () => {
      await publishOneStream();

      expect((await published()).shape_version).toEqual(GENET_MUSIC_SHAPE_VERSION);
    });

    test('does not build again when the stored JSON has the current shape and nothing is newer', async () => {
      await publishOneStream();

      const response = await publishGenetMusicNow(env, NOW);

      expect(await response.json()).toEqual({ published: false });
    });

    test('builds again, with nothing newer, when the stored JSON has no shape_version', async () => {
      await publishOneStream();
      await env.PUBLIC_DATA.put(
        'genet/music.json',
        JSON.stringify({ published_at: '2026-01-01T00:00:00Z', streams: [], tunes: [], people: [] }),
      );

      const response = await publishGenetMusicNow(env, NOW);

      expect(await response.json()).toMatchObject({ published: true, streamCount: 1 });
      expect(await published()).toMatchObject({ shape_version: GENET_MUSIC_SHAPE_VERSION, channel_id: GENET });
    });

    test('builds again when the stored JSON says an older version', async () => {
      await publishOneStream();
      await env.PUBLIC_DATA.put(
        'genet/music.json',
        JSON.stringify({ shape_version: 1, published_at: 'x', streams: [], tunes: [], people: [] }),
      );

      const response = await publishGenetMusicNow(env, NOW);

      expect(await response.json()).toMatchObject({ published: true });
    });

    test('builds again when the stored JSON cannot be read', async () => {
      await publishOneStream();
      await env.PUBLIC_DATA.put('genet/music.json', 'not json {');

      const response = await publishGenetMusicNow(env, NOW);

      expect(await response.json()).toMatchObject({ published: true });
      expect((await published()).shape_version).toEqual(GENET_MUSIC_SHAPE_VERSION);
    });

    test('builds again when D1 says a run finished but the stored JSON is gone', async () => {
      // D1 and R2 do not share a transaction: the publication row can exist without the object it names.
      await publishOneStream();
      await env.PUBLIC_DATA.delete('genet/music.json');

      const response = await publishGenetMusicNow(env, NOW);

      expect(await response.json()).toMatchObject({ published: true });
      expect((await published()).shape_version).toEqual(GENET_MUSIC_SHAPE_VERSION);
    });

    test('does not build from an old shape when there is no revision at all', async () => {
      await env.PUBLIC_DATA.put('genet/music.json', JSON.stringify({ streams: [], tunes: [], people: [] }));

      const response = await publishGenetMusicNow(env, NOW);

      expect(await response.json()).toEqual({ published: false });
    });

    describe('reported by pendingGenetMusic', () => {
      async function pending(): Promise<{
        pending: unknown[];
        changed: unknown[];
        shapeOutdated: boolean;
        behind: boolean;
      }> {
        return (await pendingGenetMusic(env).then((r) => r.json())) as never;
      }

      // The screen enables "いま公開する" from this value, so it has to say
      // yes exactly when a run would build again: each state below is
      // checked both ways.
      const OLD_SHAPES: [string, () => Promise<unknown>][] = [
        [
          'a JSON with no shape_version',
          () =>
            env.PUBLIC_DATA.put(
              'genet/music.json',
              JSON.stringify({ published_at: 'x', streams: [], tunes: [], people: [] }),
            ),
        ],
        [
          'a JSON that names version 1',
          () =>
            env.PUBLIC_DATA.put(
              'genet/music.json',
              JSON.stringify({ shape_version: 1, published_at: 'x', streams: [], tunes: [], people: [] }),
            ),
        ],
        ['a JSON that cannot be read', () => env.PUBLIC_DATA.put('genet/music.json', 'not json {')],
        ['no stored JSON at all', () => env.PUBLIC_DATA.delete('genet/music.json')],
      ];

      test('is false when the stored JSON has the current shape', async () => {
        await publishOneStream();

        expect(await pending()).toEqual({ pending: [], changed: [], shapeOutdated: false, behind: false });
      });

      test.each(OLD_SHAPES)('is true, with nothing else waiting, for %s', async (_name, arrange) => {
        await publishOneStream();
        await arrange();

        expect(await pending()).toEqual({ pending: [], changed: [], shapeOutdated: true, behind: false });
      });

      test.each(OLD_SHAPES)('agrees with what a run does, for %s', async (_name, arrange) => {
        await publishOneStream();
        await arrange();

        const { shapeOutdated } = await pending();
        const response = await publishGenetMusicNow(env, NOW);

        expect(((await response.json()) as { published: boolean }).published).toEqual(shapeOutdated);
      });

      test('agrees with what a run does when the shape is current', async () => {
        await publishOneStream();

        const { shapeOutdated } = await pending();
        const response = await publishGenetMusicNow(env, NOW);

        expect(((await response.json()) as { published: boolean }).published).toEqual(shapeOutdated);
      });

      test('is false when there is no revision at all, whatever is stored', async () => {
        await env.PUBLIC_DATA.put('genet/music.json', JSON.stringify({ streams: [], tunes: [], people: [] }));

        expect((await pending()).shapeOutdated).toBe(false);
        expect(await (await publishGenetMusicNow(env, NOW)).json()).toEqual({ published: false });
      });
    });
  });
});
