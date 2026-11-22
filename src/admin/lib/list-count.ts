/**
 * The count beside a list's filters (#277's 6-14): 「12 件」, and 「12 / 40 件」
 * while a filter narrows it. `total` is null while the whole list's count is
 * unknown - not read yet, or the read failed - and the count then stands
 * alone rather than putting a guess beside it.
 */
export function countText(shown: number, total: number | null, filtered: boolean): string {
  return filtered && total !== null ? `${shown} / ${total} 件` : `${shown} 件`;
}
