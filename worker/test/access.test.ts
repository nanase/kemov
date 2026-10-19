import { isAdminEmail, verifyAccess, type CertsCache } from '../src/lib/access';
import { accessToken, certsFetch, signedAccessToken } from './access-token';

const AUD = 'expected-aud';
const TEAM = 'test-team.cloudflareaccess.com';
const NOW = new Date('2026-09-18T00:00:00Z');
const NOW_SECONDS = Math.floor(NOW.getTime() / 1000);

/** A payload every check but the one under test accepts. Each test overrides only what it means to fail on. */
const validPayload = (overrides: Record<string, unknown> = {}) => ({
  aud: AUD,
  email: 'admin@example.com',
  iss: `https://${TEAM}`,
  exp: NOW_SECONDS + 3600,
  ...overrides,
});

const requestWith = (token: string | null) =>
  new Request(
    'https://kemov.nanase.cc/admin/api/me',
    token === null ? undefined : { headers: { 'Cf-Access-Jwt-Assertion': token } },
  );

/** Flips one character of a base64url segment, so a signature stays the right shape but verifies against nothing. */
function tamper(segment: string): string {
  const first = segment[0] === 'A' ? 'B' : 'A';

  return first + segment.slice(1);
}

describe('verifyAccess', () => {
  test('refuses a request with no token', async () => {
    expect(await verifyAccess(requestWith(null), AUD, TEAM, NOW)).toBeNull();
  });

  test('refuses a header that is not a JWT', async () => {
    expect(await verifyAccess(requestWith('not-a-jwt'), AUD, TEAM, NOW)).toBeNull();
    expect(await verifyAccess(requestWith('only.two'), AUD, TEAM, NOW)).toBeNull();
  });

  test('refuses a token whose payload does not decode to JSON', async () => {
    const token = `${btoa('{}')}.not-base64url!!.${btoa('sig')}`;

    expect(await verifyAccess(requestWith(token), AUD, TEAM, NOW)).toBeNull();
  });

  test('refuses a token whose header carries no kid', async () => {
    const token = accessToken(validPayload(), {});

    expect(await verifyAccess(requestWith(token), AUD, TEAM, NOW)).toBeNull();
  });

  test('refuses a matching token whose payload carries no email', async () => {
    const token = accessToken(validPayload({ email: undefined }));

    expect(await verifyAccess(requestWith(token), AUD, TEAM, NOW)).toBeNull();
  });

  test('refuses an iss that is not this team domain', async () => {
    const token = accessToken(validPayload({ iss: 'https://not-this-team.cloudflareaccess.com' }));

    expect(await verifyAccess(requestWith(token), AUD, TEAM, NOW)).toBeNull();
  });

  test('refuses an aud that does not match', async () => {
    const token = accessToken(validPayload({ aud: ['other-aud'] }));

    expect(await verifyAccess(requestWith(token), AUD, TEAM, NOW)).toBeNull();
  });

  test('refuses a token past its exp, beyond the clock skew allowed', async () => {
    const token = accessToken(validPayload({ exp: NOW_SECONDS - 3600 }));

    expect(await verifyAccess(requestWith(token), AUD, TEAM, NOW)).toBeNull();
  });

  test('refuses a token before its nbf, beyond the clock skew allowed', async () => {
    const token = accessToken(validPayload({ nbf: NOW_SECONDS + 3600 }));

    expect(await verifyAccess(requestWith(token), AUD, TEAM, NOW)).toBeNull();
  });

  // ACCESS_AUD/ACCESS_TEAM_DOMAIN unset read as "verify nothing" rather than
  // "verify against nothing" - see the comment on verifyAccess.
  test('refuses every request when ACCESS_AUD is not registered', async () => {
    const token = accessToken(validPayload());

    expect(await verifyAccess(requestWith(token), undefined, TEAM, NOW)).toBeNull();
  });

  test('refuses every request when ACCESS_TEAM_DOMAIN is not registered', async () => {
    const token = accessToken(validPayload());

    expect(await verifyAccess(requestWith(token), AUD, undefined, NOW)).toBeNull();
  });

  test('refuses a token when the key set cannot be fetched', async () => {
    const token = accessToken(validPayload());
    const failingFetch: typeof fetch = async () => {
      throw new Error('network unreachable');
    };

    expect(await verifyAccess(requestWith(token), AUD, TEAM, NOW, failingFetch, new Map() as CertsCache)).toBeNull();
  });

  test('refuses a kid that is not in the fetched key set', async () => {
    const { certs } = await signedAccessToken(validPayload(), 'the-real-key');
    const token = accessToken(validPayload(), { kid: 'a-different-key' });

    expect(
      await verifyAccess(requestWith(token), AUD, TEAM, NOW, certsFetch(certs), new Map() as CertsCache),
    ).toBeNull();
  });

  test('refuses a token whose signature was tampered with', async () => {
    const { token, certs } = await signedAccessToken(validPayload());
    const [header, body, signature] = token.split('.');
    const tampered = `${header}.${body}.${tamper(signature)}`;

    expect(
      await verifyAccess(requestWith(tampered), AUD, TEAM, NOW, certsFetch(certs), new Map() as CertsCache),
    ).toBeNull();
  });

  test('accepts a token with a valid signature', async () => {
    const { token, certs } = await signedAccessToken(validPayload());

    expect(await verifyAccess(requestWith(token), AUD, TEAM, NOW, certsFetch(certs), new Map() as CertsCache)).toEqual({
      email: 'admin@example.com',
    });
  });

  // Access's own tokens carry aud as an array - an application can hold more
  // than one tag - so this is the shape a real request arrives in.
  test('accepts an aud given as an array that contains the expected one', async () => {
    const { token, certs } = await signedAccessToken(validPayload({ aud: ['other-aud', AUD] }));

    expect(await verifyAccess(requestWith(token), AUD, TEAM, NOW, certsFetch(certs), new Map() as CertsCache)).toEqual({
      email: 'admin@example.com',
    });
  });

  // The payload is decoded as UTF-8, not read a byte at a time as Latin-1, so
  // a non-ASCII email survives the round trip intact.
  test('carries a non-ASCII email through unchanged', async () => {
    const { token, certs } = await signedAccessToken(validPayload({ email: 'かのん@example.com' }));

    expect(await verifyAccess(requestWith(token), AUD, TEAM, NOW, certsFetch(certs), new Map() as CertsCache)).toEqual({
      email: 'かのん@example.com',
    });
  });
});

