import type { Env } from '../lib/env';
import { errorResponse } from '../lib/json';
import { cachedJson, NotFound } from './cache';
import { getChannel, getHistory, listChannels, readHistoryRange } from './channels';
import { health } from './health';
import { listLive } from './live';
import {
  DEFAULT_PAGE_SIZE,
  DEFAULT_RANKING_SIZE,
  listVideos,
  MAX_PAGE_SIZE,
  MAX_RANKING_SIZE,
  rankVideos,
  readLimit,
  readMetric,
} from './videos';

/**
 * The HTTP API.
 *
 * Routing is a handful of comparisons rather than a library. There are seven
 * paths, two of them with one parameter, and a router would be a dependency
 * carried into workerd to save a switch statement.
 *
 * Every reading endpoint goes through cachedJson, which is what makes "the
 * database is down" survivable: the last good answer is served, marked as
 * old. The site being replaced fetched two static files and waited for both,
 * so one failing emptied the statistics table with nothing to say why.
 */

export async function handleApiRequest(request: Request, env: Env, cacheImpl: Cache): Promise<Response> {
  const url = new URL(request.url);
  const { pathname, searchParams } = url;

  // Reading only. Anything else is refused before a query is built rather
  // than after, so a POST cannot reach D1 by way of a path that ignores it.
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return errorResponse(405, `${request.method} is not allowed here`);
  }

  // A path of at most four parts, named rather than indexed, so that the
  // comparisons below read as the routes they are. An empty segment - '//' or
  // a trailing slash the trim did not take - matches nothing and falls through
  // to the 404 at the end.
  const segments = pathname.replace(/^\/+|\/+$/g, '').split('/');
  const [prefix, resource, name, sub] = segments;

  if (prefix !== 'api') return errorResponse(404, `no endpoint at ${pathname}`);

  const cached = (build: () => Promise<unknown>) => cachedJson(request, cacheImpl, build);

  if (segments.length === 2 && resource === 'health') return await cached(() => health(env));
  if (segments.length === 2 && resource === 'live') return await cached(() => listLive(env));
  if (segments.length === 2 && resource === 'channels') return await cached(() => listChannels(env));

  if (segments.length === 3 && resource === 'videos' && name === 'ranking') {
    const metric = readMetric(searchParams.get('metric'));

    if (metric === null) return errorResponse(400, `no ranking by ${searchParams.get('metric')}`);

    const limit = readLimit(searchParams.get('limit'), DEFAULT_RANKING_SIZE, MAX_RANKING_SIZE);

    return await cached(() => rankVideos(env, metric, limit));
  }

  if (segments.length === 3 && resource === 'channels' && name !== undefined) {
    const channelId = name;

    return await cached(async () => {
      const channel = await getChannel(env, channelId);

      if (channel === null) throw new NotFound(`no channel ${channelId}`);

      return channel;
    });
  }

  if (segments.length === 4 && resource === 'channels' && sub === 'videos' && name !== undefined) {
    const limit = readLimit(searchParams.get('limit'), DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const cursor = searchParams.get('cursor');

    return await cached(() => listVideos(env, name, { limit, cursor }));
  }

  if (segments.length === 4 && resource === 'channels' && sub === 'history' && name !== undefined) {
    const range = readHistoryRange(searchParams, new Date());

    if ('error' in range) return errorResponse(400, range.error);

    return await cached(() => getHistory(env, name, range.from, range.to, range.bucketSeconds));
  }

  return errorResponse(404, `no endpoint at ${pathname}`);
}
