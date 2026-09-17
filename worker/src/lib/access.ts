/**
 * Whether a request into `/admin/*` carries a Cloudflare Access token this
 * worker can verify on its own.
 *
 * Access is what actually keeps everyone else out: its policy sits in front
 * of the route and never lets an unauthorized request reach the worker at
 * all. This is a second, independent check of the same token - not a
 * substitute for Access, a reason not to trust it alone. It fetches Access's
 * own public keys and verifies the token's signature the way Access's own
 * edge does, so that a request is still refused here if that policy is ever
 * removed or misconfigured, rather than reaching an endpoint that writes to
 * D1 or to the public bucket unchecked. Signature verification replaced an
 * earlier version that checked only the `aud` claim, once #144's review
 * found that `aud` alone was not enough for a route meant to write (2026-09-18).
 */

/** What `verifyAccess` reads out of a token it has verified. */
export interface AccessIdentity {
  email: string;
}

/** One key from Cloudflare Access's own certificate endpoint. */
interface AccessJwk extends JsonWebKey {
  kid: string;
}

/** The body `https://<team domain>/cdn-cgi/access/certs` answers with. */
interface AccessCerts {
  keys: AccessJwk[];
}

/** How long a fetched key set is trusted before it is asked for again. */
const CERTS_CACHE_SECONDS = 60 * 60;

/** How far a token's `exp`/`nbf` may be from this worker's own clock and still be accepted. */
const CLOCK_SKEW_SECONDS = 60;

/**
 * A cache of Cloudflare Access's key sets, by team domain.
 *
 * A plain module-scope value in production - the worker's own clock is
 * enough to age it out, and Access does not rotate keys often enough for a
 * round trip on every admin request to be worth it. Exported as a type only
 * so a test can hand `verifyAccess` a cache of its own, instead of one run's
 * requests warming the cache for the next.
 */
export type CertsCache = Map<string, { certs: AccessCerts; fetchedAt: number }>;

const defaultCertsCache: CertsCache = new Map();

/** A JWT segment, base64url-decoded to bytes. `atob` alone stops at Latin-1, which mangles anything outside it. */
function base64UrlToBytes(value: string): Uint8Array | null {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);

  try {
    const binary = atob(padded);

    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}

/** A JWT header or payload segment, decoded as UTF-8 and parsed - unlike `base64UrlToBytes`, this reads text. */
function decodeJsonSegment(segment: string): Record<string, unknown> | null {
  const bytes = base64UrlToBytes(segment);

  if (bytes === null) return null;

  try {
    const parsed = JSON.parse(new TextDecoder().decode(bytes));

    return typeof parsed === 'object' && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * The key set at `https://<teamDomain>/cdn-cgi/access/certs`, served from
 * `cache` when it is not yet `CERTS_CACHE_SECONDS` old.
 *
 * Answers `null` for every way this can fail to produce a usable key set - a
 * network failure, a non-2xx response, a body that is not JSON, a body with
 * no `keys` array - so the caller has one outcome to refuse the request on,
 * rather than one per failure mode.
 */
async function fetchCerts(
  teamDomain: string,
  now: Date,
  fetchImpl: typeof fetch,
  cache: CertsCache,
): Promise<AccessCerts | null> {
  const cached = cache.get(teamDomain);

  if (cached !== undefined && now.getTime() - cached.fetchedAt < CERTS_CACHE_SECONDS * 1000) {
    return cached.certs;
  }

  let response: Response;

  try {
    response = await fetchImpl(`https://${teamDomain}/cdn-cgi/access/certs`);
  } catch {
    return null;
  }

  if (!response.ok) return null;

  let body: unknown;

  try {
    body = await response.json();
  } catch {
    return null;
  }

  if (typeof body !== 'object' || body === null || !Array.isArray((body as AccessCerts).keys)) return null;

  const certs = body as AccessCerts;

  cache.set(teamDomain, { certs, fetchedAt: now.getTime() });

  return certs;
}

/** Whether `signatureSegment` is a valid RS256 signature over `header.payload`, made by the key named `kid`. */
async function verifySignature(
  headerSegment: string,
  payloadSegment: string,
  signatureSegment: string,
  kid: string,
  certs: AccessCerts,
): Promise<boolean> {
  const jwk = certs.keys.find((key) => key.kid === kid);

  if (jwk === undefined) return false;

  const signature = base64UrlToBytes(signatureSegment);

  if (signature === null) return false;

  let key: CryptoKey;

  try {
    key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  } catch {
    return false;
  }

  return crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    signature,
    new TextEncoder().encode(`${headerSegment}.${payloadSegment}`),
  );
}

/**
 * `expectedAud` is `undefined` when `ACCESS_AUD`, and `teamDomain` when
 * `ACCESS_TEAM_DOMAIN`, has not been registered yet. Both read as "verify
 * nothing" rather than "verify against nothing": every request is refused
 * rather than compared against an expectation that is not really there.
 *
 * `now`, `fetchImpl` and `certsCache` default to the worker's own clock, the
 * global fetch, and the module-scope cache above; a test supplies its own so
 * that a key fetch, a signature and a clock can each be controlled without a
 * live Access team behind them.
 */
export async function verifyAccess(
  request: Request,
  expectedAud: string | undefined,
  teamDomain: string | undefined,
  now: Date = new Date(),
  fetchImpl: typeof fetch = fetch,
  certsCache: CertsCache = defaultCertsCache,
): Promise<AccessIdentity | null> {
  if (expectedAud === undefined || teamDomain === undefined) return null;

  const token = request.headers.get('Cf-Access-Jwt-Assertion');

  if (token === null) return null;

  const parts = token.split('.');

  if (parts.length !== 3) return null;

  const [headerSegment, payloadSegment, signatureSegment] = parts;
  const header = decodeJsonSegment(headerSegment);
  const payload = decodeJsonSegment(payloadSegment);

  if (header === null || payload === null) return null;

  const { kid } = header;
  const { aud, email, iss, exp, nbf } = payload;

  if (typeof kid !== 'string') return null;
  if (typeof email !== 'string') return null;
  if (iss !== `https://${teamDomain}`) return null;

  const audMatches = Array.isArray(aud) ? aud.includes(expectedAud) : aud === expectedAud;

  if (!audMatches) return null;

  const nowSeconds = now.getTime() / 1000;

  if (typeof exp !== 'number' || nowSeconds > exp + CLOCK_SKEW_SECONDS) return null;
  if (nbf !== undefined && (typeof nbf !== 'number' || nowSeconds < nbf - CLOCK_SKEW_SECONDS)) return null;

  const certs = await fetchCerts(teamDomain, now, fetchImpl, certsCache);

  if (certs === null) return null;

  const verified = await verifySignature(headerSegment, payloadSegment, signatureSegment, kid, certs);

  return verified ? { email } : null;
}
