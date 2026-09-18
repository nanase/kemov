import { env } from 'cloudflare:test';

import type { CertsCache } from '../src/lib/access';
import { handleAdminRequest } from '../src/admin';
import { accessToken, certsFetch, signedAccessToken } from './access-token';
import { clearEverything } from './reset-db';

/** Routing and the Access check in front of it; what an authorized caller can do is #144's own scope. */

const AUD = 'test-access-aud';
// wrangler.toml's own ACCESS_TEAM_DOMAIN, which cloudflare:test's env already carries as a real [vars] entry.
const TEAM = 'nanase.cloudflareaccess.com';
const NOW_SECONDS = Math.floor(Date.now() / 1000);

const validPayload = (overrides: Record<string, unknown> = {}) => ({
  aud: AUD,
  email: 'admin@example.com',
  iss: `https://${TEAM}`,
  exp: NOW_SECONDS + 3600,
  ...overrides,
});

// aud/teamDomain are typed as string on Env, same as every other secret or
// var in it, but an unregistered one is undefined at runtime - see the
// comment on Env.ACCESS_AUD. Required parameters rather than ones defaulting
// to AUD/TEAM: a default is skipped only when the caller omits the argument,
// not when it passes undefined explicitly, so a default here would have
// silently swallowed the tests that need a real undefined.
//
// fetchImpl defaults to undefined, which handleAdminRequest forwards
// straight through to verifyAccess's own default (the global fetch) - a test
// that reaches the key fetch passes one of its own instead, paired with a
// certsCache of its own: verifyAccess's own default cache is shared by every
// call that omits one, and every test here signs its own key pair, so a
// second test sharing the first test's cached (and now wrong) key would fail
// to verify a signature that is actually valid.
function request(
  path: string,
  token: string | null,
  aud: string | undefined,
  teamDomain: string | undefined = TEAM,
  fetchImpl?: typeof fetch,
  assets?: Fetcher,
  method?: string,
) {
  const init: RequestInit = { method };

  if (token !== null) init.headers = { 'Cf-Access-Jwt-Assertion': token };

  return handleAdminRequest(
    new Request(`https://kemov.nanase.cc${path}`, init),
    { ...env, ACCESS_AUD: aud, ACCESS_TEAM_DOMAIN: teamDomain } as typeof env,
    undefined,
    fetchImpl,
    fetchImpl === undefined ? undefined : (new Map() as CertsCache),
    assets,
  );
}

/** A fake `ASSETS` that answers `path` with `status`/`body`, and 404 for anything else - the same shape pages.test.ts's own uses. */
function fakeAssets(pages: Readonly<Record<string, { status: number; body: string }>>): Fetcher {
  return {
    fetch: async (input: RequestInfo | URL) => {
      const path = new URL(input instanceof Request ? input.url : input).pathname;
      const page = pages[path];

      if (page === undefined) return new Response('not found', { status: 404 });

      return new Response(page.body, { status: page.status });
    },
  } as unknown as Fetcher;
}

