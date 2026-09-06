import { errorResponse } from '../lib/json';

/**
 * The HTTP API.
 *
 * The endpoints listed in #58 are implemented in #69. Until then every path is
 * unknown, which is the answer the finished API gives for an unknown path as
 * well, so nothing here has to be undone.
 */
export function handleApiRequest(request: Request): Response {
  const { pathname } = new URL(request.url);

  return errorResponse(404, `no endpoint at ${pathname}`);
}
