/**
 * Keeping Tab inside a modal confirmation (the まとめて公開 one in
 * components/BulkPublishBar.vue): the page behind it is not reachable while
 * it is open, so Tab past its last control comes back to its first.
 */

/**
 * Which of a dialog's `count` controls Tab should land on, from the one at
 * `current` (-1 when focus is on none of them), or null to let the browser
 * move it - Tab between two of them needs no help.
 */
export function wrappedFocusIndex(current: number, count: number, backwards: boolean): number | null {
  if (count === 0) return null;
  if (current === -1) return backwards ? count - 1 : 0;
  if (backwards && current === 0) return count - 1;
  if (!backwards && current === count - 1) return 0;

  return null;
}
