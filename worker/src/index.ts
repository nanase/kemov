import { handleApiRequest } from './api';
import { runScheduled } from './collector';
import type { Env } from './lib/env';

// The single entry point wrangler.toml points at. Collection and the API share
// one worker so that they share one D1 binding and one deploy.
const handler: ExportedHandler<Env> = {
  fetch: (request) => handleApiRequest(request),
  scheduled: (controller) => runScheduled(controller.cron),
};

export default handler;
