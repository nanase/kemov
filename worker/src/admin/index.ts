import type { CertsCache } from '../lib/access';
import { verifyAccess } from '../lib/access';
import type { Env } from '../lib/env';
import { errorResponse, jsonResponse } from '../lib/json';
import { ackCollectTask, listCollectTasks, markCollectTaskUnavailable, retryCollectTask } from './collect-tasks';
import { createEvent, deleteEvent, getEvent, listEvents, updateEvent } from './footprints';
import { pendingFootprints, publishEvent, publishFootprintsNow, withdrawEvent } from './footprints-publish';
import { createPerson, deletePerson, getPerson, listPeople, updatePerson } from './genet-people';
import { pendingGenetMusic, publishGenetMusicNow, publishStream, withdrawStream } from './genet-publish';
import { createStream, deleteStream, getStream, listStreams, updateStream } from './genet-streams';
import { createTune, deleteTune, getTune, listTunes, updateTune } from './genet-tunes';
import { addMember, deleteMember, listMembers, saveMembers, updateMember } from './members';
import { listPublications } from './publications';
import { getRevision, listRevisions, readRevisionId } from './revisions';
import { listSnapshots } from './snapshots';
import {
  createMilestone,
  deleteMilestone,
  getMilestone,
  listMilestones,
  updateMilestone,
} from './subscriber-milestones';
import {
  pendingSubscriberMilestones,
  publishMilestone,
  publishSubscriberMilestonesNow,
  withdrawMilestone,
} from './subscriber-milestones-publish';
import {
  addSourceWhitelist,
  deleteSourceWhitelist,
  listSourceWhitelist,
  updateSourceWhitelist,
} from './source-whitelist';
import { deleteSnapshotExclusion, listSnapshotExclusions, saveSnapshotExclusion } from './snapshot-exclusions';
import { deleteVideoOverride, listVideoOverrides, saveVideoOverride } from './video-overrides';
import { listVideos } from './videos';

/**
 * The write side of the site, behind Cloudflare Access.
 *
 * `/admin/*` outside `/admin/api/*` answers the admin page itself (#144) -
 * the same built HTML for every path, since which screen it names is a route
 * `src/admin/router.ts` reads client-side, not one this worker understands.
 * Cloudflare Access already sits in front of all of `/admin`, so this does
 * not call `verifyAccess` the way `/admin/api/*` below does: #141's design
 * keeps the worker's own check in front of the write API alone, not the page
 * that merely renders it.
 *
 * `now`, `fetchImpl` and `certsCache` exist only so a test can hand
 * `verifyAccess` a key fetch and a clock of its own; every real caller leaves
 * all three out and gets `verifyAccess`'s own defaults. The same `now`, once
 * resolved, is also what "publish now" stamps `published_at` with, and what a
 * save stamps its own timestamp with (see video-overrides.ts): one instant
 * for the whole request rather than two clock reads a moment apart. `assets`
 * exists so a test can hand the page route a `Fetcher` of its own, the same
 * reason `pages.ts`'s own `handleDynamicPageRequest` takes one.
 */
