import { env } from 'cloudflare:test';

import { handleAdminRequest } from '../src/admin';
import { lookupChannel } from '../src/admin/channel-lookup';
import type { CertsCache } from '../src/lib/access';
import { certsFetch, signedAccessToken } from './access-token';
import { clearEverything } from './reset-db';

beforeEach(clearEverything);

const CHANNEL_ID = 'UC0123456789abcdefghijkl';
const ICON_URL = 'https://yt3.ggpht.com/abc=s88-c-k-c0x00ffffff-no-rj';
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

interface Calls {
  youtube: URL[];
  images: { url: string; init: RequestInit | undefined }[];
}

/** A fetch that stands in for YouTube: Channels.list answers `list`, an image URL answers `image`. */
function fakeFetch(
  list: () => Response,
  image: () => Response = () => new Response(PNG, { headers: { 'content-type': 'image/png' } }),
): { fetchImpl: typeof fetch; calls: Calls } {
  const calls: Calls = { youtube: [], images: [] };
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input);

    if (url.hostname === 'www.googleapis.com') {
      calls.youtube.push(url);
      return list();
    }

    calls.images.push({ url: url.href, init });
    return image();
  }) as typeof fetch;

  return { fetchImpl, calls };
}

function channelsList(iconUrl: string | null = ICON_URL, title = 'つばき'): Response {
  return Response.json({
    items: [
      {
        id: CHANNEL_ID,
        snippet: { title, thumbnails: { default: iconUrl === null ? undefined : { url: iconUrl } } },
      },
    ],
  });
}

async function lookup(fetchImpl: typeof fetch, channelId = CHANNEL_ID): Promise<Response> {
  return await lookupChannel({ ...env, YOUTUBE_API_KEY: 'test-key' }, channelId, fetchImpl);
}

describe('lookupChannel', () => {
  test('answers the title and the icon as a data: URL', async () => {
    const { fetchImpl, calls } = fakeFetch(() => channelsList());

    const response = await lookup(fetchImpl);

    expect(response.status).toEqual(200);
    expect(await response.json()).toEqual({
      channelId: CHANNEL_ID,
      title: 'つばき',
      iconDataUrl: `data:image/png;base64,${btoa(String.fromCharCode(...PNG))}`,
    });
    expect(calls.youtube).toHaveLength(1);
    expect(calls.youtube[0]!.searchParams.get('part')).toEqual('snippet');
    expect(calls.youtube[0]!.searchParams.get('id')).toEqual(CHANNEL_ID);
    expect(calls.images.map((call) => call.url)).toEqual(['https://yt3.ggpht.com/abc=s176-c-k-c0x00ffffff-no-rj']);
    expect(calls.images[0]!.init?.redirect).toEqual('error');
  });

  test('answers 404 when Channels.list returns no such channel', async () => {
    const { fetchImpl, calls } = fakeFetch(() => Response.json({ pageInfo: { totalResults: 0 } }));

    const response = await lookup(fetchImpl);

    expect(response.status).toEqual(404);
    expect(calls.images).toEqual([]);
  });

  test('answers 404 when the only item is a different channel', async () => {
    const { fetchImpl } = fakeFetch(() => Response.json({ items: [{ id: 'UCother', snippet: { title: 'x' } }] }));

    expect((await lookup(fetchImpl)).status).toEqual(404);
  });

  test('answers 502, not 404, when YouTube answers with an error status', async () => {
    const { fetchImpl } = fakeFetch(() => new Response('quota', { status: 403 }));

    expect((await lookup(fetchImpl)).status).toEqual(502);
  });

  test('answers 502 when the call to YouTube itself throws', async () => {
    const fetchImpl = (async () => {
      throw new Error('network down');
    }) as typeof fetch;

    expect((await lookup(fetchImpl)).status).toEqual(502);
  });

  test('answers 502 when the answer has no title', async () => {
    const { fetchImpl } = fakeFetch(() => Response.json({ items: [{ id: CHANNEL_ID, snippet: {} }] }));

    expect((await lookup(fetchImpl)).status).toEqual(502);
  });

  test('answers 400 for an id that is not UC and 22 characters, without asking YouTube', async () => {
    const { fetchImpl, calls } = fakeFetch(() => channelsList());

    for (const id of ['', 'UC123', `${CHANNEL_ID}x`, 'XX0123456789abcdefghijkl']) {
      expect((await lookup(fetchImpl, id)).status).toEqual(400);
    }

    expect(calls.youtube).toEqual([]);
  });

  test('answers the title with a null icon when the image cannot be fetched', async () => {
    const { fetchImpl } = fakeFetch(
      () => channelsList(),
      () => new Response('gone', { status: 404 }),
    );

    const response = await lookup(fetchImpl);

    expect(response.status).toEqual(200);
    expect(await response.json()).toMatchObject({ title: 'つばき', iconDataUrl: null });
  });

  test('answers a null icon when the body is not an image', async () => {
    const { fetchImpl } = fakeFetch(
      () => channelsList(),
      () => new Response('<html>', { headers: { 'content-type': 'text/html' } }),
    );

    expect(await (await lookup(fetchImpl)).json()).toMatchObject({ iconDataUrl: null });
  });

  test('does not fetch an icon from a host other than the two YouTube serves them from', async () => {
    const { fetchImpl, calls } = fakeFetch(() => channelsList('https://example.invalid/a.png'));

    expect(await (await lookup(fetchImpl)).json()).toMatchObject({ title: 'つばき', iconDataUrl: null });
    expect(calls.images).toEqual([]);
  });

  test('answers a null icon when the channel has none', async () => {
    const { fetchImpl, calls } = fakeFetch(() => channelsList(null));

    expect(await (await lookup(fetchImpl)).json()).toMatchObject({ iconDataUrl: null });
    expect(calls.images).toEqual([]);
  });

  test('keeps nothing in D1', async () => {
    const { fetchImpl } = fakeFetch(() => channelsList());

    await lookup(fetchImpl);

    const row = await env.DB.prepare(
      'SELECT (SELECT count(*) FROM channel) AS channels, (SELECT count(*) FROM revision) AS revisions',
    ).first();

    expect(row).toEqual({ channels: 0, revisions: 0 });
  });
});

