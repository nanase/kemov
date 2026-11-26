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
 * The toasts #277's 1c decided. `publish`, `savePublished` and `withdraw` are
 * for a data whose save reaches the public site in the same request (#281).
 */
export const SAVE_TOAST = {
  publish: '公開しました。本番に出ています',
  savePublished: '保存しました。本番に出ています',
  saveDraft: '下書きを保存しました',
  withdraw: '非公開に戻しました。本番から外れています',
  /** A save that neither lands on the public site nor stays a draft: a published row before #281, or a tune. */
  saved: '保存しました',
} as const;

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

/** What an edit panel shows once its row was read again: `fieldsOnReload`. */
export interface ReloadedFields<T> {
  fields: T;
  /** The fields typed in that the row now holds something else in too: changed on both screens. */
  clashes: (keyof T)[];
}

/**
 * What an edit panel shows when its row was read again and `before` - the row
 * as the panel read it - is now `after`: `after`, with the fields typed in
 * over it (#304). So a read never writes saved values over what is typed, as
 * the メンバー panel's own `fieldsOnReload` does (#286).
 *
 * Only the fields typed in are kept: the others take what is saved now, so a
 * 保存 pressed again does not turn back another screen's change to them. A
 * field is compared as a whole, a list of sources or performances included.
 */
export function fieldsOnReload<T extends object>(current: T, before: T, after: T): ReloadedFields<T> {
  const fields = plainCopy(after);
  const clashes: (keyof T)[] = [];

  for (const key of Object.keys(before) as (keyof T)[]) {
    if (sameFields(current[key], before[key])) continue;

    fields[key] = plainCopy(current[key]);

    if (!sameFields(after[key], before[key]) && !sameFields(after[key], current[key])) clashes.push(key);
  }

  return { fields, clashes };
}

/** A copy of plain form data that shares nothing with it. `structuredClone` refuses Vue's reactive proxies, which `current` usually is. */
function plainCopy<V>(value: V): V {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as V);
}

/**
 * The body of a 保存, 公開 or 非公開に戻す: `fields`, with the version of the
 * row they were typed over (#307). The worker writes only while the row is
 * still at that version, and answers 409 otherwise, so a write never lands
 * silently over another screen's. After `fieldsOnReload`, the row is the one
 * read again, and a 保存 pressed then writes over it on purpose.
 */
export function writeBody<T extends object>(fields: T, row: { version: number }): T & { version: number } {
  return { ...fields, version: row.version };
}
