import { errorResponse, jsonResponse } from '../lib/json';

/**
 * Thrown by a builder for a thing that is not there.
 *
 * It lives here because this is where builders are called, and because the
 * catch below must not treat it as a database failure. A missing channel
 * answered from another request's stored response would be the cache doing the
 * opposite of its job.
 */
export class NotFound extends Error {}

/**
 * Thrown by a builder handed something it cannot work with.
 *
 * Same reasoning as NotFound: the caller asking wrongly is an answer, not a
 * database failure, and answering it from the store would attach one request's
 * mistake to another request's data.
 */
export class BadRequest extends Error {}

/**
 * Answering from the edge cache, and answering from it again when D1 will not
 * answer at all.
 *
 * The site this replaces fetched two static files and waited for both. One
 * failing emptied the whole statistics table, because there was nothing to
 * fall back to and no way to say that what was on screen was old. #58 lists
 * that among the failures to remove.
 *
 * So a response that was built successfully is kept, and a request that cannot
 * reach D1 is answered with the kept one rather than with an error. The
 * consequence is that the API can serve data it knows to be stale, which is
 * only defensible if it says so - see `x-kemov-cache` and `staleSeconds`
 * below. Silently serving old numbers would be the same defect wearing a
 * different coat.
 */

/** How long a stored response stays fresh enough to serve without asking D1. */
export const CACHE_SECONDS = 60;

/**
 * How long a stored response may still be served after D1 has failed.
 *
 * Far beyond CACHE_SECONDS on purpose: this is the difference between a site
 * showing yesterday's numbers with a note saying so, and a site showing
 * nothing. Six hours is long enough to cover an outage that someone has to
 * wake up for, and short enough that nobody mistakes the result for current.
 */
export const STALE_SECONDS = 6 * 60 * 60;

/** What a cached response was, when a caller needs to know. */
export interface CacheOutcome {
  /**
   * 'fresh' served from cache, 'miss' built now, 'stale' served after a
   * failure. An error reports a fourth value, 'none', which is not in this
   * union because there is no aged body behind it - see errorWithCacheHeaders.
   */
  state: 'fresh' | 'miss' | 'stale';
  /** How old the served body is, in seconds. Zero when it was just built. */
  staleSeconds: number;
}

const STORED_AT = 'x-kemov-stored-at';

function storedAgeSeconds(response: Response, now: Date): number | null {
  const storedAt = response.headers.get(STORED_AT);

  if (storedAt === null) return null;

  const age = (now.getTime() - new Date(storedAt).getTime()) / 1000;

  return Number.isFinite(age) ? Math.max(0, Math.round(age)) : null;
}

/**
 * `status` is a separate parameter, not read from `response.status`, because
 * of what stores it: every entry this puts into `cacheImpl` is put at 200 (see
 * `cachedJson`). 200 is the only status this has ever confirmed the edge
 * actually keeps; on workerd, `put()` for a 503 neither threw nor stored
 * anything, and there is no safe way to check whether production's own Cache
 * API behaves the same - that would mean holding a real outage open long
 * enough to test it. Storing at 200 always sidesteps the question rather than
 * answering it. The status a caller should actually see is decided from the
 * body, separately, by `statusOf`.
 */
function withCacheHeaders(response: Response, outcome: CacheOutcome, now: Date, status: number): Response {
  const headers = new Headers(response.headers);

  headers.set('x-kemov-cache', outcome.state);
  headers.set('x-kemov-stale-seconds', String(outcome.staleSeconds));
  // The edge is told how long it may answer without asking again. The stale
  // window is this worker's business, not the cache's: the cache is asked for
  // the entry regardless and this code decides whether it is still usable.
  headers.set('cache-control', `public, max-age=${CACHE_SECONDS}`);
  headers.set(STORED_AT, response.headers.get(STORED_AT) ?? now.toISOString());

  return new Response(response.body, { status, headers });
}

/**
 * An answer that came from neither the store nor a successful build.
 *
 * Every answer this API gives says where it came from, and an error is an
 * answer. Without this, a caller checking `x-kemov-cache` finds it on the
 * successes and missing on the failures, which turns "which of these is old?"
 * into a question that has to be asked differently depending on the outcome.
 *
 * `no-store` rather than the usual max-age: a 404 for a channel that is about
 * to exist, or a 503 from a database that is about to come back, must not be
 * held by anything between here and the caller.
 */
