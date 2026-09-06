/**
 * Every API response is JSON, so the content type is decided here once rather
 * than at each endpoint.
 */
export function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);

  headers.set('content-type', 'application/json; charset=UTF-8');

  return new Response(JSON.stringify(body), { ...init, headers });
}

/**
 * Failures carry a JSON body too. A caller that always parses JSON then needs
 * no second path for the error case.
 */
export function errorResponse(status: number, message: string): Response {
  return jsonResponse({ error: message }, { status });
}
