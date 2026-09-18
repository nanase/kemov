import { handleAdminRequest } from './admin';
import { handleApiRequest } from './api';
import { runScheduled } from './collector';
import type { Env } from './lib/env';
import { siteRedirect } from './lib/site';
import { handleDynamicPageRequest } from './pages';

/** Whether a path belongs to the admin site (#141) rather than the public one. */
function isAdminPath(pathname: string): boolean {
  return pathname === '/admin' || pathname.startsWith('/admin/');
}

// The single entry point wrangler.toml points at. Collection and both APIs
// share one worker so that they share one D1 binding and one deploy.
const handler: ExportedHandler<Env> = {
  // env for D1, and the edge cache so that a request can still be answered
  // when D1 cannot be read. caches.default is passed in rather than reached
  // for inside the API, because the tests need to supply one of their own: an
  // isolate keeps no cache entries between test files, and a cache that never
  // hits would let the stale-answer path pass untested.
  // The redirects are asked first and answer only two exact paths, so nothing
  // under /api/ or /admin/ can reach them. They are not API routes - they are
  // the site's own directories, which the built assets have no file for - so
  // they are resolved here rather than inside either handler.
  // The dynamic pages (#137, #144) are asked next, and only answer for
  // /members/<id> and /videos/<id> - null for anything else, including
  // /members/ and /videos/ themselves, which ASSETS already serves.
  // /admin/* is asked after and separately from /api/*: the two grew from
  // #141 deciding to split reading (/api, public, cached) from writing
  // (/admin/api, behind Cloudflare Access) into two routes rather than one
  // that branches on the method, and handleApiRequest already refuses every
  // method /api does not read with, so an admin path must never reach it.
  fetch: async (request, env) => {
    const url = new URL(request.url);
    const redirect = siteRedirect(url);

    if (redirect !== null) return redirect;

    const page = await handleDynamicPageRequest(request, env);

    if (page !== null) return page;

    return isAdminPath(url.pathname)
      ? handleAdminRequest(request, env)
      : handleApiRequest(request, env, caches.default);
  },
  // waitUntil rather than a plain await: collection touches D1 and the
  // YouTube API, so it can run past the point where returning would
  // otherwise let the runtime tear the invocation down.
  scheduled: (controller, env, ctx) => ctx.waitUntil(runScheduled(controller.cron, env)),
};

export default handler;
