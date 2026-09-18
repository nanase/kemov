import { env } from 'cloudflare:test';

import { createStream, deleteStream, getStream, listStreams, updateStream } from '../src/admin/genet-streams';
import { clearEverything } from './reset-db';

beforeEach(clearEverything);

async function insertTune(title = '曲'): Promise<number> {
  const inserted = await env.DB.prepare('INSERT INTO genet_tune (title) VALUES (?1)').bind(title).run();

  return inserted.meta.last_row_id;
}

function validBody(overrides: Record<string, unknown> = {}) {
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
  const response = await createStream(env, validBody(overrides));
  const body = (await response.json()) as { stream: { videoId: string } };

  return body.stream.videoId;
}

describe('listStreams', () => {
  test('is empty with no rows', async () => {
    expect(await (await listStreams(env, null, null)).json()).toEqual({ streams: [] });
  });

  test('narrows by status and by a substring of title', async () => {
    await createValidStream({ videoId: 'aaaaaaaaaaa', title: '歌枠' });
    await createValidStream({ videoId: 'bbbbbbbbbbb', title: '演奏配信' });

    const response = await listStreams(env, 'draft', '歌');
    const body = (await response.json()) as { streams: { videoId: string }[] };

    expect(body.streams.map((s) => s.videoId)).toEqual(['aaaaaaaaaaa']);
  });

  test('refuses an unknown status', async () => {
    expect((await listStreams(env, 'nope', null)).status).toEqual(400);
  });

  test('orders by publishedAt descending', async () => {
    await createValidStream({ videoId: 'aaaaaaaaaaa', publishedAt: '2026-01-01T00:00:00Z' });
    await createValidStream({ videoId: 'bbbbbbbbbbb', publishedAt: '2026-03-01T00:00:00Z' });

    const response = await listStreams(env, null, null);
    const body = (await response.json()) as { streams: { videoId: string }[] };

    expect(body.streams.map((s) => s.videoId)).toEqual(['bbbbbbbbbbb', 'aaaaaaaaaaa']);
  });
});

describe('createStream', () => {
  test('creates a stream in draft', async () => {
    const response = await createStream(env, validBody());

    expect(response.status).toEqual(201);

    const body = (await response.json()) as { stream: { status: string; platform: string; url: string | null } };

    expect(body.stream.status).toEqual('draft');
    expect(body.stream.platform).toEqual('youtube');
    expect(body.stream.url).toBeNull();
  });

  test('refuses a missing videoId', async () => {
    const body = validBody();

    delete (body as Record<string, unknown>).videoId;

    expect((await createStream(env, body)).status).toEqual(400);
  });

  test('refuses a videoId that already exists', async () => {
    await createValidStream();

    const response = await createStream(env, validBody());

    expect(response.status).toEqual(409);
  });

  test('refuses platform youtube with a non-null url', async () => {
    const response = await createStream(env, validBody({ url: 'https://example.com' }));

    expect(response.status).toEqual(400);
  });

  test('accepts platform tiktok with a url', async () => {
    const response = await createStream(
      env,
      validBody({ platform: 'tiktok', url: 'https://www.tiktok.com/@x/video/1' }),
    );

    expect(response.status).toEqual(201);
  });

  test('refuses platform tiktok with a null url', async () => {
    const response = await createStream(env, validBody({ platform: 'tiktok' }));

    expect(response.status).toEqual(400);
  });

  test('refuses an invalid publishedAt', async () => {
    const response = await createStream(env, validBody({ publishedAt: '2026/01/01 00:00' }));

    expect(response.status).toEqual(400);
  });

  // genet_performance.tune_id's foreign key is enforced, so without this
  // check a performance naming a tuneId that does not exist would fail the
  // whole batch with a raw constraint error instead of a 400.
  test('refuses a performance naming a tuneId that does not exist', async () => {
    const response = await createStream(
      env,
      validBody({ performances: [{ tuneId: 999, description: null, scenes: [] }] }),
    );

    expect(response.status).toEqual(400);
  });

  test('creates performances and scenes, in position order', async () => {
    const tuneId = await insertTune();

    const response = await createStream(
      env,
      validBody({
        performances: [
          {
            tuneId,
            description: '演奏として',
            scenes: [{ style: 'play', videoId: 'abcdefghijk', startSeconds: 100 }],
          },
        ],
      }),
    );

    expect(response.status).toEqual(201);

    const body = (await response.json()) as {
      stream: {
        performances: { tuneId: number; scenes: { style: string; videoId: string; startSeconds: number | null }[] }[];
      };
    };

    expect(body.stream.performances).toEqual([
      { tuneId, description: '演奏として', scenes: [{ style: 'play', videoId: 'abcdefghijk', startSeconds: 100 }] },
    ]);
  });

  test('refuses an unknown scene style', async () => {
    const tuneId = await insertTune();

    const response = await createStream(
      env,
      validBody({
        performances: [{ tuneId, description: null, scenes: [{ style: 'dance', videoId: 'x', startSeconds: null }] }],
      }),
    );

    expect(response.status).toEqual(400);
  });
});

