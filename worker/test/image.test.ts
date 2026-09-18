import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';

import {
  isAllowedChannelIconHost,
  isVideoId,
  readChannelIconSize,
  readVideoThumbnailSize,
  relayChannelIcon,
  relayVideoThumbnail,
  resizeChannelIconUrl,
} from '../src/api/image';

/**
 * The image relay (#144, first stage). Endpoint behaviour is checked here
 * against a `Cache` double, the way worker/test/api.test.ts checks every
 * other endpoint - and separately, once, against workerd's own Cache API
 * (the last describe block), because a double cannot answer whether an image
 * body actually survives a round trip through the real thing.
 */

function testCache(): Cache & { size: () => number } {
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
    size: () => entries.size,
  } as unknown as Cache & { size: () => number };
}

async function insertChannel(channelId: string, thumbnailUrl: string | null): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO channel (channel_id, name, fullname, color_key, color_sub, color_light, color_back, activity_start_date, thumbnail_url)
     VALUES (?1, ?1, ?1, '#000000', '#000000', '#000000', '#000000', '2021-01-01', ?2)`,
  )
    .bind(channelId, thumbnailUrl)
    .run();
}

beforeEach(async () => {
  await env.DB.prepare('DELETE FROM channel_snapshot').run();
  await env.DB.prepare('DELETE FROM channel').run();
});

const request = (path: string) => new Request(`https://kemov.nanase.cc${path}`);

describe('pure functions', () => {
  test.each(['dQw4w9WgXcQ', 'aBc-DeF_012'])('%s is a video id', (id) => {
    expect(isVideoId(id)).toEqual(true);
  });

  test.each(['too-short', 'twelvecharas', 'has spaces!', ''])('%s is not a video id', (id) => {
    expect(isVideoId(id)).toEqual(false);
  });

  test('readVideoThumbnailSize defaults to mqdefault and refuses anything not offered', () => {
    expect(readVideoThumbnailSize(null)).toEqual('mqdefault');
    expect(readVideoThumbnailSize('hqdefault')).toEqual('hqdefault');
    expect(readVideoThumbnailSize('maxresdefault')).toBeNull();
  });

  test('readChannelIconSize defaults to 88 and refuses anything not offered', () => {
    expect(readChannelIconSize(null)).toEqual('88');
    expect(readChannelIconSize('176')).toEqual('176');
    expect(readChannelIconSize('512')).toBeNull();
  });

  test('isAllowedChannelIconHost accepts only the two hosts the collector writes', () => {
    expect(isAllowedChannelIconHost('https://yt3.ggpht.com/abc=s88-c-k-c0x00ffffff-no-rj')).toEqual(true);
    expect(isAllowedChannelIconHost('https://yt3.googleusercontent.com/abc')).toEqual(true);
    expect(isAllowedChannelIconHost('https://evil.example/abc')).toEqual(false);
    expect(isAllowedChannelIconHost('not a url')).toEqual(false);
  });

  test('resizeChannelIconUrl swaps the =s<n> YouTube already put in the URL', () => {
    expect(resizeChannelIconUrl('https://yt3.ggpht.com/abc=s88-c-k-c0x00ffffff-no-rj', '176')).toEqual(
      'https://yt3.ggpht.com/abc=s176-c-k-c0x00ffffff-no-rj',
    );
  });

  test('resizeChannelIconUrl leaves a URL with no size suffix untouched', () => {
    expect(resizeChannelIconUrl('https://yt3.ggpht.com/abc', '176')).toEqual('https://yt3.ggpht.com/abc');
  });
});

