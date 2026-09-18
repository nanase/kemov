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
 * `*` (RFC 7232 §3.2). A comma inside a quoted tag is not a separator - not
 * that R2's own tags ever contain one, but a header this reads is a caller's
 * to shape, not R2's.
 */
function parseIfNoneMatch(header: string): readonly string[] | 'any' {
  const trimmed = header.trim();

  if (trimmed === '*') return 'any';

  const tags: string[] = [];
  let index = 0;

  while (index < trimmed.length) {
    while (index < trimmed.length && /[\s,]/.test(trimmed[index])) index++;

    if (index >= trimmed.length) break;

    const start = index;

    if (trimmed.startsWith('W/', index)) index += 2;

    if (trimmed[index] === '"') {
      index++;

      while (index < trimmed.length && trimmed[index] !== '"') index++;

      index++;
    }

    tags.push(trimmed.slice(start, index));
  }

  return tags;
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