describe('handleAdminRequest', () => {
  test('answers /admin/api/me with the email Access identified', async () => {
    const { token, certs } = await signedAccessToken(validPayload());

    const response = await request('/admin/api/me', token, AUD, TEAM, certsFetch(certs));

    expect(response.status).toEqual(200);
    expect(await response.json()).toEqual({ email: 'admin@example.com' });
  });

  test('refuses a method other than GET on /admin/api/me with 405 and Allow: GET', async () => {
    const { token, certs } = await signedAccessToken(validPayload());
    const response = await handleAdminRequest(
      new Request('https://kemov.nanase.cc/admin/api/me', {
        method: 'POST',
        headers: { 'Cf-Access-Jwt-Assertion': token },
      }),
      { ...env, ACCESS_AUD: AUD, ACCESS_TEAM_DOMAIN: TEAM } as typeof env,
      undefined,
      certsFetch(certs),
      new Map() as CertsCache,
    );

    expect(response.status).toEqual(405);
    expect(response.headers.get('Allow')).toEqual('GET');
  });

  test('refuses a request with no Access token', async () => {
    expect((await request('/admin/api/me', null, AUD)).status).toEqual(401);
  });

  test('refuses a header that is not a JWT', async () => {
    expect((await request('/admin/api/me', 'not-a-jwt', AUD)).status).toEqual(401);
  });

  test('refuses an aud that does not match', async () => {
    const token = accessToken(validPayload({ aud: 'other-aud' }));

    expect((await request('/admin/api/me', token, AUD)).status).toEqual(401);
  });

  test('refuses every /admin/api/* request when ACCESS_AUD is not registered', async () => {
    const token = accessToken(validPayload());

    expect((await request('/admin/api/me', token, undefined)).status).toEqual(401);
  });

  test('refuses every /admin/api/* request when ACCESS_TEAM_DOMAIN is not registered', async () => {
    const token = accessToken(validPayload());

    expect((await request('/admin/api/me', token, AUD, undefined)).status).toEqual(401);
  });

  test('answers 404 for an /admin/api path that does not exist', async () => {
    const { token, certs } = await signedAccessToken(validPayload());

    expect((await request('/admin/api/nothing', token, AUD, TEAM, certsFetch(certs))).status).toEqual(404);
  });

  // Not part of /admin/api, so there is nothing to authorize - these answer
  // the admin page without a token, the same as any other path under here.
  test('answers the admin page for /admin paths outside /admin/api, without a token', async () => {
    const assets = fakeAssets({ '/admin/': { status: 200, body: '<!doctype html><title>けもV 管理</title>' } });

    for (const path of ['/admin', '/admin/', '/admin/footprints', '/admin/publish/nope']) {
      const response = await request(path, null, AUD, TEAM, undefined, assets);

      expect(response.status).toEqual(200);
      expect(await response.text()).toContain('けもV 管理');
    }
  });

  test('answers the admin page from ASSETS whatever the path, not a per-page file', async () => {
    const assets = fakeAssets({ '/admin/other-page.html': { status: 200, body: 'wrong file' } });

    expect((await request('/admin/footprints', null, AUD, TEAM, undefined, assets)).status).toEqual(404);
  });

  test('answers 405 for a method other than GET/HEAD outside /admin/api', async () => {
    const assets = fakeAssets({ '/admin/': { status: 200, body: '<!doctype html>' } });
    const response = await request('/admin/footprints', null, AUD, TEAM, undefined, assets, 'POST');

    expect(response.status).toEqual(405);
    expect(response.headers.get('Allow')).toEqual('GET, HEAD');
  });
});

async function call(path: string, init: RequestInit = {}): Promise<Response> {
  const { token, certs } = await signedAccessToken(validPayload());

  return handleAdminRequest(
    new Request(`https://kemov.nanase.cc${path}`, {
      ...init,
      headers: { ...init.headers, 'Cf-Access-Jwt-Assertion': token },
    }),
    { ...env, ACCESS_AUD: AUD, ACCESS_TEAM_DOMAIN: TEAM } as typeof env,
    undefined,
    certsFetch(certs),
    new Map() as CertsCache,
  );
}

