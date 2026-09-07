import { handleApiRequest } from './api';
import { runScheduled } from './collector';
import type { Env } from './lib/env';

// The single entry point wrangler.toml points at. Collection and the API share
// one worker so that they share one D1 binding and one deploy.
const handler: ExportedHandler<Env> = {
  // env for D1, and the edge cache so that a request can still be answered
  // when D1 cannot be read. caches.default is passed in rather than reached
  // for inside the API, because the tests need to supply one of their own: an
  // isolate keeps no cache entries between test files, and a cache that never
  // hits would let the stale-answer path pass untested.
  fetch: (request, env) => handleApiRequest(request, env, caches.default),
  // waitUntil rather than a plain await: collection touches D1 and the
  // YouTube API, so it can run past the point where returning would
  // otherwise let the runtime tear the invocation down.
  scheduled: (controller, env, ctx) => ctx.waitUntil(runScheduled(controller.cron, env)),
};

export default handler;
