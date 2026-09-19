/**
 * The large trajectory, which the rail's small one opens into.
 *
 * Same marks, laid the other way round: time runs left to right and each
 * member has a row of their own, so there is room for a name beside every
 * line. The record is longer than any screen at the closer zooms, so the
 * chart scrolls - and only the part on screen is ever drawn.
 */

/** How close the chart is zoomed in, in months across the visible width. */
export const ZOOMS = [
  { id: 'all', label: '全期間' },
  { id: 'year', label: '1 年', months: 12 },
  { id: 'month', label: '1 か月', months: 1 },
] as const;

export type ZoomId = (typeof ZOOMS)[number]['id'];

/** How far a pointer may move before a press counts as a drag rather than a tap. */
export const SLOP = { mouse: 5, touch: 10 };

export interface ChartLayout {
  /** The width the whole record occupies, which the scrollbar measures. */
  track: number;
  /** The width on screen, which is what actually gets drawn. */
  view: number;
  laneHeight: number;
  labels: number;
  /** Room at the top for the years and months. */
  axis: number;
  /** The band of monthly volume under the lanes. */
  volume: number;
  height: number;
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

/**
 * The chart's measurements for one zoom.
 *
 * At `all` the whole record is on screen and there is nowhere to scroll to.
 * The closer zooms keep a fixed number of months across the visible width, so
 * the track grows as long as the record is.
 */
export function chartLayout(view: number, lanes: number, months: number, zoom: ZoomId, available: number): ChartLayout {
  const across = ZOOMS.find((entry) => entry.id === zoom);
  const window = across !== undefined && 'months' in across ? Math.min(across.months, months) : months;
  const labels = view < 560 ? 0 : 190;
  const body = Math.max(120, view - labels);
  const axis = 44;
  const volume = 22;
  const laneHeight = clamp(Math.floor((available - axis - volume) / Math.max(1, lanes)), 16, 30);

  return {
    track: Math.max(body, (body * months) / Math.max(1, window)),
    view: body,
    laneHeight,
    labels,
    axis,
    volume,
    height: axis + lanes * laneHeight + volume,
  };
}

/** Where a point in months sits along the whole track. */
export function chartTime(layout: ChartLayout, at: number, months: number): number {
  return (at / Math.max(1, months)) * layout.track;
}

/** The middle of a lane's row, down the chart. */
export function chartLane(layout: ChartLayout, lane: number): number {
  return layout.axis + (lane + 0.5) * layout.laneHeight;
}

/** The months on screen at a scroll position, with a margin so marks at the
 * edge are drawn rather than popping in. */
export function visibleMonths(layout: ChartLayout, scroll: number, months: number): { from: number; to: number } {
  const perMonth = layout.track / Math.max(1, months);
  const margin = perMonth * 2;

  return {
    from: Math.max(0, (scroll - margin) / perMonth),
    to: Math.min(months, (scroll + layout.view + margin) / perMonth),
  };
}

/**
 * Where the strip's window sits, as a share of the strip.
 *
 * The strip is the whole record at the width of the chart, so the window is
 * the visible slice of the track scaled onto it.
 */
export function stripWindow(layout: ChartLayout, scroll: number): { from: number; width: number } {
  return { from: (scroll / layout.track) * layout.view, width: (layout.view / layout.track) * layout.view };
}

/**
 * Where to scroll to so that a point on the strip lands under the pointer.
 *
 * Taking the grabbed point with it is what makes the window feel held rather
 * than pushed: without the offset the window jumps its own centre to the
 * pointer the moment it is touched.
 */
export function scrollForStrip(layout: ChartLayout, pointer: number, grabbed: number): number {
  const scroll = ((pointer - grabbed) / layout.view) * layout.track;

  return clamp(scroll, 0, Math.max(0, layout.track - layout.view));
}

/** Whether a press has moved far enough to count as a drag. */
export function dragged(from: { x: number; y: number }, to: { x: number; y: number }, pointer: string): boolean {
  const slop = pointer === 'mouse' ? SLOP.mouse : SLOP.touch;

  return Math.abs(to.x - from.x) > slop || Math.abs(to.y - from.y) > slop;
}
