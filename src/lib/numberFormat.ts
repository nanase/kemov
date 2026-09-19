/**
 * How the site writes a number it measured.
 *
 * Shared by the pages built on the shell, so that the same reading is written
 * the same way wherever it appears. Time is `./timeFormat.ts`; this is
 * everything counted rather than clocked.
 */

const NUMBER = new Intl.NumberFormat('ja-JP');
const NUMBER_1 = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 1 });

/** Every absent number is one em dash, so that a hole is never a zero. */
export const DASH = '—';

export function formatCount(value: number | null | undefined, decimals = 0): string {
  if (value === null || value === undefined) return DASH;

  return decimals > 0 ? NUMBER_1.format(value) : NUMBER.format(Math.round(value));
}
