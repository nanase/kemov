import type { Env } from '../lib/env';
import { cachedJson, errorWithCacheHeaders, NotFound } from './cache';
import { getChannel, getHistory, listChannels, readHistoryRange } from './channels';
import { health, statusFor } from './health';
import { relayChannelIcon, relayVideoThumbnail } from './image';
import { listLive } from './live';
import { monthsSeries } from './months';
import { publicDataResponse } from './public-data';
import { listStreams } from './streams';
import {
  DEFAULT_PAGE_SIZE,
  DEFAULT_RANKING_SIZE,
  listVideos,
  MAX_PAGE_SIZE,
  MAX_RANKING_SIZE,
  rankVideos,
  readKind,
  readLimit,
  readMetric,
  videosTable,
} from './videos';

/**
 * The HTTP API.
 *
 * Routing is a handful of comparisons rather than a library. The paths are
 * few, and a router would be a dependency carried into workerd to save a switch statement.
 *
 * Every reading endpoint goes through cachedJson, which is what makes "the
 * database is down" survivable: the last good answer is served, marked as
 * old. The site being replaced fetched two static files and waited for both,
 * so one failing emptied the statistics table with nothing to say why.
 */

export async function handleApiRequest(
  request: Request,
  env: Env,
  cacheImpl: Cache,
  ctx?: ExecutionContext,
): Promise<Response> {
  const url = new URL(request.url);
  const { pathname, searchParams } = url;

  // Reading only. Anything else is refused before a query is built rather
  // than after, so a POST cannot reach D1 by way of a path that ignores it.
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return errorWithCacheHeaders(405, `${request.method} is not allowed here`, { Allow: 'GET, HEAD' });
  }

  // A path of at most four parts, named rather than indexed, so that the
  // comparisons below read as the routes they are. An empty segment - '//' or
  // a trailing slash the trim did not take - matches nothing and falls through
  // to the 404 at the end.
  const segments = pathname.replace(/^\/+|\/+$/g, '').split('/');
  const [prefix, resource, name, sub] = segments;

  if (prefix !== 'api') return errorWithCacheHeaders(404, `no endpoint at ${pathname}`);

  const cached = (build: () => Promise<unknown>, statusOf?: (body: unknown) => number) =>
    cachedJson(request, cacheImpl, build, undefined, statusOf);

  // #110: the body always reports every job and table; the status is derived
  // from it by statusFor, so that a monitor of this endpoint's status code -
  // not yet chosen, see #115 - would not need to parse jobs and backup itself.
  if (segments.length === 2 && resource === 'health') return await cached(() => health(env), statusFor);
  if (segments.length === 2 && resource === 'live') return await cached(() => listLive(env));
  if (segments.length === 2 && resource === 'channels') return await cached(() => listChannels(env));
  if (segments.length === 2 && resource === 'months') return await cached(() => monthsSeries(env));
  if (segments.length === 2 && resource === 'streams') return await cached(() => listStreams(env));

  if (segments.length === 3 && resource === 'videos' && name === 'table') return await cached(() => videosTable(env));

  if (segments.length === 3 && resource === 'videos' && name === 'ranking') {
    const metric = readMetric(searchParams.get('metric'));

    if (metric === null) return errorWithCacheHeaders(400, `no ranking by ${searchParams.get('metric')}`);

    const requested = readKind(searchParams.get('type'));

    if ('error' in requested) return errorWithCacheHeaders(400, requested.error);

    const limit = readLimit(searchParams.get('limit'), DEFAULT_RANKING_SIZE, MAX_RANKING_SIZE);

    return await cached(() => rankVideos(env, metric, limit, requested.kind));
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

    if ('error' in range) return errorWithCacheHeaders(400, range.error);

    return await cached(() => getHistory(env, name, range.from, range.to, range.bucketSeconds));
  }

  // Not routed through cachedJson: the body is an image, not the JSON every
  // other endpoint here answers with, and the relay keeps its own cache
  // entries - one per id and size - rather than one per exact request URL.
  if (segments.length === 4 && resource === 'image' && name === 'channel' && sub !== undefined) {
    return await relayChannelIcon(request, env, cacheImpl, ctx, sub, searchParams);
  }

  if (segments.length === 4 && resource === 'image' && name === 'video' && sub !== undefined) {
    return await relayVideoThumbnail(request, cacheImpl, ctx, sub, searchParams);
  }

  // Not routed through cachedJson: the object in PUBLIC_DATA already carries
  // its own ETag and Last-Modified, which cachedJson's own storedAt/staleSeconds
  // headers have no use for, and unlike D1 there is no outage for it to answer
  // through - R2 either has the key or it does not.
  if (segments.length === 3 && resource === 'footprints' && name === 'events') {
    return await publicDataResponse(request, env, 'footprints/events.json');
  }

  if (segments.length === 3 && resource === 'genet' && name === 'music') {
    return await publicDataResponse(request, env, 'genet/music.json');
  }

  return errorWithCacheHeaders(404, `no endpoint at ${pathname}`);
}
