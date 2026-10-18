import {
  dayStart,
  jstDay,
  occasionsOf,
  rowAt,
  NAMED_OCCASIONS,
  OPEN_RUN_MAX,
  type MonthGroup,
  type TimelineItem,
} from './model';
import type { Anchor } from './spans';

/**
 * What the timeline needs to draw only the months near the screen.
 *
 * Drawing the whole record at once was what made the page slow to open: at
 * 390px wide with the CPU slowed four times, it held the page still for 8.5
 * seconds at a stretch (2026-10-18), most of it spent laying out months
 * nobody had scrolled to. Every month keeps its frame in the page, so
 * the road is as long as it always was, and only the frames near the screen
 * are filled. The rest stand at a height worked out here until they are drawn,
 * and at the height they were measured at once they have been.
 */

/**
 * The two layouts the timeline has, which lay the same rows out at very
 * different heights.
 *
 * The boundary is meant to be the width the timeline's container queries
 * narrow at, and is to be moved with them: below it the cards take the full
 * width and their text wraps far sooner.
 */
export type Profile = 'wide' | 'narrow';

/** The width of the timeline at or below which it lays out narrow. */
export const NARROW_WIDTH = 620;

export function profileOf(width: number): Profile {
  return width <= NARROW_WIDTH ? 'narrow' : 'wide';
}

/**
 * What each kind of row takes, in CSS pixels.
 *
 * Fitted to the rows of the published page on 2026-10-18, at 1280px and at
 * 390px wide. An estimate only has to be close enough that the scrollbar does
 * not lie much: the first time a month is drawn its real height replaces it,
 * and a month above the screen that turns out taller or shorter than guessed
 * has the page moved by the difference, so the reader does not see it.
 */
const COSTS = {
  wide: {
    month: 14,
    now: 51,
    large: { base: 267, perSupplementChar: 0 },
    event: { base: 115, shot: 11, period: 25, perTitleChar: 0.3, perSupplementChar: 0.4 },
    folded: { base: 75, perOccasion: 28, more: 4 },
    shown: { base: 54, perRow: 60, perDayHeading: 24 },
  },
  narrow: {
    month: 14,
    now: 50,
    large: { base: 330, perSupplementChar: 2.4 },
    event: { base: 143, shot: 108, period: 61, perTitleChar: 1.3, perSupplementChar: 1.5 },
    folded: { base: 68, perOccasion: 70, more: 22 },
    shown: { base: 51, perRow: 96, perDayHeading: 21 },
  },
} as const;

/** The height one row of the timeline is expected to take. */
export function estimateItemHeight(item: TimelineItem, open: boolean, profile: Profile, searching = false): number {
  const costs = COSTS[profile];

  if (item.kind === 'now') return costs.now;

  if (item.kind === 'event') {
    const supplement = item.event.supplement?.length ?? 0;

    if (item.event.emphasized) return costs.large.base + costs.large.perSupplementChar * supplement;

    const { event } = costs;

    return (
      event.base +
      (item.event.videoId === null ? 0 : event.shot) +
      (item.endAt === null ? 0 : event.period) +
      event.perTitleChar * item.event.title.length +
      event.perSupplementChar * supplement
    );
  }

  if (open || item.rows.length <= OPEN_RUN_MAX) {
    const days = new Set(item.rows.map((row) => jstDay(rowAt(row)))).size;
    const { shown } = costs;

    return shown.base + shown.perRow * item.rows.length + (days > 1 ? shown.perDayHeading * days : 0);
  }

  const occasions = occasionsOf(item.rows, searching).length;
  const { folded } = costs;

  return (
    folded.base +
    folded.perOccasion * Math.min(NAMED_OCCASIONS, occasions) +
    (occasions > NAMED_OCCASIONS ? folded.more : 0)
  );
}

