import { env } from 'cloudflare:test';

import { handleApiRequest, ROUTE_QUERY } from '../src/api';
import { cacheKeyUrl } from '../src/api/cache';
import channelsSource from '../src/api/channels.ts?raw';
import healthSource from '../src/api/health.ts?raw';
import indexSource from '../src/api/index.ts?raw';
import liveSource from '../src/api/live.ts?raw';
import monthsSource from '../src/api/months.ts?raw';
import streamsSource from '../src/api/streams.ts?raw';
import videosSource from '../src/api/videos.ts?raw';

/**
 * What a cached answer is stored under: the path and the query parameters the
 * route reads, and nothing else.
 */

function testCache(): Cache & { keys: () => string[] } {
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
    keys: () => [...entries.keys()],
  } as unknown as Cache & { keys: () => string[] };
}

const get = (cache: Cache, path: string) => handleApiRequest(new Request(`https://kemov.nanase.cc${path}`), env, cache);

const state = async (cache: Cache, path: string) => (await get(cache, path)).headers.get('x-kemov-cache');

describe('cache key', () => {
  it('ignores a query parameter the route does not read', async () => {
    const cache = testCache();

    expect(await state(cache, '/api/months')).toBe('miss');
    expect(await state(cache, '/api/months?z=1')).toBe('fresh');
    expect(await state(cache, '/api/months?z=2&y=3')).toBe('fresh');
    expect(cache.keys()).toEqual(['https://kemov.nanase.cc/api/months']);
  });

  it('ignores a trailing or doubled slash', async () => {
    const cache = testCache();

    await get(cache, '/api/months');

    for (const path of ['/api/months/', '//api/months', '/api/months//', '///api/months///']) {
      expect(await state(cache, path), path).toBe('fresh');
    }

    expect(cache.keys()).toHaveLength(1);
  });

  it('keeps an empty segment inside the path apart from the path without it', () => {
    const url = new URL('https://kemov.nanase.cc/api/channels//videos');

    expect(cacheKeyUrl(url, ['api', 'channels', '', 'videos'], [])).not.toBe(
      cacheKeyUrl(url, ['api', 'channels', 'videos'], []),
    );
  });

  it('ignores a parameter on a route that reads none', async () => {
    const cache = testCache();

    await get(cache, '/api/videos/table');

    expect(await state(cache, '/api/videos/table?limit=5&cursor=x')).toBe('fresh');
  });

  it('keys on the parameters the route reads', async () => {
    const cache = testCache();

    await get(cache, '/api/videos/ranking?limit=5');

    expect(await state(cache, '/api/videos/ranking?limit=6')).toBe('miss');
    expect(await state(cache, '/api/videos/ranking?limit=5&metric=likeCount')).toBe('miss');
    expect(await state(cache, '/api/videos/ranking?limit=5&z=1')).toBe('fresh');
    expect(cache.keys()).toHaveLength(3);
  });

  it('keys the same whatever order the parameters come in', async () => {
    const cache = testCache();

    await get(cache, '/api/videos/ranking?limit=5&metric=likeCount');

    expect(await state(cache, '/api/videos/ranking?metric=likeCount&limit=5')).toBe('fresh');
  });

  it('keys a repeated parameter by its first value, as the handler reads it', async () => {
    const cache = testCache();

    await get(cache, '/api/videos/ranking?limit=5');

    expect(await state(cache, '/api/videos/ranking?limit=5&limit=7')).toBe('fresh');
    expect(await state(cache, '/api/videos/ranking?limit=7&limit=5')).toBe('miss');
  });

  it('keeps an empty parameter apart from an absent one', () => {
    const key = (search: string) =>
      cacheKeyUrl(
        new URL(`https://kemov.nanase.cc/api/channels/UC1/videos${search}`),
        ['api', 'channels', 'UC1', 'videos'],
        ['cursor'],
      );

    expect(key('?cursor=')).not.toBe(key(''));
  });

  it('keys a limit by the value the handler uses', async () => {
    const cache = testCache();

    await get(cache, '/api/videos/ranking?limit=100');

    for (const query of ['limit=5000', 'limit=0100', 'limit=100.0', 'limit=1e2']) {
      expect(await state(cache, `/api/videos/ranking?${query}`), query).toBe('fresh');
    }

    await get(cache, '/api/videos/ranking');

    for (const query of ['limit=abc', 'limit=0', 'limit=-3', 'limit=1.5', 'limit=10']) {
      expect(await state(cache, `/api/videos/ranking?${query}`), query).toBe('fresh');
    }

    await get(cache, '/api/channels/UC1/videos');

    expect(await state(cache, '/api/channels/UC1/videos?limit=junk')).toBe('fresh');
    expect(await state(cache, '/api/channels/UC1/videos?limit=999')).toBe('miss');
    expect(await state(cache, '/api/channels/UC1/videos?limit=200')).toBe('fresh');
  });

  it('keys the history on bucket, from and to', async () => {
    const cache = testCache();
    const base = '/api/channels/UC1/history?from=2026-01-01T00:00:00Z&to=2026-01-02T00:00:00Z';

    await get(cache, base);

    expect(await state(cache, `${base}&z=1`)).toBe('fresh');
    expect(await state(cache, `${base}&bucket=day`)).toBe('miss');
    expect(await state(cache, base.replace('01-02', '01-03'))).toBe('miss');
  });
});