export function errorWithCacheHeaders(status: number, message: string): Response {
  const response = errorResponse(status, message);

  response.headers.set('x-kemov-cache', 'none');
  response.headers.set('x-kemov-stale-seconds', '0');
  response.headers.set('cache-control', 'no-store');

  return response;
}

/** The HTTP status a JSON body should be answered with. See `statusOf` on `cachedJson`. */
type StatusOf = (body: unknown) => number;

const ALWAYS_200: StatusOf = () => 200;

/**
 * Builds a response, or serves the last good one.
 *
 * `build` is only called when there is nothing fresh to serve. If it throws -
 * which for these endpoints means D1 did - a stored response within
 * STALE_SECONDS is served instead, marked as stale. With nothing stored either,
 * the failure is reported, because an API that answers 200 with no data is
 * harder to diagnose than one that says it could not answer.
 *
 * `cacheImpl` is a parameter because the tests supply their own. The Cache API
 * is available on workerd, but an isolate keeps no entries between tests and a
 * cache that never hits would let every one of these paths pass without being
 * exercised.
 *
 * `statusOf` is what every endpoint but /api/health leaves at its default of
 * "always 200": #110 needed a successful build whose answer is sometimes 503,
 * and every entry `cacheImpl` holds is put at 200 regardless of what is served
 * for it (see `withCacheHeaders`), so the status a caller sees is worked out
 * from the stored body itself, on every path that can serve one - the fresh
 * hit and the stale-after-failure fallback included, not only a fresh build.
 * A builder that has no such body, like the ones this defaults for, is
 * unaffected: `ALWAYS_200` reads nothing from it.
 */
export async function cachedJson(
  request: Request,
  cacheImpl: Cache,
  build: () => Promise<unknown>,
  now: Date = new Date(),
  statusOf: StatusOf = ALWAYS_200,
): Promise<Response> {
  const key = new Request(new URL(request.url).toString(), { method: 'GET' });
  const stored = await cacheImpl.match(key);
  const storedAge = stored === undefined ? null : storedAgeSeconds(stored, now);

  if (stored !== undefined && storedAge !== null && storedAge <= CACHE_SECONDS) {
    const body = await stored.clone().json();

    return withCacheHeaders(stored, { state: 'fresh', staleSeconds: storedAge }, now, statusOf(body));
  }

  try {
    const body = await build();
    // Always 200 here - see the comment on withCacheHeaders for why the
    // status this is put at and the status a caller is answered with are
    // no longer the same thing.
    const built = jsonResponse(body);

    built.headers.set(STORED_AT, now.toISOString());
    // On workerd, put() for a 200 Response with no cache-control also stores
    // nothing - production has been measured to store one anyway, under
    // whatever default the edge falls back to when this header is absent, so
    // this is not a fix for a body production was dropping. Setting it here
    // makes that default explicit instead: CACHE_SECONDS, not whatever the
    // edge would otherwise have chosen, is what governs how long an entry may
    // be served without this code being asked again. withCacheHeaders sets
    // the same header on the clone every caller sees, which is a different
    // copy from the one put() below stores - each needs it set on its own.
    built.headers.set('cache-control', `public, max-age=${CACHE_SECONDS}`);

    const answered = withCacheHeaders(built.clone(), { state: 'miss', staleSeconds: 0 }, now, statusOf(body));

    await cacheImpl.put(key, built);

    return answered;
  } catch (error) {
    // Not a failure to answer: an answer. Never served from the store, and
    // never stored, because "no such channel" is cheap to work out again and
    // a cached one would outlive the channel appearing.
    if (error instanceof NotFound) return errorWithCacheHeaders(404, error.message);
    if (error instanceof BadRequest) return errorWithCacheHeaders(400, error.message);

    console.error(`api: building ${new URL(request.url).pathname} failed`, error);

    if (stored !== undefined && storedAge !== null && storedAge <= STALE_SECONDS) {
      const body = await stored.clone().json();

      return withCacheHeaders(stored, { state: 'stale', staleSeconds: storedAge }, now, statusOf(body));
    }

    // Nothing to fall back to. Saying so is more useful than an empty 200: the
    // caller can retry, and #71's monitoring has something to alert on.
    return errorWithCacheHeaders(503, 'the database could not be read and no cached answer is available');
  }
}