describe('relayVideoThumbnail', () => {
  test('refuses a videoId that is not shaped like one', async () => {
    const response = await relayVideoThumbnail(
      request('/api/image/video/nope'),
      testCache(),
      undefined,
      'nope',
      new URLSearchParams(),
    );

    expect(response.status).toEqual(400);
  });

  test('refuses a size this endpoint does not offer', async () => {
    const response = await relayVideoThumbnail(
      request('/api/image/video/dQw4w9WgXcQ?size=maxresdefault'),
      testCache(),
      undefined,
      'dQw4w9WgXcQ',
      new URLSearchParams('size=maxresdefault'),
    );

    expect(response.status).toEqual(400);
  });

  test('fetches once, answers the image, and serves the second request from cache', async () => {
    const cache = testCache();
    const fetchImpl = vi.fn<typeof fetch>(
      async () => new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'image/jpeg' } }),
    );

    const first = await relayVideoThumbnail(
      request('/api/image/video/dQw4w9WgXcQ'),
      cache,
      undefined,
      'dQw4w9WgXcQ',
      new URLSearchParams(),
      fetchImpl,
    );

    expect(first.status).toEqual(200);
    expect(first.headers.get('content-type')).toEqual('image/jpeg');
    expect(first.headers.get('x-kemov-relay')).toEqual('miss');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0]?.[0]).toEqual('https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg');

    const second = await relayVideoThumbnail(
      request('/api/image/video/dQw4w9WgXcQ'),
      cache,
      undefined,
      'dQw4w9WgXcQ',
      new URLSearchParams(),
      fetchImpl,
    );

    expect(second.status).toEqual(200);
    expect(second.headers.get('x-kemov-relay')).toEqual('hit');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test('a 429 from the image host is answered and cached as a failure, not retried within this call', async () => {
    const cache = testCache();
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response('rate limited', { status: 429 }));

    const first = await relayVideoThumbnail(
      request('/api/image/video/dQw4w9WgXcQ'),
      cache,
      undefined,
      'dQw4w9WgXcQ',
      new URLSearchParams(),
      fetchImpl,
    );

    expect(first.status).toEqual(429);
    expect(first.headers.get('x-kemov-relay')).toEqual('error');

    const second = await relayVideoThumbnail(
      request('/api/image/video/dQw4w9WgXcQ'),
      cache,
      undefined,
      'dQw4w9WgXcQ',
      new URLSearchParams(),
      fetchImpl,
    );

    // Still answered from the cached failure - fetchImpl is not asked again
    // within the minute this failure is kept for.
    expect(second.status).toEqual(429);
    expect(second.headers.get('x-kemov-relay')).toEqual('hit');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test('a network failure reaching the image host is answered as 502, not thrown', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      throw new Error('DNS resolution failed');
    });

    const response = await relayVideoThumbnail(
      request('/api/image/video/dQw4w9WgXcQ'),
      testCache(),
      undefined,
      'dQw4w9WgXcQ',
      new URLSearchParams(),
      fetchImpl,
    );

    expect(response.status).toEqual(502);
    expect(response.headers.get('x-kemov-relay')).toEqual('error');
  });
});