export async function handleAdminRequest(
  request: Request,
  env: Env,
  now?: Date,
  fetchImpl?: typeof fetch,
  certsCache?: CertsCache,
  assets: Fetcher = env.ASSETS,
): Promise<Response> {
  const url = new URL(request.url);
  const { pathname } = url;
  const segments = pathname.replace(/^\/+|\/+$/g, '').split('/');
  // The first segment is always 'admin' - the caller only reaches this
  // function for a path under /admin - so unlike api/index.ts's prefix there
  // is nothing here for it to be compared against. segments.length below
  // counts these raw segments, so decoding happens after: it must not change
  // how many of them there are.
  //
  // The last two positions mean different things for different resources:
  // footprints' own routes use them as a literal word (`sub`, e.g. 'events'
  // or 'publish') and an action (`action`, e.g. 'publish' or 'withdraw'),
  // while members/video-overrides/snapshot-exclusions use the same two slots
  // as a second id instead - snapshot-exclusions needs both a channel_id and
  // a fetched_at. `id` and `id2` below decode whichever of the two a given
  // route actually reads as an id.
  const [, resource, name, sub, rawId, action] = segments;
  // channel_snapshot_exclusion's fetched_at (2026-09-08T00:00:00Z) has colons
  // in it, which a caller that percent-encodes a path segment - the ordinary
  // way to build one from an arbitrary string - turns into %3A. Left
  // undecoded, that value would never match the row it names. A segment that
  // fails to decode (a malformed % escape) becomes undefined, the same as
  // one that was never there, and falls through to the 404 below.
  const id = decodeSegment(sub);
  const id2 = decodeSegment(rawId);

  if (resource !== 'api') return await servePage(request, assets, url);

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

  if (segments.length === 5 && name === 'footprints' && sub === 'events' && id2 !== undefined) {
    const eventId = readEventId(id2);

    if (eventId === null) return errorResponse(404, `no footprints event ${id2}`);

    if (request.method === 'GET') return await getEvent(env, eventId);

    if (request.method === 'DELETE') return await deleteEvent(env, eventId);

    if (request.method !== 'PUT') return methodNotAllowed(request, 'GET, PUT, DELETE');

    const body = await readJsonObject(request);

    return 'error' in body ? body.error : await updateEvent(env, eventId, body.value);
  }

  if (segments.length === 6 && name === 'footprints' && sub === 'events' && id2 !== undefined) {
    const eventId = readEventId(id2);

    if (eventId === null) return errorResponse(404, `no footprints event ${id2}`);

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

  // The same shape as footprints' routes: `sub` is the literal 'milestones',
  // 'pending' or 'publish', and the id and action follow it.
  if (segments.length === 4 && name === 'subscribers' && sub === 'milestones') {
    if (request.method === 'POST') {
      const body = await readJsonObject(request);

      return 'error' in body ? body.error : await createMilestone(env, body.value);
    }

    if (request.method !== 'GET') return methodNotAllowed(request, 'GET, POST');

    const { searchParams } = new URL(request.url);

    return await listMilestones(env, searchParams.get('channelId'), searchParams.get('status'));
  }

  if (segments.length === 5 && name === 'subscribers' && sub === 'milestones' && id2 !== undefined) {
    const milestoneId = readPositiveInt(id2);

    if (milestoneId === null) return errorResponse(404, `no subscriber milestone ${id2}`);

    if (request.method === 'GET') return await getMilestone(env, milestoneId);

    if (request.method === 'DELETE') return await deleteMilestone(env, milestoneId);

    if (request.method !== 'PUT') return methodNotAllowed(request, 'GET, PUT, DELETE');

    const body = await readJsonObject(request);

    return 'error' in body ? body.error : await updateMilestone(env, milestoneId, body.value);
  }

  if (segments.length === 6 && name === 'subscribers' && sub === 'milestones' && id2 !== undefined) {
    const milestoneId = readPositiveInt(id2);

    if (milestoneId === null) return errorResponse(404, `no subscriber milestone ${id2}`);

    if (request.method !== 'POST') return methodNotAllowed(request, 'POST');

    if (action === 'publish') return await publishMilestone(env, milestoneId);
    if (action === 'withdraw') return await withdrawMilestone(env, milestoneId);

    return errorResponse(404, `no endpoint at ${pathname}`);
  }

  if (segments.length === 4 && name === 'subscribers' && sub === 'pending') {
    if (request.method !== 'GET') return methodNotAllowed(request, 'GET');

    return await pendingSubscriberMilestones(env);
  }

  if (segments.length === 4 && name === 'subscribers' && sub === 'publish') {
    if (request.method !== 'POST') return methodNotAllowed(request, 'POST');

    return await publishSubscriberMilestonesNow(env, instant);
  }

  if (segments.length === 4 && name === 'genet' && sub === 'streams') {
    if (request.method === 'POST') {
      const body = await readJsonObject(request);

      return 'error' in body ? body.error : await createStream(env, body.value);
    }

    if (request.method !== 'GET') return methodNotAllowed(request, 'GET, POST');

    const { searchParams } = new URL(request.url);

    return await listStreams(env, searchParams.get('status'), searchParams.get('q'));
  }

  if (segments.length === 5 && name === 'genet' && sub === 'streams' && id2 !== undefined) {
    if (request.method === 'GET') return await getStream(env, id2);

    if (request.method === 'DELETE') return await deleteStream(env, id2);

    if (request.method !== 'PUT') return methodNotAllowed(request, 'GET, PUT, DELETE');

    const body = await readJsonObject(request);

    return 'error' in body ? body.error : await updateStream(env, id2, body.value);
  }

  if (segments.length === 6 && name === 'genet' && sub === 'streams' && id2 !== undefined) {
    if (request.method !== 'POST') return methodNotAllowed(request, 'POST');

    if (action === 'publish') return await publishStream(env, id2);
    if (action === 'withdraw') return await withdrawStream(env, id2);

    return errorResponse(404, `no endpoint at ${pathname}`);
  }

  if (segments.length === 4 && name === 'genet' && sub === 'tunes') {
    if (request.method === 'POST') {
      const body = await readJsonObject(request);

      return 'error' in body ? body.error : await createTune(env, body.value);
    }

    if (request.method !== 'GET') return methodNotAllowed(request, 'GET, POST');

    const { searchParams } = new URL(request.url);

    return await listTunes(env, searchParams.get('q'));
  }

  if (segments.length === 5 && name === 'genet' && sub === 'tunes' && id2 !== undefined) {
    const tuneId = readPositiveInt(id2);

    if (tuneId === null) return errorResponse(404, `no tune ${id2}`);

    if (request.method === 'GET') return await getTune(env, tuneId);

    if (request.method === 'DELETE') return await deleteTune(env, tuneId);

    if (request.method !== 'PUT') return methodNotAllowed(request, 'GET, PUT, DELETE');

    const body = await readJsonObject(request);

    return 'error' in body ? body.error : await updateTune(env, tuneId, body.value);
  }

  if (segments.length === 4 && name === 'genet' && sub === 'people') {
    if (request.method === 'POST') {
      const body = await readJsonObject(request);

      return 'error' in body ? body.error : await createPerson(env, body.value);
    }

    if (request.method !== 'GET') return methodNotAllowed(request, 'GET, POST');

    return await listPeople(env);
  }

  if (segments.length === 5 && name === 'genet' && sub === 'people' && id2 !== undefined) {
    const personId = readPositiveInt(id2);

    if (personId === null) return errorResponse(404, `no person ${id2}`);

    if (request.method === 'GET') return await getPerson(env, personId);

    if (request.method === 'DELETE') return await deletePerson(env, personId);

    if (request.method !== 'PUT') return methodNotAllowed(request, 'GET, PUT, DELETE');

    const body = await readJsonObject(request);

    return 'error' in body ? body.error : await updatePerson(env, personId, body.value);
  }

  if (segments.length === 4 && name === 'genet' && sub === 'pending') {
    if (request.method !== 'GET') return methodNotAllowed(request, 'GET');

    return await pendingGenetMusic(env);
  }

  if (segments.length === 4 && name === 'genet' && sub === 'publish') {
    if (request.method !== 'POST') return methodNotAllowed(request, 'POST');

    return await publishGenetMusicNow(env, instant);
  }

  if (segments.length === 3 && name === 'members') {
    if (request.method === 'GET') return await listMembers(env);

    if (request.method !== 'POST' && request.method !== 'PUT') return methodNotAllowed(request, 'GET, POST, PUT');

    const body = await readJsonObject(request);

    if ('error' in body) return body.error;

    return request.method === 'POST' ? await addMember(env, body.value) : await saveMembers(env, body.value);
  }

  if (segments.length === 4 && name === 'members' && id !== undefined) {
    if (request.method === 'DELETE') return await deleteMember(env, id);

    if (request.method !== 'PUT') return methodNotAllowed(request, 'PUT, DELETE');

    const body = await readJsonObject(request);

    return 'error' in body ? body.error : await updateMember(env, id, body.value);
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

  if (segments.length === 3 && name === 'videos') {
    if (request.method !== 'GET') return methodNotAllowed(request, 'GET');

    const { searchParams } = new URL(request.url);

    return await listVideos(env, searchParams.get('q'), searchParams.get('channelId'), searchParams.get('limit'));
  }

  if (segments.length === 3 && name === 'snapshots') {
    if (request.method !== 'GET') return methodNotAllowed(request, 'GET');

    const { searchParams } = new URL(request.url);

    return await listSnapshots(
      env,
      searchParams.get('channelId'),
      searchParams.get('from'),
      searchParams.get('to'),
      instant,
    );
  }

  if (segments.length === 3 && name === 'source-whitelist') {
    if (request.method === 'POST') {
      const body = await readJsonObject(request);

      return 'error' in body ? body.error : await addSourceWhitelist(env, body.value);
    }

    if (request.method !== 'GET') return methodNotAllowed(request, 'GET, POST');

    return await listSourceWhitelist(env);
  }

  // The prefix is a URL, so it arrives percent-encoded in one segment and
  // `id` is it decoded - the same reading snapshot-exclusions gives a
  // fetched_at.
  if (segments.length === 4 && name === 'source-whitelist' && id !== undefined) {
    if (request.method === 'DELETE') return await deleteSourceWhitelist(env, id);

    if (request.method !== 'PUT') return methodNotAllowed(request, 'PUT, DELETE');

    const body = await readJsonObject(request);

    return 'error' in body ? body.error : await updateSourceWhitelist(env, id, body.value);
  }

  if (segments.length === 3 && name === 'collect-tasks') {
    if (request.method !== 'GET') return methodNotAllowed(request, 'GET');

    return await listCollectTasks(env);
  }

  // id/id2 are the kind and target_id here, not a second id slot the way
  // snapshot-exclusions reads them - collect_task's own primary key is
  // likewise composite (kind, target_id), so this reuses the same two slots
  // for the same reason, with `action` (segment 5) naming which of the three
  // exits #141 decided rather than a literal the way footprints' own
  // events/:id/publish reads it.
  if (segments.length === 6 && name === 'collect-tasks' && id !== undefined && id2 !== undefined) {
    if (request.method !== 'POST') return methodNotAllowed(request, 'POST');

    if (action === 'retry') return await retryCollectTask(env, id, id2, instant);
    if (action === 'ack') return await ackCollectTask(env, id, id2, instant);
    if (action === 'unavailable') return await markCollectTaskUnavailable(env, id, id2, instant);

    return errorResponse(404, `no endpoint at ${pathname}`);
  }

  if (segments.length === 3 && name === 'revisions') {
    if (request.method !== 'GET') return methodNotAllowed(request, 'GET');

    const { searchParams } = new URL(request.url);

    return await listRevisions(
      env,
      searchParams.get('entity'),
      searchParams.get('action'),
      searchParams.get('from'),
      searchParams.get('to'),
      searchParams.get('limit'),
    );
  }

  if (segments.length === 4 && name === 'revisions' && id !== undefined) {
    if (request.method !== 'GET') return methodNotAllowed(request, 'GET');

    const revisionId = readRevisionId(id);

    if (revisionId === null) return errorResponse(404, `no revision ${id}`);

    return await getRevision(env, revisionId);
  }

  if (segments.length === 3 && name === 'publications') {
    if (request.method !== 'GET') return methodNotAllowed(request, 'GET');

    return await listPublications(env);
  }

  return errorResponse(404, `no endpoint at ${pathname}`);
}

/**
 * A path segment as a genet_tune or genet_person id, or null when it is not a
 * plain positive integer. `Number.isSafeInteger` guards against a segment
 * with enough digits to round to a different integer, or to `Infinity`, once
 * `Number` parses it - `/^[1-9]\d*$/` alone only rules out a non-digit shape.
 */
function readPositiveInt(segment: string): number | null {
  if (!/^[1-9]\d*$/.test(segment)) return null;

  const value = Number(segment);

  return Number.isSafeInteger(value) ? value : null;
}

/**
 * A path segment as a footprints_event id, or null when it is not a plain
 * positive integer. `Number.isSafeInteger` guards against a segment with
 * enough digits to round to a different integer, or to `Infinity`, once
 * `Number` parses it - `/^[1-9]\d*$/` alone only rules out a non-digit shape.
 */
function readEventId(segment: string): number | null {
  if (!/^[1-9]\d*$/.test(segment)) return null;

  const value = Number(segment);

  return Number.isSafeInteger(value) ? value : null;
}

/**
 * `/admin/*` outside `/admin/api/*` - the built page, whatever the path, so
 * that `/admin/footprints`, a reload on it, and a shared link all answer the
 * same way. `ASSETS` is asked for `/admin/` specifically (the built
 * `src/admin/index.html`), the same "one HTML file answers every path under
 * here" shape `pages.ts`'s own dynamic pages fall back to.
 */
async function servePage(request: Request, assets: Fetcher, url: URL): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response(`${request.method} is not allowed here`, { status: 405, headers: { Allow: 'GET, HEAD' } });
  }

  return await assets.fetch(new Request(new URL('/admin/', url), { method: 'GET' }));
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
 *
 * Centralized here rather than in each of footprints.ts, members.ts,
 * video-overrides.ts and snapshot-exclusions.ts: all of them need the same
 * "is this something a save could possibly apply to" check before their own
 * field-by-field validation, and only the router sees the raw Request each
 * of them would otherwise have to parse for itself.
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
