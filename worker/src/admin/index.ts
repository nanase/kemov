import type { CertsCache } from '../lib/access';
import { verifyAccess } from '../lib/access';
import type { Env } from '../lib/env';
import { errorResponse, jsonResponse } from '../lib/json';
import { listMembers, updateMember } from './members';
import { deleteSnapshotExclusion, listSnapshotExclusions, saveSnapshotExclusion } from './snapshot-exclusions';
import { deleteVideoOverride, listVideoOverrides, saveVideoOverride } from './video-overrides';

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
 * resolved, is also what a save stamps its own timestamp with (see
 * video-overrides.ts): one instant for the whole request rather than two
 * clock reads a moment apart.
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
  // is nothing here for it to be compared against. segments.length below
  // counts these raw segments, so decoding happens after: it must not change
  // how many of them there are.
  const [, resource, name, rawId, rawId2] = segments;
  // channel_snapshot_exclusion's fetched_at (2026-09-08T00:00:00Z) has colons
  // in it, which a caller that percent-encodes a path segment - the ordinary
  // way to build one from an arbitrary string - turns into %3A. Left
  // undecoded, that value would never match the row it names. A segment that
  // fails to decode (a malformed % escape) becomes undefined, the same as
  // one that was never there, and falls through to the 404 below.
  const id = decodeSegment(rawId);
  const id2 = decodeSegment(rawId2);

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

  if (segments.length === 3 && name === 'members') {
    if (request.method !== 'GET') return methodNotAllowed(request, 'GET');

    return await listMembers(env);
  }

  if (segments.length === 4 && name === 'members' && id !== undefined) {
    if (request.method !== 'PUT') return methodNotAllowed(request, 'PUT');

    const body = await readJsonObject(request);

    return 'error' in body ? body.error : await updateMember(env, id, body.value);
  }

  if (segments.length === 3 && name === 'video-overrides') {
    if (request.method !== 'GET') return methodNotAllowed(request, 'GET');

    return await listVideoOverrides(env);
  }

  if (segments.length === 4 && name === 'video-overrides' && id !== undefined) {
    if (request.method === 'DELETE') return await deleteVideoOverride(env, id);

    if (request.method !== 'PUT') return methodNotAllowed(request, 'PUT, DELETE');

    const body = await readJsonObject(request);

    return 'error' in body ? body.error : await saveVideoOverride(env, id, body.value, instant);
  }

  if (segments.length === 3 && name === 'snapshot-exclusions') {
    if (request.method !== 'GET') return methodNotAllowed(request, 'GET');

    return await listSnapshotExclusions(env);
  }

  if (segments.length === 5 && name === 'snapshot-exclusions' && id !== undefined && id2 !== undefined) {
    if (request.method === 'DELETE') return await deleteSnapshotExclusion(env, id, id2);

    if (request.method !== 'PUT') return methodNotAllowed(request, 'PUT, DELETE');

    const body = await readJsonObject(request);

    return 'error' in body ? body.error : await saveSnapshotExclusion(env, id, id2, body.value);
  }

  return errorResponse(404, `no endpoint at ${pathname}`);
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
 * A PUT body, parsed and confirmed to be a JSON object - or the 400 to
 * answer with instead of routing any further.
 *
 * Centralized here rather than in each of members.ts, video-overrides.ts and
 * snapshot-exclusions.ts: all three need the same "is this something a save
 * could possibly apply to" check before their own field-by-field validation,
 * and only the router sees the raw Request each of them would otherwise have
 * to parse for itself.
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
