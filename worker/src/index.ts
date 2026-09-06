import { handleApiRequest } from './api';
import { runScheduled } from './collector';
import type { Env } from './lib/env';

// The single entry point wrangler.toml points at. Collection and the API share
// one worker so that they share one D1 binding and one deploy.
const handler: ExportedHandler<Env> = {
  fetch: (request) => handleApiRequest(request),
  // waitUntil rather than a plain await: collection touches D1 and the
  // YouTube API, so it can run past the point where returning would
  // otherwise let the runtime tear the invocation down.
  scheduled: (controller, env, ctx) => ctx.waitUntil(runScheduled(controller.cron, env)),
};

export default handler;
