import { env } from 'cloudflare:test';

import { handleApiRequest } from '../src/api';

/**
 * The routing and the shape of what comes back. What each endpoint computes is
 * checked in its own file; this checks that a URL reaches it, that a URL that
 * reaches nothing says so, and that the cache headers every answer carries are
 * there.
 */

/**
 * A Cache the tests own.
 *
 * caches.default exists on workerd, but a test isolate keeps nothing in it
 * between files and a cache that never hits would let every path through
 * cachedJson pass without being taken. This one is a Map, so a test can put
 * something in it and see it come back out.
 */
function testCache(): Cache & { size: () => number } {
  const entries = new Map<string, Response>();

  return {
    async match(request: RequestInfo | URL) {
      const stored = entries.get(new Request(request as RequestInfo).url);

      return stored === undefined ? undefined : stored.clone();
    },
    async put(request: RequestInfo | URL, response: Response) {
      entries.set(new Request(request as RequestInfo).url, response.clone());
    },
    async delete() {
      return false;
    },
    size: () => entries.size,
  } as unknown as Cache & { size: () => number };
}

const get = (path: string, cache: Cache = testCache()) =>
  handleApiRequest(new Request(`https://kemov.nanase.cc${path}`), env, cache);

async function insertChannel(channelId: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO channel (channel_id, name, fullname, color_key, color_sub, color_light, color_back, activity_start_date)
     VALUES (?1, ?1, ?1, '#000000', '#000000', '#000000', '#000000', '2021-01-01')`,
  )
    .bind(channelId)
    .run();
}

async function clearBucket(): Promise<void> {
  const listed = await env.BACKUP.list();

  await Promise.all(listed.objects.map((object) => env.BACKUP.delete(object.key)));
}

beforeEach(async () => {
  await env.DB.prepare('DELETE FROM channel_snapshot').run();
  await env.DB.prepare('DELETE FROM video').run();
  await env.DB.prepare('DELETE FROM channel').run();
  // #110's /api/health tests below read collect_task and BACKUP; the D1 and
  // R2 a test file gets are not rolled back between its own tests (see
  // setup.ts), so this file needs the same cleanup health.test.ts does.
  await env.DB.prepare('DELETE FROM collect_task').run();
  await clearBucket();
});

describe('routing', () => {
  test('answers 404 for a path outside the API', async () => {
    expect((await get('/')).status).toEqual(404);
    expect((await get('/index.html')).status).toEqual(404);
  });

  test('answers 404 for an API path that is not an endpoint', async () => {
    const response = await get('/api/nothing');

    expect(response.status).toEqual(404);
    expect(await response.json()).toEqual({ error: 'no endpoint at /api/nothing' });
  });

  test('names the path it did not match, without the query string', async () => {
    expect(await (await get('/api/nope?limit=10')).json()).toEqual({ error: 'no endpoint at /api/nope' });
  });

  // Every endpoint reads. A method that is not a read is refused before a
  // query is built, rather than by a route that happens not to look.
  test('refuses a method that is not a read', async () => {
    const response = await handleApiRequest(
      new Request('https://kemov.nanase.cc/api/channels', { method: 'POST' }),
      env,
      testCache(),
    );

    expect(response.status).toEqual(405);
  });

  test('reaches each endpoint that needs no parameters', async () => {
    for (const path of ['/api/live', '/api/channels', '/api/videos/ranking']) {
      expect((await get(path)).status).toEqual(200);
    }
  });

  // Not among the above: with no jobs run and no backup written, /api/health
  // answers 503 by #110's own rule, which health.test.ts covers. This only
  // checks the router reaches it at all.
  test('reaches /api/health', async () => {
    expect((await get('/api/health')).status).not.toEqual(404);
  });

  test('narrows a ranking to one kind of video', async () => {
    for (const kind of ['streaming', 'video', 'shorts']) {
      const response = await get(`/api/videos/ranking?type=${kind}`);

      expect(response.status).toEqual(200);
      expect(await response.json()).toMatchObject({ kind });
    }
  });

  test('answers 404 for a channel that is not there', async () => {
    const response = await get('/api/channels/UCnope');

    expect(response.status).toEqual(404);
    expect(await response.json()).toEqual({ error: 'no channel UCnope' });
  });

  test('reaches a channel that is there', async () => {
    await insertChannel('UCaaa');

    expect((await get('/api/channels/UCaaa')).status).toEqual(200);
    expect((await get('/api/channels/UCaaa/videos')).status).toEqual(200);
    expect((await get('/api/channels/UCaaa/history')).status).toEqual(200);
  });
});

describe('what every answer carries', () => {
  test('is JSON', async () => {
    expect((await get('/api/health')).headers.get('content-type')).toEqual('application/json; charset=UTF-8');
  });

  test('says whether it came from the cache and how old it is', async () => {
    const response = await get('/api/health');

    expect(response.headers.get('x-kemov-cache')).toEqual('miss');
    expect(response.headers.get('x-kemov-stale-seconds')).toEqual('0');
  });

  test('may be cached by the edge for a minute', async () => {
    expect((await get('/api/health')).headers.get('cache-control')).toEqual('public, max-age=60');
  });

  // The answers that are errors carry them too, including the ones the router
  // gives before a builder is reached. A caller checking these headers finds
  // them on every response rather than on the successes only.
  test('says the same on a refusal as on an answer', async () => {
    const responses = [
      await get('/api/nothing'),
      await get('/api/channels/UCnope'),
      await get('/api/videos/ranking?metric=charisma'),
      await handleApiRequest(new Request('https://kemov.nanase.cc/api/channels', { method: 'POST' }), env, testCache()),
    ];

    expect(responses.map((response) => response.status)).toEqual([404, 404, 400, 405]);

    for (const response of responses) {
      expect(response.headers.get('x-kemov-cache')).toEqual('none');
      expect(response.headers.get('x-kemov-stale-seconds')).toEqual('0');
      // Nothing between here and the caller may hold a refusal: the path that
      // is 404 now is the one an endpoint is about to be added at.
      expect(response.headers.get('cache-control')).toEqual('no-store');
    }
  });
});

describe('bad requests', () => {
  test('refuses a ranking metric it does not offer', async () => {
    const response = await get('/api/videos/ranking?metric=charisma');

    expect(response.status).toEqual(400);
    expect(await response.json()).toEqual({ error: 'no ranking by charisma' });
  });

  test('refuses a video type it does not have', async () => {
    const response = await get('/api/videos/ranking?type=podcast');

    expect(response.status).toEqual(400);
    expect(await response.json()).toEqual({ error: 'no videos of type podcast' });
  });

  test('refuses a history bucket it does not offer', async () => {
    await insertChannel('UCaaa');

    const response = await get('/api/channels/UCaaa/history?bucket=fortnight');

    expect(response.status).toEqual(400);
  });

  test('refuses a history range that runs backwards', async () => {
    await insertChannel('UCaaa');

    const response = await get('/api/channels/UCaaa/history?from=2026-09-07T00:00:00Z&to=2026-09-01T00:00:00Z');

    expect(response.status).toEqual(400);
    expect(await response.json()).toEqual({ error: 'from is after to' });
  });

  test('refuses a history range longer than it will serve', async () => {
    await insertChannel('UCaaa');

    const response = await get('/api/channels/UCaaa/history?from=2020-01-01T00:00:00Z&to=2026-09-07T00:00:00Z');

    expect(response.status).toEqual(400);
  });

  test('refuses a cursor it did not issue', async () => {
    await insertChannel('UCaaa');

    const response = await get('/api/channels/UCaaa/videos?cursor=not-a-cursor');

    expect(response.status).toEqual(400);
  });

  // A limit outside the range is clamped rather than refused: the caller gets
  // an answer, and one it can page through, instead of an error over a number
  // that has an obvious sensible reading.
  test('clamps a limit rather than refusing it', async () => {
    await insertChannel('UCaaa');

    expect((await get('/api/channels/UCaaa/videos?limit=99999')).status).toEqual(200);
    expect((await get('/api/channels/UCaaa/videos?limit=0')).status).toEqual(200);
    expect((await get('/api/channels/UCaaa/videos?limit=nonsense')).status).toEqual(200);
  });
});

// #110: the one endpoint whose success is not always 200. What each field is
// graded on is health.test.ts's job; this checks the wiring from health() to
// the HTTP status, and that the 60-second cache keeps the two together.
describe('/api/health', () => {
  async function seedHealthy(): Promise<void> {
    const recent = new Date().toISOString().slice(0, 19) + 'Z';

    for (const kind of ['channel_stats', 'video_discover', 'video_update']) {
      await env.DB.prepare(
        `INSERT INTO collect_task (kind, target_id, state, attempts, next_attempt_at, updated_at)
         VALUES (?1, 'UCaaa', 'done', 1, NULL, ?2)`,
      )
        .bind(kind, recent)
        .run();
    }

    const today = new Date().toISOString().slice(0, 10);

    await env.BACKUP.put(`video/${today}.sql`, '');
    await env.BACKUP.put(`channel/${today}.sql`, '');
    await env.BACKUP.put(`channel_snapshot/${today}.sql`, '');
  }

  test('answers 200 when every job and table is within its threshold', async () => {
    await seedHealthy();

    const response = await get('/api/health');

    expect(response.status).toEqual(200);
    expect(await response.json()).toMatchObject({
      jobs: expect.arrayContaining([expect.objectContaining({ stale: false })]),
    });
  });

  test('answers 503 when nothing has ever run', async () => {
    const response = await get('/api/health');

    expect(response.status).toEqual(503);
    expect(await response.json()).toMatchObject({
      jobs: expect.arrayContaining([expect.objectContaining({ stale: true })]),
    });
  });

  // The 60-second cache must never serve one request's body with another
  // request's status - a 503 body read as 200, or the reverse.
  test('serves the same status and body on a cache hit as it built', async () => {
    const cache = testCache();

    const first = await get('/api/health', cache);
    const firstBody = await first.json();

    const second = await get('/api/health', cache);

    expect(first.status).toEqual(503);
    expect(second.status).toEqual(first.status);
    expect(second.headers.get('x-kemov-cache')).toEqual('fresh');
    expect(await second.json()).toEqual(firstBody);
  });
});