describe('relayChannelIcon', () => {
  test('answers 404 for a channel D1 does not know', async () => {
    const response = await relayChannelIcon(
      request('/api/image/channel/UCnope'),
      env,
      testCache(),
      undefined,
      'UCnope',
      new URLSearchParams(),
    );

    expect(response.status).toEqual(404);
  });

  test('answers 404 for a channel the collector has not fetched an icon for yet', async () => {
    await insertChannel('UCaaa', null);

    const response = await relayChannelIcon(
      request('/api/image/channel/UCaaa'),
      env,
      testCache(),
      undefined,
      'UCaaa',
      new URLSearchParams(),
    );

    expect(response.status).toEqual(404);
  });

  test('answers 502 rather than fetch when the stored icon is not hosted where expected', async () => {
    await insertChannel('UCaaa', 'https://evil.example/photo.jpg');

    const response = await relayChannelIcon(
      request('/api/image/channel/UCaaa'),
      env,
      testCache(),
      undefined,
      'UCaaa',
      new URLSearchParams(),
    );

    expect(response.status).toEqual(502);
  });

  test('refuses a size this endpoint does not offer', async () => {
    await insertChannel('UCaaa', 'https://yt3.ggpht.com/abc=s88-c-k-c0x00ffffff-no-rj');

    const response = await relayChannelIcon(
      request('/api/image/channel/UCaaa?size=999'),
      env,
      testCache(),
      undefined,
      'UCaaa',
      new URLSearchParams('size=999'),
    );

    expect(response.status).toEqual(400);
  });

  test('fetches the resized icon and serves the second request from cache', async () => {
    await insertChannel('UCaaa', 'https://yt3.ggpht.com/abc=s88-c-k-c0x00ffffff-no-rj');

    const cache = testCache();
    const fetchImpl = vi.fn<typeof fetch>(
      async () => new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'image/jpeg' } }),
    );

    const first = await relayChannelIcon(
      request('/api/image/channel/UCaaa?size=176'),
      env,
      cache,
      undefined,
      'UCaaa',
      new URLSearchParams('size=176'),
      fetchImpl,
    );

    expect(first.status).toEqual(200);
    expect(first.headers.get('x-kemov-relay')).toEqual('miss');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0]?.[0]).toEqual('https://yt3.ggpht.com/abc=s176-c-k-c0x00ffffff-no-rj');

    const second = await relayChannelIcon(
      request('/api/image/channel/UCaaa?size=176'),
      env,
      cache,
      undefined,
      'UCaaa',
      new URLSearchParams('size=176'),
      fetchImpl,
    );

    expect(second.headers.get('x-kemov-relay')).toEqual('hit');
    // The cache hit answers before D1 or the image host is asked again.
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test('a cache hit is not asked for again even with a different explicit size query', async () => {
    await insertChannel('UCaaa', 'https://yt3.ggpht.com/abc=s88-c-k-c0x00ffffff-no-rj');

    const cache = testCache();
    const fetchImpl = vi.fn<typeof fetch>(
      async () => new Response(new Uint8Array([1]), { status: 200, headers: { 'content-type': 'image/jpeg' } }),
    );

    await relayChannelIcon(
      request('/api/image/channel/UCaaa'),
      env,
      cache,
      undefined,
      'UCaaa',
      new URLSearchParams(),
      fetchImpl,
    );
    const second = await relayChannelIcon(
      request('/api/image/channel/UCaaa?size=88'),
      env,
      cache,
      undefined,
      'UCaaa',
      new URLSearchParams('size=88'),
      fetchImpl,
    );

    expect(second.headers.get('x-kemov-relay')).toEqual('hit');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

// Pins workerd's own Cache API for this endpoint specifically - see the same
// describe block in cache.test.ts for why a double cannot stand in for this.
// The handoff for #144 asked this to be checked before trusting any of the
// tests above to mean the store actually works: it does, here as there.
describe('the real Cache API', () => {
  test('a video thumbnail is a cache hit on the second request, and ctx.waitUntil is what stores it', async () => {
    const cache = caches.default;
    const videoId = 'zZ9-_0AbCdE'; // unique per test run's assertions, not a real id
    const fetchImpl = vi.fn<typeof fetch>(
      async () => new Response(new Uint8Array([9, 9, 9]), { status: 200, headers: { 'content-type': 'image/jpeg' } }),
    );
    const ctx = createExecutionContext();

    const first = await relayVideoThumbnail(
      request(`/api/image/video/${videoId}`),
      cache,
      ctx,
      videoId,
      new URLSearchParams(),
      fetchImpl,
    );

    expect(first.headers.get('x-kemov-relay')).toEqual('miss');
    await waitOnExecutionContext(ctx);

    const second = await relayVideoThumbnail(
      request(`/api/image/video/${videoId}`),
      cache,
      undefined,
      videoId,
      new URLSearchParams(),
      fetchImpl,
    );

    expect(second.status).toEqual(200);
    expect(second.headers.get('x-kemov-relay')).toEqual('hit');
    expect(second.headers.get('content-type')).toEqual('image/jpeg');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
