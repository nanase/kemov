import { env } from 'cloudflare:test';

import type { CertsCache } from '../src/lib/access';
import { handleAdminRequest } from '../src/admin';
import { accessToken, certsFetch, signedAccessToken } from './access-token';

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
) {
  const init = token === null ? undefined : { headers: { 'Cf-Access-Jwt-Assertion': token } };

  return handleAdminRequest(
    new Request(`https://kemov.nanase.cc${path}`, init),
    { ...env, ACCESS_AUD: aud, ACCESS_TEAM_DOMAIN: teamDomain } as typeof env,
    undefined,
    fetchImpl,
    fetchImpl === undefined ? undefined : (new Map() as CertsCache),
  );
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
  // 404 without a token, the same as any other unknown path.
  test('answers 404 for /admin paths outside /admin/api', async () => {
    expect((await request('/admin', null, AUD)).status).toEqual(404);
    expect((await request('/admin/', null, AUD)).status).toEqual(404);
    expect((await request('/admin/foo', null, AUD)).status).toEqual(404);
  });
});
