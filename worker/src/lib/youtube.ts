const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';

/**
 * Calls one YouTube Data API v3 endpoint and parses the JSON body.
 *
 * Shared by every collector that talks to the API (#62 to #65): the base URL,
 * the `key` parameter and non-2xx handling are the same for all of them.
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
    throw new Error(`YouTube API ${path} responded ${response.status}: ${await response.text()}`);
  }

  return (await response.json()) as T;
}
