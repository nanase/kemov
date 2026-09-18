import type { CertsCache } from '../lib/access';
import { verifyAccess } from '../lib/access';
import type { Env } from '../lib/env';
import { errorResponse, jsonResponse } from '../lib/json';
import { createEvent, deleteEvent, getEvent, listEvents, updateEvent } from './footprints';
import { pendingFootprints, publishEvent, publishFootprintsNow, withdrawEvent } from './footprints-publish';

/**
 * The write side of the site, behind Cloudflare Access.
 *
 * `/admin/*` outside `/admin/api/*` is left to answer 404 - there is no
 * built file for it and no route here claims it either, so the routing below
 * falls through to the same 404 the API gives an unknown path. Cloudflare
 * Access is not asked for those: the path does not exist regardless of who is
 * asking.
 *
 * `now`, `fetchImpl` and `certsCache` exist only so a test can hand
 * `verifyAccess` a key fetch and a clock of its own; every real caller leaves
 * all three out and gets `verifyAccess`'s own defaults. The same `now`, once
 * resolved, is also what "publish now" stamps `published_at` with.
 */
export async function handleAdminRequest(
  request: Request,
  env: Env,
  now?: Date,
  fetchImpl?: typeof fetch,
  certsCache?: CertsCache,
): Promise<Response> {
  const { pathname } = new URL(request.url);
  const segments = pathname.replace(/^\/+|\/+$/g, '').split('/');
  // The first segment is always 'admin' - the caller only reaches this
  // function for a path under /admin - so unlike api/index.ts's prefix there
  // is nothing here for it to be compared against.
  const [, resource, name, sub, rawId, action] = segments;
  const id = decodeSegment(rawId);

  if (resource !== 'api') return errorResponse(404, `no endpoint at ${pathname}`);

  const instant = now ?? new Date();

  // Checked before any route match, so a route that does not exist yet still
  // answers the same way an unauthorized one does: nothing under /admin/api
  // is easier to reach by asking for the wrong path.
  const identity = await verifyAccess(request, env.ACCESS_AUD, env.ACCESS_TEAM_DOMAIN, instant, fetchImpl, certsCache);

  if (identity === null) return errorResponse(401, 'not authorized by Cloudflare Access');

  // Not routed through cachedJson/errorWithCacheHeaders: those exist to serve
  // a stale answer when D1 cannot be reached (see cache.ts), which nothing
  // under /admin/api does, and to cache is to publish, which a writer's own
  // answers about to change must not be.
  if (segments.length === 3 && name === 'me') {
    if (request.method !== 'GET') return methodNotAllowed(request, 'GET');

    return jsonResponse({ email: identity.email });
  }

  if (segments.length === 4 && name === 'footprints' && sub === 'events') {
    if (request.method === 'POST') {
      const body = await readJsonObject(request);

      return 'error' in body ? body.error : await createEvent(env, body.value);
    }

    if (request.method !== 'GET') return methodNotAllowed(request, 'GET, POST');

    const { searchParams } = new URL(request.url);

    return await listEvents(env, searchParams.get('status'), searchParams.get('q'));
  }

  if (segments.length === 5 && name === 'footprints' && sub === 'events' && id !== undefined) {
    const eventId = readEventId(id);

    if (eventId === null) return errorResponse(404, `no footprints event ${id}`);

    if (request.method === 'GET') return await getEvent(env, eventId);

    if (request.method === 'DELETE') return await deleteEvent(env, eventId);

    if (request.method !== 'PUT') return methodNotAllowed(request, 'GET, PUT, DELETE');

    const body = await readJsonObject(request);

    return 'error' in body ? body.error : await updateEvent(env, eventId, body.value);
  }

  if (segments.length === 6 && name === 'footprints' && sub === 'events' && id !== undefined) {
    const eventId = readEventId(id);

    if (eventId === null) return errorResponse(404, `no footprints event ${id}`);

    if (request.method !== 'POST') return methodNotAllowed(request, 'POST');

    if (action === 'publish') return await publishEvent(env, eventId);
    if (action === 'withdraw') return await withdrawEvent(env, eventId);

    return errorResponse(404, `no endpoint at ${pathname}`);
  }

  if (segments.length === 4 && name === 'footprints' && sub === 'pending') {
    if (request.method !== 'GET') return methodNotAllowed(request, 'GET');

    return await pendingFootprints(env);
  }

  if (segments.length === 4 && name === 'footprints' && sub === 'publish') {
    if (request.method !== 'POST') return methodNotAllowed(request, 'POST');

    return await publishFootprintsNow(env, instant);
  }

  return errorResponse(404, `no endpoint at ${pathname}`);
}

/** A path segment as a footprints_event id, or null when it is not a plain positive integer. */
function readEventId(segment: string): number | null {
  if (!/^[1-9]\d*$/.test(segment)) return null;

  return Number(segment);
}

function decodeSegment(segment: string | undefined): string | undefined {
  if (segment === undefined) return undefined;

  try {
    return decodeURIComponent(segment);
  } catch {
    return undefined;
  }
}

// No blanket method guard the way api/index.ts has one for GET/HEAD: /api
// exists to read and refuses anything else before it does, but /admin is the
// write side (#141) and different routes here need different methods. Each
// route checks its own instead, through methodNotAllowed below.
function methodNotAllowed(request: Request, allow: string): Response {
  return jsonResponse({ error: `${request.method} is not allowed here` }, { status: 405, headers: { Allow: allow } });
}

/**
 * A POST/PUT body, parsed and confirmed to be a JSON object - or the 400 to
 * answer with instead of routing any further.
 */
async function readJsonObject(request: Request): Promise<{ value: Record<string, unknown> } | { error: Response }> {
  let parsed: unknown;

  try {
    parsed = await request.json();
  } catch {
    return { error: errorResponse(400, 'body must be valid JSON') };
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { error: errorResponse(400, 'body must be a JSON object') };
  }

  return { value: parsed as Record<string, unknown> };
}
