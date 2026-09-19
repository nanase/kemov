import type { Env } from '../lib/env';
import { jsonResponse } from '../lib/json';
import { errorWithCacheHeaders } from './cache';

/**
 * The image relay (#144, first stage).
 *
 * A browser reading a member's icon or a video's thumbnail straight from
 * YouTube sometimes gets a 429 - not because either URL is stale, but because
 * YouTube rate-limits by how often a viewer's own browser asks. This relay
 * puts the worker in between: it fetches the image once, on the first
 * request, and answers every request after that from the edge cache until
 * the entry ages out.
 *
 * Only an id is accepted, never a caller-supplied URL. A relay that fetches
 * whatever URL it is handed is an open proxy for someone else's bandwidth;
 * this one decides the fetch target itself from an id it has validated.
 *
 * The screens do not read this yet - `MemberAvatar.vue` and the pages' own
 * thumbnails still go straight to YouTube. That switch is the next stage,
 * once the pages built alongside this one have landed, so it does not
 * conflict with their own work in progress.
 */

const RELAY_FAILURE_CACHE_SECONDS = 60;

/** The relay's own verdict on how an answer was produced, for measurement. */
type RelayState = 'hit' | 'miss' | 'error';

function withRelayState(response: Response, state: RelayState): Response {
  const headers = new Headers(response.headers);

  headers.set('x-kemov-relay', state);

  return new Response(response.body, { status: response.status, headers });
}

/**
 * The cache key: the path plus the size actually served, never the rest of
 * the query string. A request with no `size` and one with the same value
 * spelled out explicitly must land on the same entry.
 */
function cacheKeyFor(request: Request, size: string): Request {
  const url = new URL(request.url);

  url.search = `?size=${size}`;

  return new Request(url.toString(), { method: 'GET' });
}

/**
 * The success answer, built over the image's bytes rather than over the
 * upstream body stream.
 *
 * `fetchAndCache` hands one answer to every request waiting on the same cold
 * key, and each of those is a different invocation. A stream belongs to the
 * invocation whose `fetch` opened it - reading it from another one fails with
 * "Cannot perform I/O on behalf of a different request" - while bytes already
 * in memory belong to nobody, so every waiter can clone and read them.
 */
function buildSuccessResponse(upstream: Response, body: ArrayBuffer, maxAgeSeconds: number): Response {
  const headers = new Headers();
  const contentType = upstream.headers.get('content-type');
  const etag = upstream.headers.get('etag');

  if (contentType !== null) headers.set('content-type', contentType);
  // Passed through as YouTube set it, never synthesised here - see the PR
  // description for why this relay does not generate its own.
  if (etag !== null) headers.set('etag', etag);
  headers.set('cache-control', `public, max-age=${maxAgeSeconds}`);

  return new Response(body, { status: 200, headers });
}

function buildFailureResponse(status: number, maxAgeSeconds: number): Response {
  return jsonResponse(
    { error: `the image host answered ${status}` },
    { status, headers: { 'cache-control': `public, max-age=${maxAgeSeconds}` } },
  );
}

/**
 * Answers with `built`, and stores it under `key` for the next request.
 *
 * `ctx` is undefined in the tests that call the relay functions directly
 * without going through the worker entry point - there the store is awaited
 * instead, so the test can still see the entry land. Everywhere else, the
 * store rides `ctx.waitUntil` so a slow write to the edge cache never holds
 * up the image itself.
 */
async function answerAndCache(
  key: Request,
  built: Response,
  cacheImpl: Cache,
  ctx: ExecutionContext | undefined,
  state: 'miss' | 'error',
): Promise<Response> {
  const store = () => cacheImpl.put(key, built.clone());

  if (ctx !== undefined) {
    ctx.waitUntil(store());
  } else {
    await store();
  }

  return withRelayState(built, state);
}

/**
 * Fetches `upstreamUrl` and answers from it, caching the result either way.
 *
 * A 429 or a 5xx from YouTube is answered as a failure of the relay too - the
 * screens already have their own fallback for an image that does not load -
 * but that failure is cached only for a minute, not for as long as a success:
 * this same request may well succeed shortly after, and a whole day of
 * refusing to try again would turn one rate-limited request into a day of
 * them.
 */
