/**
 * How large the reader wants the site drawn, in percent of its own size.
 *
 * The pages are laid out in pixels throughout, so a larger size scales the
 * whole page with CSS `zoom` (base.css) rather than the text alone: text
 * grown inside boxes of a fixed width would overflow them. Like the browser's
 * own zoom, the page then lays out for a narrower screen, and the width steps
 * every page already has decide what that looks like.
 *
 * 100 is never stored. It is the absence of a stored value, the same way
 * `system` is for the theme (theme.ts), so the script in head.html and
 * TextSizeMenu agree on it without either naming it.
 */
export const TEXT_SIZES = [100, 125, 150, 200] as const;

export type TextSize = (typeof TEXT_SIZES)[number];

/** The localStorage key head.html reads before the first paint. */
export const TEXT_SIZE_STORAGE_KEY = 'kemov-text-size';

/** What a stored value or a `data-text-size` attribute means. Anything not on offer means 100. */
export function parseTextSize(value: string | null | undefined): TextSize {
  return TEXT_SIZES.find((size) => size !== 100 && String(size) === value) ?? 100;
}

/**
 * How many of the viewport's pixels one of `element`'s own CSS pixels covers.
 *
 * Under base.css's zoom, `getBoundingClientRect()` and a pointer's `clientX`
 * are in the viewport's pixels while the element lays itself out in its own,
 * so a distance read from either has to be divided by this before it is
 * compared with a width in CSS. A browser that has `zoom` but not
 * `currentCSSZoom`, which came later, is read the zoom base.css puts on the
 * root, the only one the site applies.
 */
export function zoomOf(element: Element): number {
  const zoom = (element as Element & { currentCSSZoom?: number }).currentCSSZoom;

  if (typeof zoom === 'number' && zoom > 0) return zoom;

  const root = element.ownerDocument?.documentElement;
  const rootZoom = root ? Number.parseFloat(getComputedStyle(root).zoom) : NaN;

  return rootZoom > 0 ? rootZoom : 1;
}
