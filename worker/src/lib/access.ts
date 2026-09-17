/**
 * Whether a request into `/admin/*` carries a Cloudflare Access token this
 * worker recognizes.
 *
 * Cloudflare Access is what actually keeps everyone else out: its policy sits
 * in front of the route and never lets an unauthorized request reach the
 * worker at all. This check is not a second copy of that gate - it never
 * verifies the token's signature, which would need a key Access rotates on
 * its own - it exists only so that a request is still refused here if that
 * policy is ever removed or misconfigured, rather than reaching an admin
 * endpoint unchecked. See #144.
 */

/** What `verifyAccess` reads out of a token Access has already accepted. */
export interface AccessIdentity {
  email: string;
}

/** The payload of a Cloudflare Access JWT, decoded and parsed, or null if it is not one. */
function decodePayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.');

  if (parts.length !== 3) return null;

  const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);

  try {
    const parsed = JSON.parse(atob(padded));

    return typeof parsed === 'object' && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * `expectedAud` is `undefined` when `ACCESS_AUD` has not been registered as a
 * secret yet. Every request is refused in that case rather than compared
 * against nothing, which a missing secret would otherwise read as "matches
 * anything".
 *
 * Access's own JWTs carry `aud` as an array - an application can have more
 * than one tag - so a match against either an array or a bare string is
 * accepted.
 */
export function verifyAccess(request: Request, expectedAud: string | undefined): AccessIdentity | null {
  if (expectedAud === undefined) return null;

  const token = request.headers.get('Cf-Access-Jwt-Assertion');

  if (token === null) return null;

  const payload = decodePayload(token);

  if (payload === null) return null;

  const { aud, email } = payload;
  const audMatches = Array.isArray(aud) ? aud.includes(expectedAud) : aud === expectedAud;

  return audMatches && typeof email === 'string' ? { email } : null;
}
