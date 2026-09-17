import { verifyAccess } from '../lib/access';
import type { Env } from '../lib/env';
import { errorResponse, jsonResponse } from '../lib/json';

/**
 * The write side of the site, behind Cloudflare Access.
 *
 * #144 is the entry point and the check only: there is no screen and nothing
 * here changes data yet. Both arrive in later tasks, added as further routes
 * under `/admin/api`.
 *
 * `/admin/*` outside `/admin/api/*` is left to answer 404 - there is no
 * built file for it and no route here claims it either, so the routing below
 * falls through to the same 404 the API gives an unknown path. Cloudflare
 * Access is not asked for those: the path does not exist regardless of who is
 * asking.
 */
export async function handleAdminRequest(request: Request, env: Env): Promise<Response> {
  const { pathname } = new URL(request.url);
  const segments = pathname.replace(/^\/+|\/+$/g, '').split('/');
  // The first segment is always 'admin' - the caller only reaches this
  // function for a path under /admin - so unlike api/index.ts's prefix there
  // is nothing here for it to be compared against.
  const [, resource, name] = segments;

  if (resource !== 'api') return errorResponse(404, `no endpoint at ${pathname}`);

  // Checked before any route match, so a route that does not exist yet still
  // answers the same way an unauthorized one does: nothing under /admin/api
  // is easier to reach by asking for the wrong path.
  const identity = verifyAccess(request, env.ACCESS_AUD);

  if (identity === null) return errorResponse(401, 'not authorized by Cloudflare Access');

  // Not routed through cachedJson/errorWithCacheHeaders: those exist to serve
  // a stale answer when D1 cannot be reached (see cache.ts), which nothing
  // under /admin/api does, and to cache is to publish, which a writer's own
  // answers about to change must not be.
  if (segments.length === 3 && name === 'me') return jsonResponse({ email: identity.email });

  return errorResponse(404, `no endpoint at ${pathname}`);
}

// No method guard in front of this the way api/index.ts has one for GET/HEAD:
// /api exists to read and refuses anything else before it does, but /admin is
// the write side (#141) and later routes here will need POST. Each route
// checked its method itself is intentional given that direction, not the
// early rejection api/index.ts uses.