describe('isAdminEmail', () => {
  test('accepts an address on the list, wherever it sits', () => {
    expect(isAdminEmail('admin@example.com', 'admin@example.com')).toBe(true);
    expect(isAdminEmail('b@example.com', 'a@example.com,b@example.com,c@example.com')).toBe(true);
  });

  test('ignores case, spaces and empty entries', () => {
    expect(isAdminEmail('Admin@Example.COM', ' a@example.com ,, admin@example.com ,')).toBe(true);
    expect(isAdminEmail(' admin@example.com ', 'ADMIN@EXAMPLE.COM')).toBe(true);
  });

  test('takes white space, including a line break, as a separator too', () => {
    expect(isAdminEmail('b@example.com', 'a@example.com\nb@example.com')).toBe(true);
    expect(isAdminEmail('b@example.com', 'a@example.com b@example.com\r\n')).toBe(true);
  });

  // U+212A is the Kelvin sign: toLowerCase turns it into a plain "k".
  test('folds ASCII case only, so a look-alike character does not match', () => {
    expect(isAdminEmail('Kemo@example.com', 'kemo@example.com')).toBe(false);
    expect(isAdminEmail('kemo@example.com', 'Kemo@example.com')).toBe(false);
  });

  test('refuses an address that is not on the list', () => {
    expect(isAdminEmail('stranger@example.com', 'admin@example.com')).toBe(false);
    expect(isAdminEmail('xadmin@example.com', 'admin@example.com')).toBe(false);
  });

  test('refuses everyone when the list is unregistered, empty or only separators', () => {
    expect(isAdminEmail('admin@example.com', undefined)).toBe(false);
    expect(isAdminEmail('admin@example.com', '')).toBe(false);
    expect(isAdminEmail('admin@example.com', ' , ,')).toBe(false);
  });

  test('refuses an empty address even against a list with an empty entry', () => {
    expect(isAdminEmail('', 'a@example.com,,b@example.com')).toBe(false);
    expect(isAdminEmail('  ', ',')).toBe(false);
  });
});
