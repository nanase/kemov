import { handleApiRequest } from './api';
import { runScheduled } from './collector';
import type { Env } from './lib/env';
import { siteRedirect } from './site';

// The single entry point wrangler.toml points at. Collection and the API share
// one worker so that they share one D1 binding and one deploy.
const handler: ExportedHandler<Env> = {
  // env for D1, and the edge cache so that a request can still be answered
  // when D1 cannot be read. caches.default is passed in rather than reached
  // for inside the API, because the tests need to supply one of their own: an
  // isolate keeps no cache entries between test files, and a cache that never
  // hits would let the stale-answer path pass untested.
  // The redirects are asked first and answer only two exact paths, so nothing
  // under /api/ can reach them. They are here rather than inside the API
  // because they are not API routes: they are the site's own directories,
  // which the assets have no file for.
  fetch: (request, env) => siteRedirect(new URL(request.url)) ?? handleApiRequest(request, env, caches.default),
  // waitUntil rather than a plain await: collection touches D1 and the
  // YouTube API, so it can run past the point where returning would
  // otherwise let the runtime tear the invocation down.
  scheduled: (controller, env, ctx) => ctx.waitUntil(runScheduled(controller.cron, env)),
};

export default handler;
