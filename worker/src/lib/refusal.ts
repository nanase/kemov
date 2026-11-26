import { errorResponse } from './json';

/**
 * Why the admin API refuses a request (#291): `message` is the Japanese
 * sentence the admin screen shows as it is, and `detail` says in English
 * which value was refused - what the screen reads to mark the field, and
 * what a log keeps when `message` is one of the general sentences below.
 */
export interface Refusal {
  message: string;
  detail: string;
}

// For what the screen's own controls never send - a value of the wrong type,
// a choice outside the list, a key no form has. Nobody using the screen can
// put such a thing right, so the sentence says only what failed; the detail
// keeps the rest.
export const SAVE_FAILED = '保存に失敗しました';
export const LOAD_FAILED = '読み込みに失敗しました';
export const REQUEST_FAILED = '処理に失敗しました';

// Sentences more than one resource says.
export const MEMBER_NOT_FOUND_TEXT = 'このメンバーが見つかりません';
export const DATE_SHAPE_TEXT = '日付の形式が正しくありません';
export const QUERY_TOO_LONG_TEXT = '絞り込みの語が長すぎます';

export function refusal(message: string, detail: string): Refusal {
  return { message, detail };
}

/** A save's body the screen could not have sent: `SAVE_FAILED`, with `detail` for the log. */
export function malformed(detail: string): Refusal {
  return refusal(SAVE_FAILED, detail);
}

export function refuse(status: number, { message, detail }: Refusal): Response {
  return errorResponse(status, message, detail);
}
