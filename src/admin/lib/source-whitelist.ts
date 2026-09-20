import { AdminApiError } from './api';

/**
 * Pure logic for the 出典ホワイトリスト screen (#175) - what `GET /admin/api/
 * source-whitelist` answers with, the path a row's own routes live at, and how
 * a failed add is worded. Kept apart from SourceWhitelistPage.vue so it can be
 * tested without touching the DOM, the same split lib/members.ts uses.
 */

/** `present()` in `worker/src/admin/source-whitelist.ts`. */
export interface SourceWhitelistEntry {
  prefix: string;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

/** `/source-whitelist/<prefix>`, the prefix percent-encoded into one path segment as the worker's router reads it. */
export function entryPath(prefix: string): string {
  return `/source-whitelist/${encodeURIComponent(prefix)}`;
}

/** What an input's text saves as: the worker refuses an empty `note`, and a note of only spaces says nothing either. */
export function noteFromInput(text: string): string | null {
  const trimmed = text.trim();

  return trimmed === '' ? null : trimmed;
}

/** Whether `draft` differs from what the row already saves. */
export function noteChanged(entry: SourceWhitelistEntry, draft: string): boolean {
  return noteFromInput(draft) !== entry.note;
}

/**
 * The line shown above the add form when an add fails. Only the one failure a
 * person can cause by ordinary use gets its own wording; a malformed prefix
 * shows the worker's own message, as every other screen's save errors do.
 */
export function addErrorMessage(error: unknown): string {
  if (error instanceof AdminApiError && error.status === 409) return 'この URL はすでに一覧にあります。';

  return error instanceof AdminApiError ? error.message : String(error);
}
