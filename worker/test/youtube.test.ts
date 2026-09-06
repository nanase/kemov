import { callYouTubeApi, chunkIds, uploadsPlaylistId, YOUTUBE_MAX_RESULTS } from '../src/lib/youtube';

describe('callYouTubeApi', () => {
  test('builds the URL from the base, the path, the params and the key', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ items: [] }), { status: 200 }));

    await callYouTubeApi('channels', 'k3y', { part: 'snippet,statistics', id: 'UCaaa,UCbbb' }, fetchImpl);

    // callYouTubeApi always calls fetchImpl with a URL, never a Request or a
    // plain string; the wider type here is only typeof fetch's own.
    const requestedUrl = new URL(fetchImpl.mock.calls[0][0] as string | URL);
    expect(requestedUrl.origin + requestedUrl.pathname).toEqual('https://www.googleapis.com/youtube/v3/channels');
    expect(requestedUrl.searchParams.get('part')).toEqual('snippet,statistics');
    expect(requestedUrl.searchParams.get('id')).toEqual('UCaaa,UCbbb');
    expect(requestedUrl.searchParams.get('key')).toEqual('k3y');
  });

  test('parses the JSON body on success', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ items: [{ id: 'UCaaa' }] }), { status: 200 }));

    await expect(callYouTubeApi('channels', 'k3y', {}, fetchImpl)).resolves.toEqual({ items: [{ id: 'UCaaa' }] });
  });

  test('throws on a non-2xx response instead of returning it', async () => {
    const fetchImpl = vi.fn(async () => new Response('quota exceeded', { status: 403 }));

    await expect(callYouTubeApi('channels', 'k3y', {}, fetchImpl)).rejects.toThrow(/403/);
  });
});

describe('uploadsPlaylistId', () => {
  // The only part that changes is the leading UC, so a channel id that happens
  // to contain UC further along keeps it.
  test('swaps the leading UC for UU and nothing else', () => {
    expect(uploadsPlaylistId('UCmYO-WfY7Tasry4D1YB4LJw')).toEqual('UUmYO-WfY7Tasry4D1YB4LJw');
    expect(uploadsPlaylistId('UCUCUC')).toEqual('UUUCUC');
  });
});

describe('chunkIds', () => {
  const ids = (count: number): string[] => Array.from({ length: count }, (_, index) => `v${index}`);

  test('leaves a list that fits in one call alone', () => {
    expect(chunkIds(ids(3))).toEqual([['v0', 'v1', 'v2']]);
  });

  test('fills a chunk exactly at the ceiling', () => {
    const chunks = chunkIds(ids(YOUTUBE_MAX_RESULTS));

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toHaveLength(YOUTUBE_MAX_RESULTS);
  });

  // The path callers do not reach today, because both video jobs cap what
  // they select at the ceiling. It is here so that a caller which stops
  // capping does not silently send an id list the API refuses.
  test('splits a longer list at the ceiling and keeps the order', () => {
    const chunks = chunkIds(ids(YOUTUBE_MAX_RESULTS + 2));

    expect(chunks.map((chunk) => chunk.length)).toEqual([YOUTUBE_MAX_RESULTS, 2]);
    expect(chunks.flat()).toEqual(ids(YOUTUBE_MAX_RESULTS + 2));
  });

  test('answers with no chunks at all for an empty list', () => {
    expect(chunkIds([])).toEqual([]);
  });
});