const put = (path: string, body: unknown) =>
  call(path, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

// What each footprints route actually does is footprints.test.ts and
// footprints-publish.test.ts's job. This only checks that a path and a
// method reach the function that owns them.
describe('handleAdminRequest routing to footprints', () => {
  beforeEach(clearEverything);

  const minimalEventBody = {
    datePrecision: 'day',
    startDate: '2025-01-01',
    startsAt: null,
    endDate: null,
    kind: 'debut',
    emphasized: false,
    title: 'x',
    place: null,
    supplement: null,
    videoId: null,
    sourcePending: true,
    memo: null,
    channelIds: [],
    sources: [],
  };

  const post = (path: string, body: unknown) =>
    call(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

  test('routes GET and POST /admin/api/footprints/events', async () => {
    expect((await call('/admin/api/footprints/events')).status).toEqual(200);

    const created = await post('/admin/api/footprints/events', minimalEventBody);

    expect(created.status).toEqual(201);

    const wrongMethod = await call('/admin/api/footprints/events', { method: 'DELETE' });

    expect(wrongMethod.status).toEqual(405);
    expect(wrongMethod.headers.get('Allow')).toEqual('GET, POST');
  });

  test('routes GET, PUT and DELETE /admin/api/footprints/events/:eventId', async () => {
    const created = await post('/admin/api/footprints/events', minimalEventBody);
    const { event } = (await created.json()) as { event: { eventId: number } };

    expect((await call(`/admin/api/footprints/events/${event.eventId}`)).status).toEqual(200);

    const updated = await put(`/admin/api/footprints/events/${event.eventId}`, minimalEventBody);

    expect(updated.status).toEqual(200);

    const deleted = await call(`/admin/api/footprints/events/${event.eventId}`, { method: 'DELETE' });

    expect(deleted.status).toEqual(200);
  });

  test('answers 404 for a non-numeric event id', async () => {
    expect((await call('/admin/api/footprints/events/not-a-number')).status).toEqual(404);
  });

  test('answers 404 for an event id outside the safe integer range', async () => {
    expect((await call('/admin/api/footprints/events/99999999999999999999')).status).toEqual(404);
  });

  test('routes POST .../publish and .../withdraw', async () => {
    const created = await post('/admin/api/footprints/events', {
      ...minimalEventBody,
      sourcePending: true,
      sources: [],
    });
    const { event } = (await created.json()) as { event: { eventId: number } };

    const published = await post(`/admin/api/footprints/events/${event.eventId}/publish`, {});

    expect(published.status).toEqual(200);

    const withdrawn = await post(`/admin/api/footprints/events/${event.eventId}/withdraw`, {});

    expect(withdrawn.status).toEqual(200);

    const unknownAction = await post(`/admin/api/footprints/events/${event.eventId}/nope`, {});

    expect(unknownAction.status).toEqual(404);
  });

  test('routes GET /admin/api/footprints/pending and POST /admin/api/footprints/publish', async () => {
    expect((await call('/admin/api/footprints/pending')).status).toEqual(200);
    expect((await post('/admin/api/footprints/publish', {})).status).toEqual(200);
  });
});

// What each resource actually does with a valid save or delete is
// members.test.ts, video-overrides.test.ts and snapshot-exclusions.test.ts's
// own job. This only checks that a path and a method reach the function that
// owns them, since that wiring is this file's, not theirs.
describe("handleAdminRequest routing to task 12's resources", () => {
  beforeEach(clearEverything);

  async function insertChannel(channelId: string): Promise<void> {
    await env.DB.prepare(
      `INSERT INTO channel (channel_id, name, fullname, color_key, color_sub, color_light, color_back, activity_start_date)
       VALUES (?1, ?1, ?1, '#000000', '#000000', '#000000', '#000000', '2021-01-01')`,
    )
      .bind(channelId)
      .run();
  }

  test('routes GET /admin/api/members', async () => {
    await insertChannel('UCaaa');

    expect((await call('/admin/api/members')).status).toEqual(200);
  });

  test('routes PUT /admin/api/members/:id, and refuses other methods', async () => {
    await insertChannel('UCaaa');

    const response = await put('/admin/api/members/UCaaa', {
      name: 'x',
      fullname: 'x',
      globalname: null,
      twitter: null,
      twitch: null,
      colorKey: '#000000',
      colorSub: '#000000',
      colorLight: '#000000',
      colorBack: '#000000',
      activityStartDate: '2021-01-01',
      activityEndDate: null,
      displayOrder: 0,
    });

    expect(response.status).toEqual(200);

    const refused = await call('/admin/api/members/UCaaa', { method: 'DELETE' });

    expect(refused.status).toEqual(405);
    expect(refused.headers.get('Allow')).toEqual('PUT');
  });

  test('refuses a PUT body that is not valid JSON', async () => {
    await insertChannel('UCaaa');

    const response = await call('/admin/api/members/UCaaa', { method: 'PUT', body: 'not json' });

    expect(response.status).toEqual(400);
    expect(await response.json()).toEqual({ error: 'body must be valid JSON' });
  });

  test('refuses a PUT body that is not a JSON object', async () => {
    await insertChannel('UCaaa');

    const response = await put('/admin/api/members/UCaaa', [1, 2, 3]);

    expect(response.status).toEqual(400);
    expect(await response.json()).toEqual({ error: 'body must be a JSON object' });
  });

  test('routes GET /admin/api/video-overrides and PUT/DELETE .../:videoId', async () => {
    await insertChannel('UCaaa');
    await env.DB.prepare(
      `INSERT INTO video (video_id, channel_id, title, published_at, availability, live_broadcast_content, fetched_at)
       VALUES ('vid1', 'UCaaa', 't', '2026-09-01T00:00:00Z', 'public', 'none', '2026-09-01T00:00:00Z')`,
    ).run();

    expect((await call('/admin/api/video-overrides')).status).toEqual(200);

    const saved = await put('/admin/api/video-overrides/vid1', { title: 'x' });

    expect(saved.status).toEqual(200);

    const deleted = await call('/admin/api/video-overrides/vid1', { method: 'DELETE' });

    expect(deleted.status).toEqual(200);

    const wrongMethod = await call('/admin/api/video-overrides/vid1', { method: 'PATCH' });

    expect(wrongMethod.status).toEqual(405);
    expect(wrongMethod.headers.get('Allow')).toEqual('PUT, DELETE');
  });

  test('routes GET /admin/api/snapshot-exclusions and PUT/DELETE .../:channelId/:fetchedAt', async () => {
    await insertChannel('UCaaa');
    await env.DB.prepare(
      `INSERT INTO channel_snapshot (channel_id, fetched_at, subscriber_count, view_count, video_count)
       VALUES ('UCaaa', '2026-09-08T00:00:00Z', 100, 200, 3)`,
    ).run();

    expect((await call('/admin/api/snapshot-exclusions')).status).toEqual(200);

    const saved = await put('/admin/api/snapshot-exclusions/UCaaa/2026-09-08T00:00:00Z', { reason: 'x' });

    expect(saved.status).toEqual(200);

    const deleted = await call('/admin/api/snapshot-exclusions/UCaaa/2026-09-08T00:00:00Z', { method: 'DELETE' });

    expect(deleted.status).toEqual(200);
  });

  // fetched_at (2026-09-08T00:00:00Z) has colons, which encodeURIComponent -
  // the ordinary way to build a path segment from an arbitrary string -
  // turns into %3A. A router that only split on '/' and never decoded would
  // look up a fetched_at that never matches any row.
  test('decodes a percent-encoded fetchedAt path segment', async () => {
    await insertChannel('UCaaa');
    await env.DB.prepare(
      `INSERT INTO channel_snapshot (channel_id, fetched_at, subscriber_count, view_count, video_count)
       VALUES ('UCaaa', '2026-09-08T00:00:00Z', 100, 200, 3)`,
    ).run();

    const path = `/admin/api/snapshot-exclusions/UCaaa/${encodeURIComponent('2026-09-08T00:00:00Z')}`;
    const saved = await put(path, { reason: 'x' });

    expect(saved.status).toEqual(200);
  });

  test('routes GET /admin/api/videos, and refuses other methods', async () => {
    await insertChannel('UCaaa');
    await env.DB.prepare(
      `INSERT INTO video (video_id, channel_id, title, published_at, availability, live_broadcast_content, fetched_at)
       VALUES ('vid1', 'UCaaa', 't', '2026-09-01T00:00:00Z', 'public', 'none', '2026-09-01T00:00:00Z')`,
    ).run();

    expect((await call('/admin/api/videos')).status).toEqual(200);

    const wrongMethod = await call('/admin/api/videos', { method: 'POST' });

    expect(wrongMethod.status).toEqual(405);
    expect(wrongMethod.headers.get('Allow')).toEqual('GET');
  });

  test('routes GET /admin/api/snapshots, and refuses other methods', async () => {
    await insertChannel('UCaaa');
    await env.DB.prepare(
      `INSERT INTO channel_snapshot (channel_id, fetched_at, subscriber_count, view_count, video_count)
       VALUES ('UCaaa', '2026-09-08T00:00:00Z', 100, 200, 3)`,
    ).run();

    expect((await call('/admin/api/snapshots')).status).toEqual(200);

    const wrongMethod = await call('/admin/api/snapshots', { method: 'POST' });

    expect(wrongMethod.status).toEqual(405);
    expect(wrongMethod.headers.get('Allow')).toEqual('GET');
  });
});
