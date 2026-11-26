/**
 * Talking to `/admin/api/*` (#141, #144).
 *
 * Same-origin, behind Cloudflare Access, so no base URL or auth header is
 * built here - the browser already carries the Access cookie. Unlike
 * `src/lib/api.ts`'s public-API client, there is no freshness header to read
 * and no third-party shape to validate: every response is this project's own
 * worker, typed the same way on both sides.
 */

import { CHANGED_ELSEWHERE_TEXT } from './changed-elsewhere';

export { CHANGED_ELSEWHERE_TEXT };

/** What the screen says when the worker could not be reached at all. */
export const UNREACHABLE_TEXT = 'サーバーに接続できませんでした';

/**
 * What the screen says for an answer with no `error` of the worker's own to
 * show - a 500 from the platform in front of it, say. `status` still says
 * which.
 */
export const FAILED_TEXT = '処理に失敗しました';

export class AdminApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    super(AdminApiError.messageFor(body));
    this.name = 'AdminApiError';
  }

  /**
   * The worker's English for which value it refused (#291) - or, for a
   * request that got no answer, what `call` says about the failure - and null
   * when there is none. Not for the screen to show: `message` is that.
   */
  get detail(): string | null {
    const { body } = this;

    if (typeof body === 'string') return body;

    return typeof body === 'object' && body !== null && 'detail' in body && typeof body.detail === 'string'
      ? body.detail
      : null;
  }

  /** Whether the worker answered that another screen changed the row meanwhile (`CHANGED_ELSEWHERE_TEXT`). */
  get changedElsewhere(): boolean {
    return AdminApiError.isChangedElsewhere(this.body);
  }

  private static isChangedElsewhere(body: unknown): boolean {
    return typeof body === 'object' && body !== null && 'changedElsewhere' in body && body.changedElsewhere === true;
  }

  private static messageFor(body: unknown): string {
    // `call`'s own catch passes a plain description string here (status 0,
    // the fetch itself failed) rather than a parsed JSON error body. It is
    // English for the log, kept as `detail`.
    if (typeof body === 'string') return UNREACHABLE_TEXT;

    // A delete's words are put in by `publishAnswerFor`, which knows the action.
    if (AdminApiError.isChangedElsewhere(body)) return CHANGED_ELSEWHERE_TEXT.save;

    if (typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string') {
      return body.error;
    }

    if (typeof body === 'object' && body !== null && 'errors' in body && Array.isArray(body.errors)) {
      return body.errors.join(' / ');
    }

    return FAILED_TEXT;
  }
}

/**
 * What a screen's `fieldForSaveError` reads to find the field `error` is
 * about: the worker's `detail` when it gave one, its message otherwise. The
 * message alone is not enough - fields that share one sentence, such as the
 * four colours, differ only in the detail.
 */
export function errorDetail(error: unknown): string {
  if (error instanceof AdminApiError) return error.detail ?? error.message;

  return error instanceof Error ? error.message : String(error);
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
