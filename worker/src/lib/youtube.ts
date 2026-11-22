const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';

/**
 * The most ids one call may name, and the most items one call may return.
 *
 * The API's own ceiling, and the same number for every endpoint here, so a
 * caller chunking an id list and a caller setting maxResults share it.
 */
export const YOUTUBE_MAX_RESULTS = 50;

/**
 * The playlist holding everything a channel has uploaded.
 *
 * YouTube derives it from the channel id by replacing the leading UC, and
 * publishes no other way to get it - contentDetails on Channels.list returns
 * the same string. Deriving it costs no quota, which is what lets #63 look at
 * all 11 channels on every ten-minute tick.
 */
export function uploadsPlaylistId(channelId: string): string {
  return `UU${channelId.slice(2)}`;
}

/** Splits ids into groups no larger than one call may name. */
export function chunkIds(ids: readonly string[], size: number = YOUTUBE_MAX_RESULTS): string[][] {
  const chunks: string[][] = [];

  for (let index = 0; index < ids.length; index += size) {
    chunks.push(ids.slice(index, index + size));
  }

  return chunks;
}

/**
 * A non-2xx answer from the Data API, with the status and the `reason` the API
 * gave (`quotaExceeded`, `channelNotFound`, ...), so a caller can tell one
 * failure from another without reading the message.
 */
export class YouTubeApiError extends Error {
  readonly status: number;
  /** The first `error.errors[].reason` of the body, or undefined when the body is not the API's JSON error. */
  readonly reason: string | undefined;

  constructor(path: string, status: number, body: string) {
    super(`YouTube API ${path} responded ${status}: ${body}`);
    this.name = 'YouTubeApiError';
    this.status = status;
    this.reason = reasonOf(body);
  }
}

function reasonOf(body: string): string | undefined {
  try {
    const reason = (JSON.parse(body) as { error?: { errors?: { reason?: unknown }[] } }).error?.errors?.[0]?.reason;

    return typeof reason === 'string' ? reason : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Calls one YouTube Data API v3 endpoint and parses the JSON body.
 *
 * Shared by every collector that talks to the Data API (#62 to #64): the base
 * URL, the `key` parameter and non-2xx handling are the same for all of them.
 * The chat replay in #65 does not come through here - it reads an internal
 * endpoint on another host, with no key of ours - and has lib/live-chat.ts
 * instead.
 *
 * fetchImpl defaults to the global fetch. A collector's own test overrides it,
 * because a test has no live key to call the real API with.
 */
export async function callYouTubeApi<T>(
  path: string,
  apiKey: string,
  params: Record<string, string>,
  fetchImpl: typeof fetch = fetch,
): Promise<T> {
  const url = new URL(`${YOUTUBE_API_BASE}/${path}`);

  for (const [name, value] of Object.entries(params)) {
    url.searchParams.set(name, value);
  }
  url.searchParams.set('key', apiKey);

  const response = await fetchImpl(url);

  if (!response.ok) {
    throw new YouTubeApiError(path, response.status, await response.text());
  }

  return (await response.json()) as T;
}
