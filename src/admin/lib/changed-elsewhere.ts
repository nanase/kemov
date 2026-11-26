/**
 * What the screen says for a 409 the worker marks `changedElsewhere`: another
 * screen changed the row between this one's read and its write (#299). The
 * worker puts the same words in the 409's `error`, and imports them from here
 * so the two cannot drift apart.
 */
export const CHANGED_ELSEWHERE_TEXT = {
  save: '別の画面で変更されたため保存できませんでした',
  remove: '別の画面で変更されたため削除できませんでした',
} as const;
