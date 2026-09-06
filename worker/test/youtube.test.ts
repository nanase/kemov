import { callYouTubeApi } from '../src/lib/youtube';

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
