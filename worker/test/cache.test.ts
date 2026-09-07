import { BadRequest, cachedJson, CACHE_SECONDS, NotFound, STALE_SECONDS } from '../src/api/cache';

/**
 * The path that decides whether the site shows old numbers or nothing at all.
 *
 * The system this replaces fetched two static files and waited for both, so
 * one failing emptied the statistics table. Every test here is a way that can
 * happen and what should be shown instead.
 */

function testCache(): Cache {
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
  } as unknown as Cache;
}

const request = (path = '/api/channels') => new Request(`https://kemov.nanase.cc${path}`);
const at = (iso: string) => new Date(iso);

describe('cachedJson', () => {
  test('builds an answer when there is nothing stored', async () => {
    const cache = testCache();
    const response = await cachedJson(request(), cache, async () => ({ channels: [] }), at('2026-09-07T12:00:00Z'));

    expect(response.status).toEqual(200);
    expect(await response.json()).toEqual({ channels: [] });
    expect(response.headers.get('x-kemov-cache')).toEqual('miss');
  });

  test('serves a stored answer without building again', async () => {
    const cache = testCache();
    const build = vi.fn(async () => ({ n: 1 }));

    await cachedJson(request(), cache, build, at('2026-09-07T12:00:00Z'));

    const second = await cachedJson(request(), cache, build, at('2026-09-07T12:00:30Z'));

    expect(build).toHaveBeenCalledTimes(1);
    expect(second.headers.get('x-kemov-cache')).toEqual('fresh');
    expect(second.headers.get('x-kemov-stale-seconds')).toEqual('30');
    expect(await second.json()).toEqual({ n: 1 });
  });

  test('builds again once the stored answer is no longer fresh', async () => {
    const cache = testCache();
    const build = vi.fn(async () => ({ n: 1 }));

    const stored = at('2026-09-07T12:00:00Z');

    await cachedJson(request(), cache, build, stored);
    await cachedJson(request(), cache, build, new Date(stored.getTime() + (CACHE_SECONDS + 1) * 1000));

    expect(build).toHaveBeenCalledTimes(2);
  });

  // The whole point. D1 is unreachable, and the answer is yesterday's numbers
  // marked as yesterday's rather than an empty page.
  test('serves the last good answer when building fails', async () => {
    const cache = testCache();

    await cachedJson(request(), cache, async () => ({ n: 1 }), at('2026-09-07T12:00:00Z'));

    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const response = await cachedJson(
      request(),
      cache,
      async () => {
        throw new Error('D1 is not answering');
      },
      at('2026-09-07T13:00:00Z'),
    );

    expect(response.status).toEqual(200);
    expect(await response.json()).toEqual({ n: 1 });
    expect(response.headers.get('x-kemov-cache')).toEqual('stale');
    // Marked, not silently old. Serving an hour-old answer is only defensible
    // if the answer says it is an hour old.
    expect(response.headers.get('x-kemov-stale-seconds')).toEqual('3600');

    error.mockRestore();
  });

  test('stops serving the last good answer once it is too old', async () => {
    const cache = testCache();

    await cachedJson(request(), cache, async () => ({ n: 1 }), at('2026-09-07T00:00:00Z'));

    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const response = await cachedJson(
      request(),
      cache,
      async () => {
        throw new Error('D1 is not answering');
      },
      new Date(at('2026-09-07T00:00:00Z').getTime() + (STALE_SECONDS + 60) * 1000),
    );

    expect(response.status).toEqual(503);

    error.mockRestore();
  });

  // An empty 200 is harder to diagnose than a failure that says so, and #71's
  // monitoring needs something to alert on.
  test('reports the failure when there is nothing to fall back to', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const response = await cachedJson(request(), testCache(), async () => {
      throw new Error('D1 is not answering');
    });

    expect(response.status).toEqual(503);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining('cached') });

    error.mockRestore();
  });

  // An error is an answer, and every answer here says where it came from.
  // Without this a caller reading x-kemov-cache finds it on the successes and
  // missing on the failures, so "is this old?" becomes a question that has to
  // be asked differently depending on the outcome.
  test('says as much about an error as about an answer', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    const cases = [
      { thrown: new NotFound('no channel UCnope'), status: 404 },
      { thrown: new BadRequest('cursor is not one this issued'), status: 400 },
      { thrown: new Error('D1 is not answering'), status: 503 },
    ];

    for (const { thrown, status } of cases) {
      const response = await cachedJson(request(), testCache(), async () => {
        throw thrown;
      });

      expect(response.status).toEqual(status);
      expect(response.headers.get('x-kemov-cache')).toEqual('none');
      expect(response.headers.get('x-kemov-stale-seconds')).toEqual('0');
      // A 404 for a channel that is about to exist, and a 503 from a database
      // that is about to come back, must not be held by anything between here
      // and the caller.
      expect(response.headers.get('cache-control')).toEqual('no-store');
    }

    error.mockRestore();
  });

  // "No such channel" is cheap to work out again, and a stored one would
  // outlive the channel appearing.
  test('does not store an error where the next request would find it', async () => {
    const cache = testCache();

    await cachedJson(request(), cache, async () => {
      throw new NotFound('no channel UCnope');
    });

    const second = await cachedJson(request(), cache, async () => ({ n: 1 }));

    expect(second.status).toEqual(200);
    expect(await second.json()).toEqual({ n: 1 });
  });

  test('keeps one answer per URL', async () => {
    const cache = testCache();

    await cachedJson(request('/api/channels'), cache, async () => ({ which: 'channels' }), at('2026-09-07T12:00:00Z'));
    await cachedJson(request('/api/live'), cache, async () => ({ which: 'live' }), at('2026-09-07T12:00:00Z'));

    const channels = await cachedJson(
      request('/api/channels'),
      cache,
      async () => ({ which: 'rebuilt' }),
      at('2026-09-07T12:00:10Z'),
    );

    expect(await channels.json()).toEqual({ which: 'channels' });
  });

  // A query string is part of the URL, so a ranking by one metric must not be
  // answered with another metric's stored page.
  test('keeps the query string apart', async () => {
    const cache = testCache();

    await cachedJson(
      request('/api/videos/ranking?metric=viewCount'),
      cache,
      async () => ({ metric: 'viewCount' }),
      at('2026-09-07T12:00:00Z'),
    );

    const other = await cachedJson(
      request('/api/videos/ranking?metric=likeCount'),
      cache,
      async () => ({ metric: 'likeCount' }),
      at('2026-09-07T12:00:05Z'),
    );

    expect(await other.json()).toEqual({ metric: 'likeCount' });
  });
});
