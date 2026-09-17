/**
 * Cloudflare Access JWTs a test can control: an unsigned one for the checks
 * that fail before a signature is ever asked for, and a properly signed one
 * with the key set that verifies it, for the checks that do not.
 */

function base64urlBytes(bytes: Uint8Array): string {
  let binary = '';

  for (const byte of bytes) binary += String.fromCharCode(byte);

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlJson(value: unknown): string {
  return base64urlBytes(new TextEncoder().encode(JSON.stringify(value)));
}

/**
 * A JWT built from a header and a payload, with a signature segment that is
 * never a valid one.
 *
 * Good for every check `verifyAccess` makes before it asks for Access's key
 * set - `kid`, `email`, `iss`, `aud`, `exp`, `nbf` - because none of those
 * read the signature. `header` defaults to carrying a `kid`, so a test
 * exercising one of those checks does not fail earlier on a missing one; a
 * test of the `kid` check itself passes `{}` to leave it out.
 */
export function accessToken(payload: unknown, header: Record<string, unknown> = { kid: 'unused-kid' }): string {
  return `${base64urlJson(header)}.${base64urlJson(payload)}.${base64urlBytes(new TextEncoder().encode('sig'))}`;
}

/** A signed Access JWT and the key set that `fetchCerts` needs to verify it. */
export interface SignedAccessToken {
  token: string;
  certs: { keys: (JsonWebKey & { kid: string })[] };
}

const ALGORITHM = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' } as const;

/**
 * A JWT signed with a key pair generated fresh for this call, so no test
 * depends on a real Access team's keys.
 */
export async function signedAccessToken(
  payload: Record<string, unknown>,
  kid = 'test-key',
): Promise<SignedAccessToken> {
  // Cast rather than typed: RSASSA-PKCS1-v1_5 generates a pair, but
  // generateKey's overloads also cover algorithms that generate one plain
  // CryptoKey, and workers-types resolves to their union rather than picking
  // the pair overload here.
  const keyPair = (await crypto.subtle.generateKey(
    { ...ALGORITHM, modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]) },
    true,
    ['sign', 'verify'],
  )) as CryptoKeyPair;

  const publicJwk = (await crypto.subtle.exportKey('jwk', keyPair.publicKey)) as JsonWebKey;
  const header = base64urlJson({ alg: 'RS256', kid });
  const body = base64urlJson(payload);
  const signature = await crypto.subtle.sign(
    ALGORITHM,
    keyPair.privateKey,
    new TextEncoder().encode(`${header}.${body}`),
  );

  return {
    token: `${header}.${body}.${base64urlBytes(new Uint8Array(signature))}`,
    certs: { keys: [{ ...publicJwk, kid }] },
  };
}

/** A fetchImpl that answers Access's own certs endpoint with `certs` and nothing else. */
export function certsFetch(certs: SignedAccessToken['certs']): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = new URL(input instanceof Request ? input.url : input);

    if (url.pathname === '/cdn-cgi/access/certs') return new Response(JSON.stringify(certs), { status: 200 });

    return new Response('not found', { status: 404 });
  }) as typeof fetch;
}