describe('ROUTE_QUERY against the handlers', () => {
  const namesRead = (source: string) =>
    new Set(
      [...source.matchAll(/(?:(?:searchParams|params)\.(?:get|has|getAll)|readInstant)\(\s*'([^']+)'/g)].map(
        (match) => match[1],
      ),
    );

  /** The text of one function, up to the next top-level declaration. */
  const functionBody = (source: string, name: string) => {
    const start = source.indexOf(`function ${name}(`);

    expect(start, name).toBeGreaterThanOrEqual(0);

    const rest = source.slice(start + 1);
    const next = rest.search(/\n(?:export |async |function |const |\/\*\*)/);

    return next === -1 ? rest : rest.slice(0, next);
  };

  const between = (source: string, from: string, to: string) => {
    const start = source.indexOf(from);
    const end = source.indexOf(to, start);

    expect(start, from).toBeGreaterThanOrEqual(0);
    expect(end, to).toBeGreaterThan(start);

    return source.slice(start, end);
  };

  it('names every parameter the ranking route reads', () => {
    const read = new Set([
      ...namesRead(between(indexSource, "name === 'ranking'", "resource === 'channels' && name !== undefined")),
      ...namesRead(functionBody(videosSource, 'rankVideos')),
    ]);

    expect([...read].sort()).toEqual([...ROUTE_QUERY.ranking].sort());
  });

  it('names every parameter the channel videos route reads', () => {
    const read = new Set([
      ...namesRead(between(indexSource, "sub === 'videos'", "sub === 'history'")),
      ...namesRead(functionBody(videosSource, 'listVideos')),
    ]);

    expect([...read].sort()).toEqual([...ROUTE_QUERY.channelVideos].sort());
  });

  it('names every parameter the channel history route reads', () => {
    const read = new Set([
      ...namesRead(functionBody(channelsSource, 'readHistoryRange')),
      ...namesRead(functionBody(channelsSource, 'getHistory')),
    ]);

    expect([...read].sort()).toEqual([...ROUTE_QUERY.channelHistory].sort());
  });

  it('finds no query read in the handlers of the routes that take none', () => {
    for (const source of [healthSource, liveSource, monthsSource, streamsSource]) {
      expect(source).not.toMatch(/searchParams/);
    }

    expect(namesRead(functionBody(videosSource, 'videosTable'))).toEqual(new Set());
    expect(namesRead(functionBody(channelsSource, 'getChannel'))).toEqual(new Set());
    expect(namesRead(functionBody(channelsSource, 'listChannels'))).toEqual(new Set());
  });

  it('lists every parameter the router itself reads', () => {
    const listed = new Set<string>([
      ...ROUTE_QUERY.ranking,
      ...ROUTE_QUERY.channelVideos,
      ...ROUTE_QUERY.channelHistory,
    ]);

    for (const name of namesRead(indexSource)) expect(listed.has(name), name).toBe(true);
  });
});
