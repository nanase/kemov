import { env } from 'cloudflare:test';

import { createPerson } from '../src/admin/genet-people';
import { pendingGenetMusic, publishGenetMusicNow, publishStream, withdrawStream } from '../src/admin/genet-publish';
import { createStream, updateStream } from '../src/admin/genet-streams';
import { createTune } from '../src/admin/genet-tunes';
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

async function createValidTune(overrides: Record<string, unknown> = {}): Promise<number> {
  const response = await createTune(env, {
    title: '曲名',
    originalTitle: null,
    subtunes: [],
    attributes: [],
    videos: [],
    scores: [],
    memo: null,
    ...overrides,
  });
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

describe('publishStream', () => {
  test('answers 404 for a stream that does not exist', async () => {
    expect((await publishStream(env, 'nope')).status).toEqual(404);
  });

  // The reads at the top of publishStream and its own batch are separate
  // round trips, so a concurrent deleteStream can land in between - rigs
  // env.DB.prepare to delete the stream (the same three DELETEs
  // deleteStream itself runs) right after one of those reads resolves, the
  // same moment a real race would land in. The batch's UPDATE still runs
  // (SET on a gone row changes nothing) and the response still reports
  // success from the `saved` this call already read, but no `publish`
  // revision is logged for a stream no longer there to publish.
  test('logs no revision for a stream deleted concurrently, between the reads and the batch', async () => {
    const { videoId } = await createPerformableStream();
    const realPrepare = env.DB.prepare.bind(env.DB);

    const riggedDB = {
      batch: env.DB.batch.bind(env.DB),
      prepare: (sql: string) => {
        const stmt = realPrepare(sql);

        if (!sql.startsWith('SELECT r.entity_key, r.revision_id, r.action, r.body')) return stmt;

        return {
          bind: (...args: unknown[]) => {
            const bound = stmt.bind(...args);

            return {
              all: async <T = unknown>() => {
                const result = await bound.all<T>();

                await env.DB.batch([
                  env.DB.prepare('DELETE FROM genet_scene WHERE video_id = ?1').bind(videoId),
                  env.DB.prepare('DELETE FROM genet_performance WHERE video_id = ?1').bind(videoId),
                  env.DB.prepare('DELETE FROM genet_stream WHERE video_id = ?1').bind(videoId),
                ]);

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

    const response = await publishStream({ ...env, DB: riggedDB } as typeof env, videoId);
    const body = (await response.json()) as { revisionId?: number };

    expect(response.status).toEqual(200);
    expect(await revisionRows('genet_stream')).toEqual([]);
    // No revision was actually logged (the row was gone by the time the
    // guarded INSERT ran), so revisionId must not name one that was never
    // written - not even the last_row_id an unguarded read would still see.
    expect(body.revisionId).toBeUndefined();
  });

  test('publishes a ready stream and logs publish revisions for the stream, its tune and its person', async () => {
    const { videoId, tuneId, personId } = await createPerformableStream();

    const response = await publishStream(env, videoId);

    expect(response.status).toEqual(200);

    const body = (await response.json()) as {
      stream: { status: string };
      tuneRevisionCount: number;
      personRevisionCount: number;
    };

    expect(body.stream.status).toEqual('published');
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
  });

  test('does not log a tune/person revision the second time nothing about them changed', async () => {
    const { videoId } = await createPerformableStream();

    await publishStream(env, videoId);
    await withdrawStream(env, videoId);

    const response = await publishStream(env, videoId);
    const body = (await response.json()) as { tuneRevisionCount: number; personRevisionCount: number };

    expect(response.status).toEqual(200);
    expect(body.tuneRevisionCount).toEqual(0);
    expect(body.personRevisionCount).toEqual(0);
    expect(await revisionRows('genet_tune')).toHaveLength(1);
    expect(await revisionRows('genet_person')).toHaveLength(1);
  });

  test('refuses an empty title, and changes nothing', async () => {
    const { videoId } = await createPerformableStream();

    await updateStream(env, videoId, validStreamBody({ title: '', performances: [] }));

    const response = await publishStream(env, videoId);

    expect(response.status).toEqual(400);
    expect(await response.json()).toMatchObject({ errors: expect.arrayContaining(['title must not be empty']) });
    expect(await revisionRows('genet_stream')).toEqual([]);
  });

  test('refuses a videoId that is not 11 characters, for a youtube stream', async () => {
    const response1 = await createStream(env, validStreamBody({ videoId: 'short' }));

    expect(response1.status).toEqual(201);

    const response = await publishStream(env, 'short');

    expect(response.status).toEqual(400);
    expect(await response.json()).toMatchObject({ errors: expect.arrayContaining(['videoId must be 11 characters']) });
  });

  test('refuses no performances', async () => {
    const videoId = await createValidStream();

    const response = await publishStream(env, videoId);

    expect(response.status).toEqual(400);
    expect(await response.json()).toMatchObject({
      errors: expect.arrayContaining(['performances must have at least one tune']),
    });
  });

  // A performance naming a tune that does not exist, or a tune attribute
  // naming a person that does not exist, cannot actually be saved -
  // genet-streams.test.ts's and genet-tunes.test.ts's own "refuses an
  // unknown tuneId/personId" tests cover that, since genet_performance.tune_id
  // and genet_tune_attribute_person.person_id are both foreign keys D1
  // enforces. publishProblems still checks for them (see its own comment) as
  // a defense that cannot be exercised through this admin API alone.

  test('refuses a scene videoId that is not 11 characters', async () => {
    const tuneId = await createValidTune();
    const videoId = await createValidStream({
      performances: [{ tuneId, description: null, scenes: [{ style: 'play', videoId: 'short', startSeconds: 0 }] }],
    });

    const response = await publishStream(env, videoId);

    expect(response.status).toEqual(400);
    expect(await response.json()).toMatchObject({
      errors: expect.arrayContaining(['performances[0].scenes[0].videoId must be 11 characters']),
    });
  });

  test('refuses a tune attribute with both text and people', async () => {
    const personId = await createValidPerson();
    const tuneId = await createValidTune({
      attributes: [{ name: '作曲', text: '文', people: [{ personId, creditedAs: null, note: null }] }],
    });
    const videoId = await createValidStream({ performances: [{ tuneId, description: null, scenes: [] }] });

    const response = await publishStream(env, videoId);

    expect(response.status).toEqual(400);
    expect(await response.json()).toMatchObject({
      errors: expect.arrayContaining([`tune ${tuneId} attributes[0]: text and people must not both be present`]),
    });
  });

  test('collects every failing condition in one answer', async () => {
    const videoId = await createValidStream({ title: '', performances: [] });

    const response = await publishStream(env, videoId);
    const body = (await response.json()) as { errors: string[] };

    expect(body.errors).toEqual(
      expect.arrayContaining(['title must not be empty', 'performances must have at least one tune']),
    );
  });

  test('publishing an already-published stream is allowed, and logs a fresh revision matching the current row', async () => {
    const { videoId, tuneId } = await createPerformableStream();

    await publishStream(env, videoId);
    await updateStream(
      env,
      videoId,
      validStreamBody({
        title: '新しい題',
        performances: [
          { tuneId, description: '演奏として', scenes: [{ style: 'play', videoId: 'zzzzzzzzzzz', startSeconds: 0 }] },
        ],
      }),
    );

    const response = await publishStream(env, videoId);

    expect(response.status).toEqual(200);
    expect(await revisionRows('genet_stream')).toHaveLength(2);

    const rows = await revisionRows('genet_stream');

    expect(JSON.parse(rows[1].body!)).toMatchObject({ title: '新しい題' });
  });
});

describe('withdrawStream', () => {
  test('answers 404 for a stream that does not exist', async () => {
    expect((await withdrawStream(env, 'nope')).status).toEqual(404);
  });

  test('sets status to draft and logs a withdraw revision with a null body, without touching tune/person revisions', async () => {
    const { videoId } = await createPerformableStream();

    await publishStream(env, videoId);

    const response = await withdrawStream(env, videoId);

    expect(response.status).toEqual(200);

    const body = (await response.json()) as { stream: { status: string } };

    expect(body.stream.status).toEqual('draft');

    const streamRows = await revisionRows('genet_stream');

    expect(streamRows[streamRows.length - 1]).toEqual({ entity_key: videoId, action: 'withdraw', body: null });
    expect(await revisionRows('genet_tune')).toHaveLength(1);
    expect(await revisionRows('genet_person')).toHaveLength(1);
  });
});

describe('pendingGenetMusic', () => {
  test('lists a stream, tune and person whose latest revision has not been published yet', async () => {
    const { videoId, tuneId, personId } = await createPerformableStream();

    await publishStream(env, videoId);

    const response = await pendingGenetMusic(env);
    const body = (await response.json()) as { pending: { entity: string; key: string }[] };

    expect(body.pending).toEqual(
      expect.arrayContaining([
        { entity: 'genet_stream', key: videoId, revisionId: expect.any(Number), latestAction: 'publish' },
        { entity: 'genet_tune', key: String(tuneId), revisionId: expect.any(Number), latestAction: 'publish' },
        { entity: 'genet_person', key: String(personId), revisionId: expect.any(Number), latestAction: 'publish' },
      ]),
    );
  });

  test('is empty once "publish now" has caught up', async () => {
    const { videoId } = await createPerformableStream();

    await publishStream(env, videoId);
    await publishGenetMusicNow(env, NOW);

    const body = (await pendingGenetMusic(env).then((r) => r.json())) as { pending: unknown[] };

    expect(body.pending).toEqual([]);
  });

  test('reports a title edit on a published stream as changed', async () => {
    const { videoId, tuneId } = await createPerformableStream();

    await publishStream(env, videoId);
    await updateStream(
      env,
      videoId,
      validStreamBody({
        title: '新しい題',
        performances: [
          { tuneId, description: '演奏として', scenes: [{ style: 'play', videoId: 'zzzzzzzzzzz', startSeconds: 0 }] },
        ],
      }),
    );

    const body = (await pendingGenetMusic(env).then((r) => r.json())) as { changed: { entity: string; key: string }[] };

    expect(body.changed).toEqual(expect.arrayContaining([{ entity: 'genet_stream', key: videoId, title: '新しい題' }]));
  });

  // D1 refuses a statement bound to more than 100 parameters. readStreams
  // (genet-streams.ts) builds `IN (?1, ...)` from every published stream at
  // once - #144's real streaming.yml migration alone carries 113 of them -
  // so this stays green only because it chunks (worker/src/lib/d1.ts).
  test('reads more published streams than one D1 statement can bind', async () => {
    const { tuneId } = await createPerformableStream();
    const count = 150;

    for (let i = 0; i < count; i++) {
      const videoId = `pub${String(i).padStart(8, '0')}`;

      await createStream(env, validStreamBody({ videoId, performances: [{ tuneId, description: null, scenes: [] }] }));
      await publishStream(env, videoId);
    }

    const body = (await pendingGenetMusic(env).then((r) => r.json())) as {
      pending: { entity: string }[];
      changed: unknown[];
    };

    expect(body.pending.filter((row) => row.entity === 'genet_stream')).toHaveLength(count);
    expect(body.changed).toEqual([]);
  }, 20000);
});

describe('publishGenetMusicNow', () => {
  async function readPublished(): Promise<{
    published_at: string;
    streams: { video_id: string }[];
    tunes: { tune_id: number }[];
    people: { person_id: number }[];
  } | null> {
    const object = await env.PUBLIC_DATA.get('genet/music.json');

    if (object === null) return null;

    return JSON.parse(await object.text());
  }

  test('writes nothing and answers published: false when nothing is pending', async () => {
    const response = await publishGenetMusicNow(env, NOW);

    expect(await response.json()).toEqual({ published: false });
    expect(await readPublished()).toBeNull();
  });

  test('writes the JSON with the published stream, its tune and its person, and adds a publication row', async () => {
    const { videoId, tuneId, personId } = await createPerformableStream();

    await publishStream(env, videoId);

    const response = await publishGenetMusicNow(env, NOW);

    expect(response.status).toEqual(200);

    const body = (await response.json()) as {
      published: boolean;
      streamCount: number;
      tuneCount: number;
      personCount: number;
    };

    expect(body).toMatchObject({ published: true, streamCount: 1, tuneCount: 1, personCount: 1 });

    const published = await readPublished();

    expect(published!.published_at).toEqual('2026-09-18T00:00:00Z');
    expect(published!.streams.map((s) => s.video_id)).toEqual([videoId]);
    expect(published!.tunes.map((t) => t.tune_id)).toEqual([tuneId]);
    expect(published!.people.map((p) => p.person_id)).toEqual([personId]);

    const publication = await env.DB.prepare(
      "SELECT target, object_key FROM publication WHERE target = 'genet_music'",
    ).first();

    expect(publication).toEqual({ target: 'genet_music', object_key: 'genet/music.json' });
  });

  test('leaves out a stream whose latest revision is a withdraw, and the tune/person it alone performed', async () => {
    const { videoId } = await createPerformableStream();

    await publishStream(env, videoId);
    await withdrawStream(env, videoId);
    await publishGenetMusicNow(env, NOW);

    const published = await readPublished();

    expect(published!.streams).toEqual([]);
    expect(published!.tunes).toEqual([]);
    expect(published!.people).toEqual([]);
  });

  test("does not load an unpublished stream's tune/person even if they exist", async () => {
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

    await publishStream(env, publishedVideoId);
    await publishGenetMusicNow(env, NOW);

    const published = await readPublished();

    expect(published!.tunes.map((t) => t.tune_id)).toEqual([publishedTuneId]);
    expect(published!.people).toEqual([]);
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

    await publishStream(env, earlier);
    await publishStream(env, later);
    await publishGenetMusicNow(env, NOW);

    const published = await readPublished();

    expect(published!.streams.map((s) => s.video_id)).toEqual([later, earlier]);
    expect(published!.tunes.map((t) => t.tune_id)).toEqual([tuneA, tuneB].sort((a, b) => a - b));
    expect(published!.people.map((p) => p.person_id)).toEqual([personA, personB].sort((a, b) => a - b));
  });
});