describe('getStream', () => {
  test('answers 404 for a stream that does not exist', async () => {
    expect((await getStream(env, 'nope')).status).toEqual(404);
  });

  test('answers the saved stream', async () => {
    const videoId = await createValidStream();

    expect((await getStream(env, videoId)).status).toEqual(200);
  });
});

describe('updateStream', () => {
  test('answers 404 for a stream that does not exist', async () => {
    expect((await updateStream(env, 'nope', validBody())).status).toEqual(404);
  });

  test('replaces performances and scenes, and leaves status untouched', async () => {
    const tuneId = await insertTune();
    const videoId = await createValidStream({
      performances: [{ tuneId, description: null, scenes: [] }],
    });

    await env.DB.prepare(`UPDATE genet_stream SET status = 'published' WHERE video_id = ?1`).bind(videoId).run();

    const response = await updateStream(env, videoId, validBody({ title: '新しい題', performances: [] }));

    expect(response.status).toEqual(200);

    const body = (await response.json()) as { stream: { title: string; status: string; performances: unknown[] } };

    expect(body.stream.title).toEqual('新しい題');
    expect(body.stream.status).toEqual('published');
    expect(body.stream.performances).toEqual([]);

    const { results } = await env.DB.prepare('SELECT 1 FROM genet_performance WHERE video_id = ?1').bind(videoId).all();

    expect(results).toEqual([]);
  });
});

describe('deleteStream', () => {
  test('answers 404 for a stream that does not exist', async () => {
    expect((await deleteStream(env, 'nope')).status).toEqual(404);
  });

  test('deletes the stream and its performances/scenes', async () => {
    const tuneId = await insertTune();
    const videoId = await createValidStream({
      performances: [
        { tuneId, description: null, scenes: [{ style: 'play', videoId: 'abcdefghijk', startSeconds: 0 }] },
      ],
    });

    const response = await deleteStream(env, videoId);

    expect(response.status).toEqual(200);
    expect(await env.DB.prepare('SELECT 1 FROM genet_stream WHERE video_id = ?1').bind(videoId).first()).toBeNull();
    expect(
      await env.DB.prepare('SELECT 1 FROM genet_performance WHERE video_id = ?1').bind(videoId).first(),
    ).toBeNull();
    expect(await env.DB.prepare('SELECT 1 FROM genet_scene WHERE video_id = ?1').bind(videoId).first()).toBeNull();
  });

  test('refuses with 409 when the stream is published', async () => {
    const videoId = await createValidStream();

    await env.DB.prepare(`UPDATE genet_stream SET status = 'published' WHERE video_id = ?1`).bind(videoId).run();

    const response = await deleteStream(env, videoId);

    expect(response.status).toEqual(409);

    expect(await env.DB.prepare('SELECT 1 FROM genet_stream WHERE video_id = ?1').bind(videoId).first()).not.toBeNull();
  });
});
