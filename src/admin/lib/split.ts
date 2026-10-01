/**
 * How much of a page's height the list takes when an item is open below it:
 * the list above, the editor below, and a bar between them that moves. A
 * percentage of the area the two share, kept per page in the reader's own
 * browser.
 *
 * The bounds keep both halves usable: below 20% the list shows no row at all,
 * above 70% the editor shows little more than its own head and foot.
 */
export const SPLIT_DEFAULT = 40;
export const SPLIT_MIN = 20;
export const SPLIT_MAX = 70;

/** How far one arrow key moves the bar. */
const STEP = 4;

export function clampSplit(pct: number): number {
  return Math.round(Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, pct)) * 10) / 10;
}

/** Where a pointer at `clientY` puts the bar, in an area that starts at `top` and is `height` tall. */
export function splitFromPointer(clientY: number, top: number, height: number): number {
  if (height <= 0) return SPLIT_DEFAULT;

  return clampSplit(((clientY - top) / height) * 100);
}

/** One arrow key: -1 (up) makes the list shorter, 1 (down) taller. */
export function stepSplit(pct: number, direction: -1 | 1): number {
  return clampSplit(pct + direction * STEP);
}

/** What was stored for a page - null when nothing usable was. */
export function readSplit(raw: string | null): number | null {
  if (raw === null || raw.trim() === '') return null;

  const pct = Number(raw);

  return Number.isFinite(pct) ? clampSplit(pct) : null;
}

export function splitStorageKey(path: string): string {
  return `kemov-admin-split:${path}`;
}
