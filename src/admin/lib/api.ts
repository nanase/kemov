/**
 * Talking to `/admin/api/*` (#141, #144).
 *
 * Same-origin, behind Cloudflare Access, so no base URL or auth header is
 * built here - the browser already carries the Access cookie. Unlike
 * `src/lib/api.ts`'s public-API client, there is no freshness header to read
 * and no third-party shape to validate: every response is this project's own
 * worker, typed the same way on both sides.
 */

/**
 * What the screen says for a 409 the worker marks `changedElsewhere`: another
 * screen changed the row between this one's read and its write (#299). The
 * worker's own message is for logs, and is not shown.
 */
export const CHANGED_ELSEWHERE_TEXT = {
  save: '別の画面で変更されたため保存できませんでした',
  remove: '別の画面で変更されたため削除できませんでした',
} as const;

export class AdminApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    super(AdminApiError.messageFor(status, body));
    this.name = 'AdminApiError';
  }

  /**
   * The worker's English for which value it refused (#291), or null when it
   * gave none. Not for the screen to show: `message` is that.
   */
  get detail(): string | null {
    const { body } = this;

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

  private static messageFor(status: number, body: unknown): string {
    // `call`'s own catch passes a plain description string here (status 0,
    // the fetch itself failed) rather than a parsed JSON error body - without
    // this, that string fails every check below and the network failure's
    // own message is lost behind "/admin/api answered 0".
    if (typeof body === 'string') return body;

    // A delete's words are put in by `publishAnswerFor`, which knows the action.
    if (AdminApiError.isChangedElsewhere(body)) return CHANGED_ELSEWHERE_TEXT.save;

    if (typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string') {
      return body.error;
    }

    if (typeof body === 'object' && body !== null && 'errors' in body && Array.isArray(body.errors)) {
      return body.errors.join(' / ');
    }

    return `/admin/api answered ${status}`;
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