/** The height a month's frame is expected to take before it is drawn. */
export function estimateMonthHeight(
  month: MonthGroup,
  open: ReadonlySet<string>,
  profile: Profile,
  searching = false,
): number {
  return Math.round(
    month.items.reduce<number>(
      (sum, item) => sum + estimateItemHeight(item, open.has(item.key), profile, searching),
      COSTS[profile].month,
    ),
  );
}

/** What in one row can change the height it is drawn at. */
function itemShape(item: TimelineItem, open: ReadonlySet<string>): unknown {
  if (item.kind === 'now') return item.key;

  if (item.kind === 'event') {
    const { event } = item;

    return [
      item.key,
      event.title,
      event.supplement,
      event.emphasized,
      event.place,
      event.sourcePending,
      event.videoId,
      event.channelIds,
      item.endAt,
      item.future,
      item.timed,
    ];
  }

  return [item.key, open.has(item.key), item.rows.map((row) => [row.videoId, row.title, row.channelId, row.type])];
}

/**
 * What a measured height is remembered under.
 *
 * Everything in the month that can change how tall it is drawn: which rows it
 * holds, what each of them says, and which of its runs are open. A month whose
 * archive was fetched again with one title changed is not the month that was
 * measured. The layout is left out on purpose - the caller forgets every
 * height when the width or the text size moves.
 */
export function monthSignature(month: MonthGroup, open: ReadonlySet<string>, searching = false): string {
  return JSON.stringify([month.month, searching, month.items.map((item) => itemShape(item, open))]);
}

/** The first and last instants of a `YYYY-MM`, in JST. */
export function monthBounds(month: string): { from: number; to: number } {
  const [year, monthOfYear] = month.split('-').map(Number) as [number, number];
  const next = monthOfYear === 12 ? `${year + 1}-01` : `${year}-${String(monthOfYear + 1).padStart(2, '0')}`;

  return { from: dayStart(`${month}-01`), to: dayStart(`${next}-01`) - 1 };
}

/**
 * A month's two edges, as places the bands can be measured against.
 *
 * A month that is not drawn has no rows to read, but its frame still starts
 * and ends where it does. Without these a band reaching into an undrawn month
 * would stop at the last row drawn, which says it ended there.
 */
export function monthEdges(month: string, top: number, bottom: number, order: 'asc' | 'desc'): Anchor[] {
  const { from, to } = monthBounds(month);

  return order === 'asc'
    ? [
        { at: from, y: top },
        { at: to, y: bottom },
      ]
    : [
        { at: to, y: top },
        { at: from, y: bottom },
      ];
}

/** One month's frame changing height, as a ResizeObserver reports it. */
export interface Resize {
  /** Its top now, in viewport pixels. */
  top: number;
  before: number;
  after: number;
  /** Whether it was standing in for an undrawn month before the change. */
  standIn: boolean;
}

/** Below this a difference is rounding, not a move. */
const EPSILON = 1;

/**
 * How far to scroll so that what the reader is looking at stays put.
 *
 * A frame entirely above the top of the screen moves everything under it
 * when it changes height, and the page is moved by the same amount. A frame
 * that was standing in for an undrawn month counts as soon as any of it is
 * above the top: what it held was not on screen, so keeping the rows under
 * it still is the only thing to keep. A drawn month that reaches into the
 * screen does not count - that is a run being opened in front of the reader,
 * which should grow downwards from where they pressed.
 *
 * Measured in order down the page, because a frame's top already includes
 * whatever the frames above it did in the same round.
 */
export function compensation(changes: readonly Resize[], line: number): number {
  let shifted = 0;
  let total = 0;

  [...changes]
    .sort((a, b) => a.top - b.top)
    .forEach((change) => {
      const delta = change.after - change.before;
      const top = change.top - shifted;
      const above = change.standIn ? top < line - EPSILON : top + change.before <= line + EPSILON;

      if (Math.abs(delta) >= EPSILON && above) total += delta;

      shifted += delta;
    });

  return total;
}
