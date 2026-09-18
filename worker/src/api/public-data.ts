import type { Env } from '../lib/env';
import { CACHE_SECONDS, errorWithCacheHeaders } from './cache';

/**
 * The public JSON the admin site has published (#144), served exactly as it
 * was written.
 *
 * The worker never rebuilds this JSON - publishing (a later task) is what
 * writes it to `PUBLIC_DATA` - so this only passes the R2 object through:
 * the same bytes, and the ETag and Last-Modified R2 already carries for it.
 *
 * `If-None-Match` is answered by fetching the object and comparing its own
 * `httpEtag`, rather than by passing the header to R2's `get` as `onlyIf`.
 * Either is a valid way to ask; this one was chosen because the outcome then
 * follows from one value this code already has to read to answer a fresh
 * request, rather than from a second, conditional shape of the same call.
 */

/**
 * The entity-tags an `If-None-Match` header names, or `'any'` for a bare
 * `*` (RFC 7232 §3.2) - only when the whole header is that one character,
 * not when `*` sits among other values, since `*` is not itself a valid
 * entity-tag there.
 *
 * Splits the header on comma without tracking a read position by hand - a
 * hand-advanced index is what let an unquoted element leave it unmoved and
 * spin the previous version of this function forever. R2's own ETag is a
 * hex digest with no comma in it, so a header naming only R2 ETags never
 * has one inside a quoted value, even though RFC 7232's entity-tag grammar
 * would allow it in general. An element that is not a properly quoted
 * string once any `W/` prefix is set aside is dropped rather than kept as a
 * tag - the same as a bare `If-None-Match: invalid`, or the empty element
 * between the commas in `"a", , "b"`.
 */
function parseIfNoneMatch(header: string): readonly string[] | 'any' {
  const trimmed = header.trim();

  if (trimmed === '*') return 'any';

  return trimmed
    .split(',')
    .map((element) => element.trim())
    .filter((element) => {
      const unweighted = withoutWeakPrefix(element);

      return unweighted.length >= 2 && unweighted.startsWith('"') && unweighted.endsWith('"');
    });
}

/** An entity-tag with any `W/` weak-comparison prefix removed, so a weak and a strong tag over the same value compare equal. */
function withoutWeakPrefix(tag: string): string {
  return tag.startsWith('W/') ? tag.slice(2) : tag;
}

/** Whether `etag` (always a strong tag - R2's own) is one `ifNoneMatch` names, under the weak comparison RFC 7232 §2.3.2 asks GET/HEAD to use. */
function ifNoneMatchIncludes(ifNoneMatch: readonly string[] | 'any', etag: string): boolean {
  if (ifNoneMatch === 'any') return true;

  const target = withoutWeakPrefix(etag);

  return ifNoneMatch.some((tag) => withoutWeakPrefix(tag) === target);
}

/** The body of an object this bucket has, or null for one it does not. */
async function answerFor(request: Request, object: R2ObjectBody): Promise<Response> {
  const headers = new Headers({
    'content-type': 'application/json; charset=UTF-8',
    etag: object.httpEtag,
    'last-modified': object.uploaded.toUTCString(),
    // The same freshness window cache.ts gives a D1-backed answer: publishing
    // is not something that needs the edge to ask again within seconds, but a
    // publish should not sit behind a stale copy for long either.
    'cache-control': `public, max-age=${CACHE_SECONDS}`,
  });

  const ifNoneMatch = request.headers.get('If-None-Match');

  if (ifNoneMatch !== null && ifNoneMatchIncludes(parseIfNoneMatch(ifNoneMatch), object.httpEtag)) {
    return new Response(null, { status: 304, headers });
  }

  return new Response(object.body, { status: 200, headers });
}

/**
 * Answers a GET or HEAD for one published JSON key.
 *
 * The method itself is never checked here: handleApiRequest refuses anything
 * but GET and HEAD before routing reaches this far, the same as every other
 * /api endpoint.
 */
export async function publicDataResponse(request: Request, env: Env, key: string): Promise<Response> {
  const object = await env.PUBLIC_DATA.get(key);
  // Publishing (a later task) is what would create this key; nothing has
  // written it yet if this endpoint is reached before that task ships, and
  // this is the honest answer for that - not a 200 with nothing behind it.
  const response = object === null ? errorWithCacheHeaders(404, 'not published yet') : await answerFor(request, object);

  return request.method === 'HEAD'
    ? new Response(null, { status: response.status, headers: response.headers })
    : response;
}
