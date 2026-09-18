import { memberColor } from '@/lib/memberColor';

import { jstParts, rowAt, type EventItem, type Filters } from './model';
import type { VideoTableRow } from '@/lib/ranking';
import type { Channel } from '@/type/api';

/**
 * The trajectory: the same road as the timeline, seen whole.
 *
 * One lane per member and one for けもV itself, running down the panel beside
 * the timeline. Time is measured in months from the first one, never in
 * pixels, so the same marks can be drawn small in the rail and large in the
 * dialog without working them out twice.
 *
 * A line ends where a member's activity ended, with a bar across it, and is
 * drawn exactly as solid as everybody else's: #140 forbids fading somebody
 * out for having finished.
 */

/** A point on the time axis: months from the first, with the day as a fraction. */
export type MonthPoint = number;

/** The index of a `YYYY-MM` among all months, counting from year 0. */
export function monthIndex(year: number, month: number): number {
  return year * 12 + month - 1;
}

/** Where an instant falls on the time axis, given the first month drawn. */
export function monthPoint(ms: number, firstMonth: number): MonthPoint {
  const { year, month, day, hour } = jstParts(ms);
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();

  return monthIndex(year, month) - firstMonth + (day - 1 + hour / 24) / days;
}

/** One member's activity, or けもV's own, as a run down its lane. */
export interface TrailSpan {
  lane: number;
  from: MonthPoint;
  to: MonthPoint;
  color: string;
  /** Whether the run ends in a bar, because the activity ended. */
  ended: boolean;
}

/** Something that happened, on the lane of whoever it involved. */
export interface TrailDot {
  lane: number;
  at: MonthPoint;
  /** One of the days the page draws large (#140). */
  large: boolean;
  future: boolean;
  color: string;
}

/** The thread across the lanes of everybody one event involved. */
export interface TrailTie {
  at: MonthPoint;
  from: number;
  to: number;
}

/** How busy one month was, as a share of the busiest. */
export interface TrailBar {
  at: MonthPoint;
  amount: number;
}

export interface TrailYear {
  year: number;
  at: MonthPoint;
  /** Whether a rule is drawn, which the first year does not get. */
  rule: boolean;
}

export interface TrailMap {
  /** けもV, then the members in the order the API sends them. */
  lanes: { channel: Channel | null; color: string }[];
  months: number;
  firstMonth: number;
  spans: TrailSpan[];
  dots: TrailDot[];
  ties: TrailTie[];
  bars: TrailBar[];
  years: TrailYear[];
  now: MonthPoint;
}

/**
 * Everything the trajectory draws, in months rather than pixels.
 *
 * The events are the filtered ones, so choosing a member up in the filters
 * empties the other lanes of dots while leaving their lines in place: the
 * lanes are who was there, and hiding somebody's line would say they were
 * not.
 */
