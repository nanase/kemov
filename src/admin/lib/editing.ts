/**
 * What the three edit panels (あしあと・登録者数の節目・ジェネット楽曲一覧)
 * share about unsaved changes, deleting and the toast after a save (#280,
 * #277's decision 1b・1c・6-10・6-11・6-13). The Vue half - the guard that
 * asks before the changes are thrown away - is `unsaved-guard.ts`.
 */

export const EDITING_TEXT = {
  unsaved: '未保存',
  confirmDiscard: '保存していない変更があります。変更を捨てて移りますか？',
  confirmDiscardTune: 'この曲に保存していない変更があります。変更を捨てて外しますか？',
  remove: '削除',
  removeConfirm: '削除する',
  removeCancel: 'やめる',
  removed: '削除しました',
} as const;

/**
 * The toasts #277's 1c decided. あしあと uses all of them since #281
 * (lib/footprints-publish.ts). A data still publishing in two steps uses
 * `saveToastFor` instead: its published row's save does not reach the public
 * site until the 公開 screen's 「いま公開する」, so `savePublished` would say
 * something untrue there.
 */
export const SAVE_TOAST = {
  publish: '公開しました。本番に出ています',
  savePublished: '保存しました。本番に出ています',
  saveDraft: '下書きを保存しました',
  withdraw: '非公開に戻しました。本番から外れています',
  /** A save that neither lands on the public site nor stays a draft: a published row before #281, or a tune. */
  saved: '保存しました',
} as const;

/** The toast after saving a row whose `status` is `status`, for a data whose publishing still takes the 公開 screen. */
export function saveToastFor(status: string): string {
  return status === 'published' ? SAVE_TOAST.saved : SAVE_TOAST.saveDraft;
}

/**
 * Whether two sets of form fields say the same thing - plain data only
 * (strings, numbers, booleans, null, arrays and objects of them).
 *
 * An empty string and null count as the same: a text box bound to a nullable
 * field writes '' once something is typed and erased again, and the panel
 * would otherwise call a field changed that reads exactly as it did.
 */
export function sameFields(a: unknown, b: unknown): boolean {
  if (isBlank(a) && isBlank(b)) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => sameFields(v, b[i]));
  }
  if (isRecord(a) && isRecord(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);

    return [...keys].every((key) => sameFields(a[key], b[key]));
  }

  return a === b;
}

function isBlank(value: unknown): boolean {
  return value === null || value === undefined || value === '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
