import type { Delta, DeltaMissing } from '@/type/api';

/**
 * Showing a change, including when there is none to show.
 *
 * The API answers a change with a number or with one of four reasons it has
 * none, and the four do not mean the same thing to somebody looking at the
 * page. Two of them say the collection is not working. Two say there is
 * nothing to show yet and the page will fill in on its own. Drawing all four
 * as the same blank puts a fault where nobody will look for it - which is what
 * the site being replaced did, writing -1 into a field for two years without
 * anyone noticing.
 *
 * So there are two marks and four sentences: the mark says which kind, and the
 * sentence says which reason.
 */

/** Whether a reason means something is wrong, or only that it is early. */
export function isFault(reason: DeltaMissing): boolean {
  return reason === 'nothing collected' || reason === 'gap too wide';
}

/** What each reason is called on the page. */
export const MISSING_TEXT: Readonly<Record<DeltaMissing, string>> = {
  'nothing collected': '統計を取得できていません',
  'gap too wide': 'この期間の記録が飛んでいます',
  'history too short': 'この期間ぶんの記録がまだありません',
  'count not collected': 'この値は公開されていません',
};

/** The mark shown in place of a number. */
export function missingMark(reason: DeltaMissing): string {
  return isFault(reason) ? '!' : '—';
}

/**
 * A change as the page draws it: a number, or a reason there is none.
 *
 * A total carries `missing` as well, because a total of eleven channels where
 * three could not be read is not the same number as a total of eleven.
 */
export type Difference = { value: number; missing: number } | { value: null; reason: DeltaMissing };

export function toDifference(delta: Delta): Difference {
  return delta.value === null ? { value: null, reason: delta.reason } : { value: delta.value, missing: 0 };
}

/**
 * Several changes added up.
 *
 * The channels that could be read are added and the rest are counted, rather
 * than the whole total being withheld or the missing ones being added as zero.
 * Zero would be a lie that looks like a number; withholding it would hide the
 * ten channels that are fine because one is not.
 *
 * With nothing readable at all there is no total to show, and the reason given
 * is the worst one present - a fault outranks a wait, because a page that says
 * "not collected yet" while collection is broken is the wrong answer.
 */
export function totalDifference(deltas: readonly Delta[]): Difference {
  const values = deltas.filter((delta) => delta.value !== null).map((delta) => delta.value as number);
  const reasons = deltas
    .filter((delta) => delta.value === null)
    .map((delta) => (delta as { reason: DeltaMissing }).reason);

  if (values.length === 0) {
    return { value: null, reason: reasons.find(isFault) ?? reasons[0] ?? 'nothing collected' };
  }

  return { value: values.reduce((total, value) => total + value, 0), missing: reasons.length };
}
