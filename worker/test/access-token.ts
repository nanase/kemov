/**
 * A Cloudflare Access JWT a test can control, built from a payload only.
 *
 * verifyAccess never checks the signature - Access itself does that, before a
 * request reaches the worker at all (see the comment on worker/src/lib/access.ts)
 * - so the header and signature segments are placeholders that only need to
 * be there.
 */
export function accessToken(payload: unknown): string {
  const base64url = (value: string) => btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  return `${base64url('{}')}.${base64url(JSON.stringify(payload))}.${base64url('sig')}`;
}