async function fetchAndCacheOnce(
  key: Request,
  upstreamUrl: string,
  cacheImpl: Cache,
  ctx: ExecutionContext | undefined,
  fetchImpl: typeof fetch,
  successSeconds: number,
): Promise<Response> {
  let upstream: Response;

  try {
    upstream = await fetchImpl(upstreamUrl);
  } catch (error) {
    console.error(`image: fetching ${upstreamUrl} failed`, error);

    return await answerAndCache(key, buildFailureResponse(502, RELAY_FAILURE_CACHE_SECONDS), cacheImpl, ctx, 'error');
  }

  if (!upstream.ok) {
    return await answerAndCache(
      key,
      buildFailureResponse(upstream.status, RELAY_FAILURE_CACHE_SECONDS),
      cacheImpl,
      ctx,
      'error',
    );
  }

  // Read in full before anything is shared: a thumbnail or an icon is tens of
  // kilobytes, and a body that fails halfway is the same failure as a fetch
  // that never answered.
  let body: ArrayBuffer;

  try {
    body = await upstream.arrayBuffer();
  } catch (error) {
    console.error(`image: reading ${upstreamUrl} failed`, error);

    return await answerAndCache(key, buildFailureResponse(502, RELAY_FAILURE_CACHE_SECONDS), cacheImpl, ctx, 'error');
  }

  return await answerAndCache(key, buildSuccessResponse(upstream, body, successSeconds), cacheImpl, ctx, 'miss');
}

/**
 * One cold key's fetch-and-cache work in flight, shared by every request
 * this isolate is answering for it right now.
 *
 * A page opens with a screenful of thumbnails at once, so a cold cache is
 * normally cold for several requests to the same id at the same moment, not
 * one - without this, each asked YouTube separately, multiplying exactly the
 * request volume #144 exists to cut, and whichever of them wrote the cache
 * last decided the answer everyone else gets. A slow failure finishing after
 * a fast success could overwrite a good, already-cached image with a cached
 * error for the next `RELAY_FAILURE_CACHE_SECONDS`. Coalescing them into one
 * shared fetch removes both problems: one fetch, one write, one outcome for
 * everyone waiting on it.
 *
 * This only coalesces within the isolate that happens to answer these
 * requests - two edge locations asked for the same cold id at the same
 * moment still each fetch and store on their own, since Cloudflare's Cache
 * API has no cross-isolate lock to coordinate that. `RELAY_FAILURE_CACHE_SECONDS`
 * bounds how long a failure from that narrower race can leave a good image
 * looking broken.
 */
const inFlight = new Map<string, Promise<Response>>();

async function fetchAndCache(
  key: Request,
  upstreamUrl: string,
  cacheImpl: Cache,
  ctx: ExecutionContext | undefined,
  fetchImpl: typeof fetch,
  successSeconds: number,
): Promise<Response> {
  const dedupeKey = key.url;
  const existing = inFlight.get(dedupeKey);

  if (existing !== undefined) return (await existing).clone();

  const promise = fetchAndCacheOnce(key, upstreamUrl, cacheImpl, ctx, fetchImpl, successSeconds);

  inFlight.set(dedupeKey, promise);

  try {
    return (await promise).clone();
  } finally {
    inFlight.delete(dedupeKey);
  }
}

// --- channel icon ---------------------------------------------------------

/**
 * The sizes a channel icon may be asked for, matching the `=s<n>-...` YouTube
 * already serves the icon at. 88 is what the site's own avatars use today.
 */
export const CHANNEL_ICON_SIZES = ['48', '88', '176'] as const;
export type ChannelIconSize = (typeof CHANNEL_ICON_SIZES)[number];

const DEFAULT_CHANNEL_ICON_SIZE: ChannelIconSize = '88';

/** A `size` query value for the channel endpoint, or null when it names none of CHANNEL_ICON_SIZES. */
export function readChannelIconSize(value: string | null): ChannelIconSize | null {
  if (value === null) return DEFAULT_CHANNEL_ICON_SIZE;

  return (CHANNEL_ICON_SIZES as readonly string[]).includes(value) ? (value as ChannelIconSize) : null;
}

/**
 * Where `channel.thumbnail_url` is allowed to point.
 *
 * The value is written by the collector from Channels.list (see
 * ../collector/channel-stats.ts) and never edited by hand, but this relay
 * fetches whatever it finds there - refusing an unexpected host means a row
 * that somehow held something else can never turn this endpoint into an open
 * relay for it.
 */
const ALLOWED_CHANNEL_ICON_HOSTS = new Set(['yt3.ggpht.com', 'yt3.googleusercontent.com']);

