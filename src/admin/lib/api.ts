/**
 * Talking to `/admin/api/*` (#141, #144).
 *
 * Same-origin, behind Cloudflare Access, so no base URL or auth header is
 * built here - the browser already carries the Access cookie. Unlike
 * `src/lib/api.ts`'s public-API client, there is no freshness header to read
 * and no third-party shape to validate: every response is this project's own
 * worker, typed the same way on both sides.
 */

export class AdminApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    super(AdminApiError.messageFor(status, body));
    this.name = 'AdminApiError';
  }

  private static messageFor(status: number, body: unknown): string {
    if (typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string') {
      return body.error;
    }

    if (typeof body === 'object' && body !== null && 'errors' in body && Array.isArray(body.errors)) {
      return body.errors.join(' / ');
    }

    return `/admin/api answered ${status}`;
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`/admin/api${path}`, init);
  } catch (error) {
    throw new AdminApiError(0, `${path} could not be reached: ${String(error)}`);
  }

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) throw new AdminApiError(response.status, body);

  return body as T;
}

function withBody(method: string, value: unknown): RequestInit {
  return { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(value) };
}

export const getJson = <T>(path: string): Promise<T> => call<T>(path);
export const postJson = <T>(path: string, value: unknown): Promise<T> => call<T>(path, withBody('POST', value));
export const putJson = <T>(path: string, value: unknown): Promise<T> => call<T>(path, withBody('PUT', value));
export const deleteJson = <T>(path: string): Promise<T> => call<T>(path, { method: 'DELETE' });
