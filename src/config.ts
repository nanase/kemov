/**
 * Where the site's data comes from.
 *
 * One base path, because the API and these pages are served by the same
 * worker: `/api/*` is answered by its fetch handler and everything else by the
 * static assets built from this directory. A relative path is therefore a
 * same-origin one, which is what keeps the browser from a preflight on every
 * request - the four absolute URLs this replaced pointed at two other hosts.
 *
 * VITE_API_BASE overrides it for `vite dev`, where these pages are served by
 * vite on its own port and the worker is not there at all. Point it at a
 * `wrangler dev` or at the deployment.
 */
export const apiBase: string = import.meta.env.VITE_API_BASE ?? '/api';
