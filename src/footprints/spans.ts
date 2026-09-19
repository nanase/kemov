/**
 * The bands that mark something which ran over several days.
 *
 * A row on the timeline is one moment, so an event with an end date needs
 * something that reaches from where it started to where it finished. That
 * something is drawn outside the footprint column rather than inside it: the
 * nodes and the month headings punch the background out to stay readable, and
 * a band running under them would come out in pieces (#140).
 *
 * Where the timeline puts a day is not a calculation - it depends on how many
 * rows each month happens to hold - so the ends are found by reading the rows
 * that are on screen and interpolating between them.
 */

/** A row of the timeline, as the bands need to see it. */
export interface Anchor {
  /** The instant that row stands for. */
  at: number;
  /** Where it sits, in pixels from the top of the timeline. */
  y: number;
}

/**
 * Where a day falls between the rows either side of it.
 *
 * Outside the range the nearest end is used: an event that runs past the last
 * row drawn has to stop somewhere, and stopping at the end of the road says
 * "at least this far" rather than guessing at a position off the screen.
 */
export function yAt(anchors: readonly Anchor[], at: number): number {
  if (anchors.length === 0) return 0;

  const first = anchors[0]!;
  const last = anchors[anchors.length - 1]!;

  for (let index = 0; index < anchors.length - 1; index += 1) {
    const a = anchors[index]!;
    const b = anchors[index + 1]!;
    const low = Math.min(a.at, b.at);
    const high = Math.max(a.at, b.at);

    if (at < low || at > high) continue;

    return high === low ? a.y : a.y + ((b.y - a.y) * (at - a.at)) / (b.at - a.at);
  }

  return Math.abs(at - first.at) < Math.abs(at - last.at) ? first.y : last.y;
}

/** One thing that ran over several days, before it is placed. */
export interface Span {
  key: string;
  title: string;
  from: number;
  to: number;
  /** Where its own row is, which is one end of the band. */
  y: number;
}

/** The same, once it has a column of its own to live in. */
export interface PlacedSpan extends Span {
  lane: number;
  top: number;
  height: number;
  /** True when the band runs upwards, which is what "newest first" does. */
  upwards: boolean;
}

/** How far apart two bands that overlap are drawn, in pixels (#140). */
export const LANE_STEP = 7;

/** The shortest a band is drawn, so that a single day is still visible. */
const LEAST = 6;

/**
 * Bands placed so that two which overlap in time never sit on top of another.
 *
 * Each band takes the leftmost column whose last occupant has already
 * finished. Two things that ran at the same time are the case this is for:
 * drawn in one column they would read as one longer thing.
 */
export function placeSpans(spans: readonly Span[], anchors: readonly Anchor[]): PlacedSpan[] {
  const ends: number[] = [];

  return [...spans]
    .sort((a, b) => a.from - b.from || a.key.localeCompare(b.key))
    .map((span) => {
      let lane = 0;

      while (ends[lane] !== undefined && ends[lane]! >= span.from) lane += 1;

      ends[lane] = span.to;

      const other = yAt(anchors, span.to);

      return {
        ...span,
        lane,
        top: Math.min(span.y, other),
        height: Math.max(LEAST, Math.abs(other - span.y)),
        upwards: other < span.y,
      };
    });
}