export function isAllowedChannelIconHost(url: string): boolean {
  try {
    return ALLOWED_CHANNEL_ICON_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

/** The `=s<n>` YouTube appends to a channel icon URL, ahead of its own `-c-k-...` modifiers. */
const ICON_SIZE_SUFFIX = /=s\d+(?=-|$)/;

/**
 * Swaps the size baked into a channel icon URL, or returns it unchanged when
 * the URL is not in the shape this expects. An unrecognised shape is answered
 * at whatever size YouTube already put in the URL rather than refused - #144
 * asks for a relay, not a second place a thumbnail can go missing.
 */
export function resizeChannelIconUrl(url: string, size: ChannelIconSize): string {
  return ICON_SIZE_SUFFIX.test(url) ? url.replace(ICON_SIZE_SUFFIX, `=s${size}`) : url;
}

const CHANNEL_ICON_CACHE_SECONDS = 24 * 60 * 60;

/**
 * GET /api/image/channel/:channelId
 *
 * `channel.thumbnail_url` is read rather than `channel_snapshot`: the
 * snapshot table holds only the three counts each tick writes (see
 * ../collector/channel-stats.ts), and the icon URL has never been one of
 * them - it lives on `channel` itself, updated in place on every successful
 * fetch. There is only ever one to choose between.
 */
export async function relayChannelIcon(
  request: Request,
  env: Env,
  cacheImpl: Cache,
  ctx: ExecutionContext | undefined,
  channelId: string,
  searchParams: URLSearchParams,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  const size = readChannelIconSize(searchParams.get('size'));

  if (size === null) {
    return errorWithCacheHeaders(400, `size must be one of ${CHANNEL_ICON_SIZES.join(', ')}`);
  }

  const key = cacheKeyFor(request, size);
  const cached = await cacheImpl.match(key);

  if (cached !== undefined) return withRelayState(cached, 'hit');

  const row = await env.DB.prepare('SELECT thumbnail_url FROM channel WHERE channel_id = ?1')
    .bind(channelId)
    .first<{ thumbnail_url: string | null }>();

  if (row === null || row.thumbnail_url === null) {
    return errorWithCacheHeaders(404, `no icon for channel ${channelId}`);
  }

  if (!isAllowedChannelIconHost(row.thumbnail_url)) {
    return errorWithCacheHeaders(502, `channel ${channelId}'s stored icon is not hosted where expected`);
  }

  return await fetchAndCache(
    key,
    resizeChannelIconUrl(row.thumbnail_url, size),
    cacheImpl,
    ctx,
    fetchImpl,
    CHANNEL_ICON_CACHE_SECONDS,
  );
}

// --- video thumbnail -------------------------------------------------------

/** The sizes a video thumbnail may be asked for - i.ytimg.com's own file names. */
export const VIDEO_THUMBNAIL_SIZES = ['default', 'mqdefault', 'hqdefault'] as const;
export type VideoThumbnailSize = (typeof VIDEO_THUMBNAIL_SIZES)[number];

const DEFAULT_VIDEO_THUMBNAIL_SIZE: VideoThumbnailSize = 'mqdefault';

/** A `size` query value for the video endpoint, or null when it names none of VIDEO_THUMBNAIL_SIZES. */
export function readVideoThumbnailSize(value: string | null): VideoThumbnailSize | null {
  if (value === null) return DEFAULT_VIDEO_THUMBNAIL_SIZE;

  return (VIDEO_THUMBNAIL_SIZES as readonly string[]).includes(value) ? (value as VideoThumbnailSize) : null;
}

/** A YouTube video id's shape - 11 characters, never checked against D1 for this endpoint. */
const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

export function isVideoId(value: string): boolean {
  return VIDEO_ID_PATTERN.test(value);
}

const VIDEO_THUMBNAIL_CACHE_SECONDS = 7 * 24 * 60 * 60;

/**
 * GET /api/image/video/:videoId
 *
 * D1 is not read here, unlike the channel icon above: a thumbnail's address
 * is built from the id alone, the same way `src/lib/youtube.ts` already
 * builds one for the browser to fetch directly, so there is nothing to look
 * up and nothing that could be missing from `video` for this to fail on.
 */
export async function relayVideoThumbnail(
  request: Request,
  cacheImpl: Cache,
  ctx: ExecutionContext | undefined,
  videoId: string,
  searchParams: URLSearchParams,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  if (!isVideoId(videoId)) return errorWithCacheHeaders(400, `${videoId} is not a video id`);

  const size = readVideoThumbnailSize(searchParams.get('size'));

  if (size === null) {
    return errorWithCacheHeaders(400, `size must be one of ${VIDEO_THUMBNAIL_SIZES.join(', ')}`);
  }

  const key = cacheKeyFor(request, size);
  const cached = await cacheImpl.match(key);

  if (cached !== undefined) return withRelayState(cached, 'hit');

  return await fetchAndCache(
    key,
    `https://i.ytimg.com/vi/${videoId}/${size}.jpg`,
    cacheImpl,
    ctx,
    fetchImpl,
    VIDEO_THUMBNAIL_CACHE_SECONDS,
  );
}
