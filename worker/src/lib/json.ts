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
 *
 * `detail` is for the admin API (#291): `message` is the Japanese sentence
 * the admin screen shows, and `detail` says in English which value was
 * refused - what the screen reads to mark the field, and what a log keeps
 * when `message` is a general one.
 */
export function errorResponse(status: number, message: string, detail?: string): Response {
  return jsonResponse(detail === undefined ? { error: message } : { error: message, detail }, { status });
}

/**
 * The 409 for a row another request changed between this one's read and its
 * write (#299). `changedElsewhere` lets the admin screen put its own words in
 * place of `message`, which stays for logs and tests.
 */
export function changedElsewhereResponse(message: string): Response {
  return jsonResponse({ error: message, changedElsewhere: true }, { status: 409 });
}