export function buildTrailMap(
  events: readonly EventItem[],
  rows: readonly VideoTableRow[],
  channels: readonly Channel[],
  filters: Filters,
  now: number,
  dark: boolean,
): TrailMap {
  const lanes = [{ channel: null, color: '' }, ...channels.map((channel) => ({ channel, color: '' }))];
  const laneOf = new Map(channels.map((channel, index) => [channel.channelId, index + 1]));

  const starts = [...events.map((item) => item.at), ...rows.map(rowAt)];
  const first = Math.min(...starts, now);
  const last = Math.max(...starts, now);
  const firstMonth = monthIndex(jstParts(first).year, jstParts(first).month);
  const months = monthIndex(jstParts(last).year, jstParts(last).month) - firstMonth + 1;
  const point = (ms: number) => monthPoint(ms, firstMonth);

  for (const lane of lanes) {
    lane.color = lane.channel === null ? '' : memberColor(lane.channel.color.key, dark);
  }

  // けもV's own lane runs from the day the project was announced.
  const project = events.find((item) => item.event.kind === 'project');
  const spans: TrailSpan[] =
    project === undefined ? [] : [{ lane: 0, from: point(project.at), to: point(now), color: '', ended: false }];

  channels.forEach((channel, index) => {
    const start = Date.parse(`${channel.activityStartDate}T00:00:00+09:00`);

    if (start > now) return;

    const end = channel.activityEndDate === null ? null : Date.parse(`${channel.activityEndDate}T00:00:00+09:00`);

    spans.push({
      lane: index + 1,
      from: point(start),
      to: point(end ?? now),
      color: lanes[index + 1]?.color ?? '',
      ended: end !== null,
    });
  });

  const dots: TrailDot[] = [];
  const ties: TrailTie[] = [];

  for (const item of events) {
    const on = item.event.channelIds.flatMap((id) => {
      const lane = laneOf.get(id);

      return lane === undefined ? [] : [lane];
    });
    const drawn = on.length === 0 ? [0] : on.sort((a, b) => a - b);
    const at = point(item.at);

    if (drawn.length > 1) ties.push({ at, from: drawn[0]!, to: drawn[drawn.length - 1]! });

    for (const lane of drawn) {
      dots.push({
        lane,
        at,
        large: item.event.emphasized,
        future: item.future,
        color: lanes[lane]?.color ?? '',
      });
    }
  }

  // How busy each month was, everybody together: the trajectory says when the
  // road was walked, and splitting it by member would set one against another.
  const counts = new Map<number, number>();

  for (const row of rows) {
    if (filters.streams === 'none') break;

    const { year, month } = jstParts(rowAt(row));
    const index = monthIndex(year, month) - firstMonth;

    counts.set(index, (counts.get(index) ?? 0) + 1);
  }

  const busiest = Math.max(1, ...counts.values());
  const bars = [...counts.entries()]
    .sort(([a], [b]) => a - b)
    .map(([index, count]) => ({ at: index, amount: count / busiest }));

  const years: TrailYear[] = [];
  const firstYear = Math.floor(firstMonth / 12);
  const lastYear = Math.floor((firstMonth + months - 1) / 12);

  for (let year = firstYear; year <= lastYear; year += 1) {
    const at = Math.max(year * 12, firstMonth) - firstMonth;

    years.push({ year, at, rule: year * 12 >= firstMonth });
  }

  return { lanes, months, firstMonth, spans, dots, ties, bars, years, now: point(now) };
}

/** Where the marks sit once the panel's own size is known. */
export interface TrailLayout {
  width: number;
  height: number;
  /** Room at the top for the row of faces. */
  head: number;
  laneWidth: number;
  avatar: number;
  /** Whether the faces are staggered in two rows, because the lanes are tight. */
  staggered: boolean;
  /** The lane axis, across the panel. */
  c0: number;
  cLen: number;
  /** The time axis, down the panel. */
  t0: number;
  tLen: number;
  /** The band of monthly volume, to the right of the lanes. */
  volC: number;
  volLen: number;
  /** True when the newest month is at the top, which follows the timeline. */
  flipped: boolean;
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

/**
 * The panel's own measurements.
 *
 * The chart never grows sideways as members are added: the lanes are packed
 * closer instead, and once a lane is narrower than a face the faces are
 * staggered over two rows. Growing sideways would push the panel off a
 * screen it has to share with the timeline.
 */
export function trailLayout(
  width: number,
  available: number,
  lanes: number,
  months: number,
  flipped: boolean,
): TrailLayout {
  const labels = 28;
  const volume = 28;
  const pitch = (width - labels - volume) / lanes;
  const staggered = pitch < 15;
  const avatar = clamp(Math.floor(staggered ? pitch * 2 - 3 : pitch - 2), 10, 16);
  const head = staggered ? avatar * 2 + 3 : avatar;
  const perMonth = clamp(Math.floor((available - head) / Math.max(1, months)), 4, 8);

  return {
    width,
    height: head + 12 + months * perMonth + 4,
    head,
    laneWidth: (width - labels - volume) / lanes,
    avatar,
    staggered,
    c0: labels - 6,
    cLen: width - labels - volume,
    t0: head + 12,
    tLen: months * perMonth,
    volC: width - volume + 4,
    volLen: 20,
    flipped,
  };
}

/** Where a point in months falls down the panel. */
export function trailY(layout: TrailLayout, at: MonthPoint, months: number): number {
  const share = at / Math.max(1, months);

  return layout.flipped ? layout.t0 + layout.tLen - share * layout.tLen : layout.t0 + share * layout.tLen;
}

/** The middle of a lane, across the panel. */
export function trailX(layout: TrailLayout, lane: number): number {
  return layout.c0 + (lane + 0.5) * layout.laneWidth;
}
