import { env } from 'cloudflare:test';

import { handleAdminRequest } from '../src/admin';
import { accessToken } from './access-token';

/** Routing and the Access check in front of it; what an authorized caller can do is #144's own scope. */

const AUD = 'test-access-aud';

const authorizedToken = () => accessToken({ aud: AUD, email: 'admin@example.com' });

// aud is typed as string on Env, same as every other secret in it, but an
// unregistered one is undefined at runtime - see the comment on Env.ACCESS_AUD.
// A required parameter rather than one defaulting to AUD: a default is
// skipped only when the caller omits the argument, not when it passes
// undefined explicitly, so a default here would have silently swallowed the
// one test that needs a real undefined.
function request(path: string, token: string | null, aud: string | undefined) {
  const init = token === null ? undefined : { headers: { 'Cf-Access-Jwt-Assertion': token } };

  return handleAdminRequest(new Request(`https://kemov.nanase.cc${path}`, init), {
    ...env,
    ACCESS_AUD: aud,
  } as typeof env);
}

describe('handleAdminRequest', () => {
  test('answers /admin/api/me with the email Access identified', async () => {
    const response = await request('/admin/api/me', authorizedToken(), AUD);

    expect(response.status).toEqual(200);
    expect(await response.json()).toEqual({ email: 'admin@example.com' });
  });

  test('refuses a request with no Access token', async () => {
    expect((await request('/admin/api/me', null, AUD)).status).toEqual(401);
  });

  test('refuses a header that is not a JWT', async () => {
    expect((await request('/admin/api/me', 'not-a-jwt', AUD)).status).toEqual(401);
  });

  test('refuses an aud that does not match', async () => {
    const token = accessToken({ aud: 'other-aud', email: 'admin@example.com' });

    expect((await request('/admin/api/me', token, AUD)).status).toEqual(401);
  });

  test('refuses every /admin/api/* request when ACCESS_AUD is not registered', async () => {
    const response = await request('/admin/api/me', authorizedToken(), undefined);

    expect(response.status).toEqual(401);
  });

  test('answers 404 for an /admin/api path that does not exist', async () => {
    expect((await request('/admin/api/nothing', authorizedToken(), AUD)).status).toEqual(404);
  });

  // Not part of /admin/api, so there is nothing to authorize - these answer
  // 404 without a token, the same as any other unknown path.
  test('answers 404 for /admin paths outside /admin/api', async () => {
    expect((await request('/admin', null, AUD)).status).toEqual(404);
    expect((await request('/admin/', null, AUD)).status).toEqual(404);
    expect((await request('/admin/foo', null, AUD)).status).toEqual(404);
  });
});