describe('/admin/api/channel-lookup/:channelId', () => {
  const AUD = 'test-access-aud';
  const TEAM = 'nanase.cloudflareaccess.com';

  async function call(path: string, method = 'GET', authorized = true): Promise<Response> {
    const { token, certs } = await signedAccessToken({
      aud: AUD,
      email: 'admin@example.com',
      iss: `https://${TEAM}`,
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    const youtube = fakeFetch(() => channelsList()).fetchImpl;
    const access = certsFetch(certs);
    // Access's keys come from the first, and YouTube with its image from the second.
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) =>
      new URL(input instanceof Request ? input.url : input).pathname === '/cdn-cgi/access/certs'
        ? access(input, init)
        : youtube(input, init)) as typeof fetch;

    return await handleAdminRequest(
      new Request(`https://kemov.nanase.cc${path}`, {
        method,
        headers: authorized ? { 'Cf-Access-Jwt-Assertion': token, 'Sec-Fetch-Site': 'same-origin' } : {},
      }),
      {
        ...env,
        ACCESS_AUD: AUD,
        ACCESS_TEAM_DOMAIN: TEAM,
        ADMIN_EMAILS: 'admin@example.com',
        YOUTUBE_API_KEY: 'k',
      } as typeof env,
      undefined,
      fetchImpl,
      new Map() as CertsCache,
    );
  }

  test('answers a lookup for a caller Access let in', async () => {
    const response = await call(`/admin/api/channel-lookup/${CHANNEL_ID}`);

    expect(response.status).toEqual(200);
    expect(await response.json()).toMatchObject({ channelId: CHANNEL_ID, title: 'つばき' });
  });

  test('refuses a caller without an Access token', async () => {
    expect((await call(`/admin/api/channel-lookup/${CHANNEL_ID}`, 'GET', false)).status).toEqual(401);
  });

  test('refuses a method other than GET with 405 and Allow: GET', async () => {
    const response = await call(`/admin/api/channel-lookup/${CHANNEL_ID}`, 'POST');

    expect(response.status).toEqual(405);
    expect(response.headers.get('Allow')).toEqual('GET');
  });
});
