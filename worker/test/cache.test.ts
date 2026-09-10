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

  // #110: /api/health answers 503 on a successful build, not on a thrown
  // error, so it must not go through errorWithCacheHeaders's no-store path -
  // it has to be cached and re-served like any other answer, status included.
  //
  // statusOf, not a status the builder attaches to its own answer: measured
  // against the real Cache API on workerd (not this file's in-memory
  // testCache), put() on a 503 Response neither throws nor stores anything -
  // match() for that same key comes back undefined every time. Storing every
  // entry at 200 and deciding the served status from the body afterwards, on
  // every path that can serve one, is what keeps a 503 answer cacheable at
  // all. See `caches.default` in the 'the real Cache API' describe below for
  // the regression test that would catch a return to the other design.
  describe('statusOf', () => {
    const jobs = [{ stale: true }];

    test('overrides 200 on a fresh build', async () => {
      const response = await cachedJson(
        request(),
        testCache(),
        async () => ({ jobs }),
        at('2026-09-07T12:00:00Z'),
        () => 503,
      );

      expect(response.status).toEqual(503);
      expect(await response.json()).toEqual({ jobs });
      // Still a normal answer, not an error: 'miss', not 'none', and cached
      // like any other build rather than refused with no-store.
      expect(response.headers.get('x-kemov-cache')).toEqual('miss');
      expect(response.headers.get('cache-control')).toEqual(`public, max-age=${CACHE_SECONDS}`);
    });

    // The status is read from the body again on every serve, not stored
    // alongside it: a fresh cache hit must answer whatever statusOf says of
    // the body now, which for a fixed statusOf is the same status, but the
    // point is that this path runs statusOf too rather than replaying a
    // status decided at build time.
    test('is applied again on a fresh cache hit', async () => {
      const cache = testCache();
      const build = vi.fn(async () => ({ jobs }));
      const statusOf = vi.fn(() => 503);

      await cachedJson(request(), cache, build, at('2026-09-07T12:00:00Z'), statusOf);
      const second = await cachedJson(request(), cache, build, at('2026-09-07T12:00:30Z'), statusOf);

      expect(build).toHaveBeenCalledTimes(1);
      expect(statusOf).toHaveBeenCalledTimes(2);
      expect(second.status).toEqual(503);
      expect(await second.json()).toEqual({ jobs });
      expect(second.headers.get('x-kemov-cache')).toEqual('fresh');
    });

    // The same, on the stale-after-D1-failure fallback: a caller reading a
    // six-hour-old answer while the database is down must still see the
    // status that body's own content implies, not a 200 because the fallback
    // path forgot to ask.
    test('is applied on the stale fallback after a build failure', async () => {
      const cache = testCache();
      const stored = at('2026-09-07T12:00:00Z');

      await cachedJson(
        request(),
        cache,
        async () => ({ jobs }),
        stored,
        () => 503,
      );

      const error = vi.spyOn(console, 'error').mockImplementation(() => {});
      const response = await cachedJson(
        request(),
        cache,
        async () => {
          throw new Error('D1 is not answering');
        },
        new Date(stored.getTime() + (CACHE_SECONDS + 1) * 1000),
        () => 503,
      );

      expect(response.status).toEqual(503);
      expect(response.headers.get('x-kemov-cache')).toEqual('stale');

      error.mockRestore();
    });

    test('defaults to 200 when the caller does not pass one', async () => {
      const response = await cachedJson(request(), testCache(), async () => ({ jobs: [] }));

      expect(response.status).toEqual(200);
    });
  });

  // #110's actual bug, reproduced against workerd's own Cache API rather than
  // this file's in-memory double, which cannot reproduce it: a double that
  // always stores whatever it is given cannot tell the difference between the
  // fix and the design it replaced.
  describe('the real Cache API', () => {
    // What the fix above is for: put() neither throws nor stores anything for
    // a Response with no cache-control header, regardless of status. Measured
    // directly against the API rather than inferred, because this file's
    // in-memory testCache stores whatever it is handed and cannot show it.
    test('put() silently stores nothing for a Response with no cache-control', async () => {
      const cache = caches.default;
      const key = new Request(`https://kemov.nanase.cc/api/__test-cache-real-no-control-${crypto.randomUUID()}`);
      const response = new Response(JSON.stringify({ jobs: [] }));

      await expect(cache.put(key, response)).resolves.toBeUndefined();
      expect(await cache.match(key)).toBeUndefined();
    });

    // The same, for a non-2xx response even with cache-control set: this is
    // #110's own bug, distinct from the one above, and the reason the status
    // a caller is answered with can no longer be read off the stored Response
    // itself - see statusOf on cachedJson.
    test('put() silently stores nothing for a non-2xx Response', async () => {
      const cache = caches.default;
      const key = new Request(`https://kemov.nanase.cc/api/__test-cache-real-503-${crypto.randomUUID()}`);
      const response = new Response(JSON.stringify({ jobs: [] }), {
        status: 503,
        headers: { 'cache-control': 'public, max-age=60' },
      });

      await expect(cache.put(key, response)).resolves.toBeUndefined();
      expect(await cache.match(key)).toBeUndefined();
    });

    // cachedJson itself, now proven against the real Cache API rather than
    // the in-memory double every other test in this file uses: a second
    // request must not rebuild, for a plain 200 answer as much as for a
    // statusOf'd one - both depend on the entry actually being stored.
    test('a plain answer is a cache hit on the second request', async () => {
      const cache = caches.default;
      const path = `/api/__test-cache-real-plain-${crypto.randomUUID()}`;
      const build = vi.fn(async () => ({ channels: [] }));

      await cachedJson(request(path), cache, build);
      const second = await cachedJson(request(path), cache, build);

      expect(build).toHaveBeenCalledTimes(1);
      expect(second.headers.get('x-kemov-cache')).toEqual('fresh');
      expect(await second.json()).toEqual({ channels: [] });
    });

    test('a statusOf answer is a cache hit on the second request, with the status reapplied', async () => {
      const cache = caches.default;
      const path = `/api/__test-cache-real-health-${crypto.randomUUID()}`;
      const build = vi.fn(async () => ({ jobs: [{ stale: true }] }));

      const first = await cachedJson(request(path), cache, build, undefined, () => 503);
      const second = await cachedJson(request(path), cache, build, undefined, () => 503);

      expect(build).toHaveBeenCalledTimes(1);
      expect(first.status).toEqual(503);
      expect(second.status).toEqual(503);
      expect(second.headers.get('x-kemov-cache')).toEqual('fresh');
      expect(await second.json()).toEqual({ jobs: [{ stale: true }] });
    });
  });
});
