import { verifyAccess } from '../src/lib/access';
import { accessToken } from './access-token';

const requestWith = (token: string | null) =>
  new Request(
    'https://kemov.nanase.cc/admin/api/me',
    token === null ? undefined : { headers: { 'Cf-Access-Jwt-Assertion': token } },
  );

describe('verifyAccess', () => {
  const AUD = 'expected-aud';

  test('refuses a request with no token', () => {
    expect(verifyAccess(requestWith(null), AUD)).toBeNull();
  });

  test('refuses a header that is not a JWT', () => {
    expect(verifyAccess(requestWith('not-a-jwt'), AUD)).toBeNull();
    expect(verifyAccess(requestWith('only.two'), AUD)).toBeNull();
  });

  test('refuses a token whose payload does not decode to JSON', () => {
    const token = `${btoa('{}')}.not-base64url!!.${btoa('sig')}`;

    expect(verifyAccess(requestWith(token), AUD)).toBeNull();
  });

  test('refuses an aud that does not match', () => {
    const token = accessToken({ aud: ['other-aud'], email: 'admin@example.com' });

    expect(verifyAccess(requestWith(token), AUD)).toBeNull();
  });

  test('accepts an aud given as a bare string', () => {
    const token = accessToken({ aud: AUD, email: 'admin@example.com' });

    expect(verifyAccess(requestWith(token), AUD)).toEqual({ email: 'admin@example.com' });
  });

  // Access's own tokens carry aud as an array - an application can hold more
  // than one tag - so this is the shape a real request arrives in.
  test('accepts an aud given as an array that contains the expected one', () => {
    const token = accessToken({ aud: ['other-aud', AUD], email: 'admin@example.com' });

    expect(verifyAccess(requestWith(token), AUD)).toEqual({ email: 'admin@example.com' });
  });

  test('refuses a matching aud whose payload carries no email', () => {
    const token = accessToken({ aud: AUD });

    expect(verifyAccess(requestWith(token), AUD)).toBeNull();
  });

  // ACCESS_AUD unset reads as "matches nothing" rather than "matches
  // anything" - see the comment on verifyAccess.
  test('refuses every request when no aud is expected', () => {
    const token = accessToken({ aud: AUD, email: 'admin@example.com' });

    expect(verifyAccess(requestWith(token), undefined)).toBeNull();
  });
});
