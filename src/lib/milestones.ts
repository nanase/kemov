import type { MilestoneAnnouncer, SubscriberMilestone } from '@/type/api';

/**
 * Turning the published subscriber milestones (#225) into what a page draws.
 *
 * Shared by the statistics page and the member page, which draw the same
 * points on the same month axis their other charts use. Every scale here is
 * taken inside one member: nothing in this file ever sees two members' counts
 * at once, which is how #134's rule against comparing them is kept.
 *
 * A milestone is a floor someone announced, not a reading: on that date the
 * channel had at least that many. Nothing here draws what happened between
 * two of them.
 */

const NUMBER = new Intl.NumberFormat('ja-JP');

/**
 * Where the milestones stand.
 *
 * Kept apart from the list itself because an empty list is two different
 * things: nothing recorded, which the page says, and nothing read, which it
 * must not say as the same words.
 */
export type MilestoneStatus = 'loading' | 'ready' | 'failed';

/**
 * The status a chart of milestones is drawn with.
 *
 * Without the month axis there is nowhere to put a milestone, so a chart with
 * some to place draws the empty frame it draws while loading rather than
 * every point at the left edge. With none to place, "nothing recorded" is
 * still true and is said.
 */
export function drawStatus(status: MilestoneStatus, monthCount: number, milestoneCount: number): MilestoneStatus {
  return status === 'ready' && monthCount === 0 && milestoneCount > 0 ? 'loading' : status;
}

/**
 * What the site calls a milestone on screen. Every sentence below that says
 * it, and every one the pages build from it, is made from this word, so that
 * changing what the site says is a change here (the admin site and the code
 * say 節目 regardless).
 */
export const MILESTONE_WORD = 'ふしめ';

/** What a chart says in place of one when nothing was recorded. */
export const MILESTONE_EMPTY = `${MILESTONE_WORD}の記録はまだありません`;

/** What a chart says when the record could not be read. */
export const MILESTONE_FAILED = `${MILESTONE_WORD}の記録を取得できませんでした`;

/** The monthly panel's heading while its milestone tab is chosen. */
export const MILESTONE_HEADING = `登録者数の${MILESTONE_WORD}`;

/** Who announced it, as the card and the point's name say it. */
export const ANNOUNCER_LABELS: Readonly<Record<MilestoneAnnouncer, string>> = {
  member: '本人の公表',
  official: '公式の公表',
  listener: 'リスナーの投稿',
};

/**
 * A count the way an announcement says it: `1万`, `1.5万`, `5,000`.
 *
 * Only a count of ten thousand or more that divides into thousands is
 * shortened. Anything else is written out in full, so that a shortened
 * figure is never a rounded one.
 */
export function countLabel(count: number): string {
  return count >= 10000 && count % 1000 === 0 ? `${count / 10000}万` : NUMBER.format(count);
}

/** Every member's milestones, keyed by channel, each list oldest first. */
export function milestonesByChannel(all: readonly SubscriberMilestone[]): Map<string, SubscriberMilestone[]> {
  const sorted = [...all].sort((a, b) => {
    const [x, y] = [pointDate(a.reachedDate), pointDate(b.reachedDate)];

    return x === y ? a.milestoneId - b.milestoneId : x < y ? -1 : 1;
  });
  const byChannel = new Map<string, SubscriberMilestone[]>();

  for (const milestone of sorted) {
    const list = byChannel.get(milestone.channelId) ?? [];

    list.push(milestone);
    byChannel.set(milestone.channelId, list);
  }

  return byChannel;
}

/**
 * Where a date sits, as a day, for ordering one precision against another.
 * A month-precise date is put in the middle of its month, the same as on
 * the axis.
 */
function pointDate(date: string): string {
  return date.length === 7 ? `${date}-15` : date;
}

function daysIn(month: string): number {
  const [year, monthNumber] = month.split('-').map(Number) as [number, number];

  return new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
}

/**
 * Where a date falls on a month axis, from 0 at the start of the first month
 * to 1 at the end of the last.
 *
 * The axis is the one the month charts use: each month is a slot of equal
 * width. A day is placed at its own share of its month; a date known only
 * to the month is placed in the middle of it. A date off either end is held
 * at that end rather than drawn outside the chart.
 */
export function axisFraction(date: string, months: readonly string[]): number {
  if (months.length === 0) return 0;

  const month = date.slice(0, 7);
  const index = months.indexOf(month);

  if (index < 0) return month < months[0]! ? 0 : 1;

  const within = date.length === 7 ? 0.5 : (Number(date.slice(8, 10)) - 0.5) / daysIn(month);

  return (index + within) / months.length;
}

/**
 * The year marks under the chart, with the ones that would collide dropped.
 *
 * The two ends always carry their own month, so the axis says what it spans
 * even at a width where every year mark in between has to go.
 */
export interface AxisMark {
  /** Where it sits, as a percentage of the width. */
  left: number;
  label: string;
  edge?: 'left' | 'right';
}

export function axisMarks(months: readonly string[], widthPx: number): AxisMark[] {
  if (months.length === 0) return [];

  const marks: AxisMark[] = [{ left: 0, label: months[0]!, edge: 'left' }];
  const gap = Math.max(13, (54 / Math.max(widthPx, 1)) * 100);
  let last = 0;

  months.forEach((month, index) => {
    if (index === 0 || index === months.length - 1 || !month.endsWith('-01')) return;

    const left = ((index + 0.5) / months.length) * 100;

    if (left < gap || left > 100 - gap || left < last + gap) return;

    marks.push({ left, label: `${month.slice(0, 4)}年` });
    last = left;
  });

  if (months.length > 1) marks.push({ left: 100, label: months.at(-1)!, edge: 'right' });

  return marks;
}

export interface CountScale {
  /** The count at the top of the chart. The bottom is always zero. */
  top: number;
  /** The gridlines, from zero up, each a round figure. */
  ticks: number[];
}

/**
 * A vertical scale for one member's counts: from zero to a round figure a
 * little above the largest, in two to four steps of 1, 2 or 5 times a power
 * of ten.
 *
 * Zero is always the bottom. A scale cut off above zero would make a member
 * who went from 9,000 to 1万 look as if they had grown tenfold.
 */
export function countScale(largest: number): CountScale {
  if (!(largest > 0)) return { top: 1, ticks: [0, 1] };

  const headroom = largest * 1.1;
  const rough = headroom / 3;
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 5, 10].map((m) => m * power).find((s) => s >= rough)!;
  const top = Math.ceil(headroom / step) * step;

  return { top, ticks: Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step) };
}

/**
 * Which side of its point each label goes, for points on one line.
 *
 * Labels go above. One that would sit within `gap` of the last label above
 * goes below instead, so two milestones a few months apart can both be read.
 * `fractions` are in the order the points are drawn, oldest first.
 */
export function labelSides(fractions: readonly number[], gap: number): ('above' | 'below')[] {
  let lastAbove = -Infinity;

  return fractions.map((fraction) => {
    if (fraction - lastAbove < gap) return 'below';

    lastAbove = fraction;

    return 'above';
  });
}

/** One month's bar, estimated from the milestones. */
export interface MonthEstimate {
  count: number;
  /**
   * True for a month that holds a milestone, and for this month when today's
   * count was read. The rest are interpolated between those.
   */
  recorded: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** A date as a day number. A month-precise date is the middle of its month. */
function dayOf(date: string): number {
  const [year, month, day] = pointDate(date).split('-').map(Number) as [number, number, number];

  return Date.UTC(year, month - 1, day) / DAY_MS;
}

/**
 * One member's subscriber count month by month, estimated from their
 * milestones - worked out on the page and never stored (#225).
 *
 * A month holding a milestone carries its newest one, and this month carries
 * today's count when it was read. Every other month is read off a straight
 * line between the nearest known counts either side, at the month's last
 * day: the line a reader would draw between two points. It is drawn apart
 * from a known count, so it is never taken for one.
 *
 * Months before the first milestone are null: nothing is known there, and a
 * bar of zero would say the channel had nobody. So are the months after the
 * last milestone when today's count was not read, rather than a guess at
 * where it went.
 *
 * The months after a member's activity ended are null as well. Their count
 * still moves, and the line towards today's count still runs through them,
 * but a bar there was hard to read apart from the rest in any form tried,
 * and the user chose none over a hard one (2026-09-26).
 */
export function monthlyEstimates(
  milestones: readonly SubscriberMilestone[],
  months: readonly string[],
  now: number | null,
  today: string,
  endDate: string | null,
): (MonthEstimate | null)[] {
  const first = milestones[0];

  if (first === undefined) return months.map(() => null);

  const anchors = milestones.map((m) => ({ day: dayOf(m.reachedDate), count: m.subscriberCount }));

  if (now !== null && dayOf(today) > anchors.at(-1)!.day) anchors.push({ day: dayOf(today), count: now });

  // Today's own month, not the axis's last: a page left open past the end of
  // a month keeps the old axis until the months are read again.
  const current = today.slice(0, 7);
  const endMonth = endDate?.slice(0, 7) ?? null;

  return months.map((month) => {
    if (month < first.reachedDate.slice(0, 7)) return null;
    if (endMonth !== null && month > endMonth) return null;
    if (month === current && now !== null) return { count: now, recorded: true };

    const inMonth = milestones.filter((m) => m.reachedDate.slice(0, 7) === month);

    if (inMonth.length > 0) return { count: inMonth.at(-1)!.subscriberCount, recorded: true };

    const day = dayOf(`${month}-${String(daysIn(month)).padStart(2, '0')}`);
    const after = anchors.findIndex((anchor) => anchor.day >= day);

    if (after <= 0) return null;

    const [from, to] = [anchors[after - 1]!, anchors[after]!];
    const count = Math.round(from.count + ((to.count - from.count) * (day - from.day)) / (to.day - from.day));

    return { count, recorded: false };
  });
}

/**
 * Where a card opens beside the point at (`x`, `y`), both from 0 to 1 of the
 * chart: towards the middle of the chart on both axes, so it never runs off
 * the side it is nearest to. `y` is null on a row of points, where the card
 * always opens below.
 */
export function cardPlacement(x: number, y: number | null): Record<string, string> {
  const place: Record<string, string> = {};

  if (x <= 0.5) place.left = `max(0px, calc(${pct(x)} - 18px))`;
  else place.right = `max(0px, calc(${pct(1 - x)} - 18px))`;

  if (y === null) place.top = 'calc(50% + 12px)';
  else if (y > 0.5) place.bottom = `calc(${pct(1 - y)} + 12px)`;
  else place.top = `calc(${pct(y)} + 12px)`;

  return place;
}

function pct(fraction: number): string {
  return `${(fraction * 100).toFixed(3)}%`;
}

/** What a point is called for a reader who cannot see it. */
export function pointName(milestone: SubscriberMilestone): string {
  return `${milestone.reachedDate} ${countLabel(milestone.subscriberCount)}人 ${ANNOUNCER_LABELS[milestone.announcedBy]}`;
}

/**
 * What a chart of one member's milestones says as a whole: whose, how many,
 * and the newest one. Null when there is nothing to draw, where the page says
 * so in words instead.
 */
export function chartSummary(name: string, milestones: readonly SubscriberMilestone[]): string | null {
  const last = milestones.at(-1);

  if (last === undefined) return null;

  return `${name}の${MILESTONE_HEADING} ${milestones.length} 件。最新は ${last.reachedDate} の ${countLabel(last.subscriberCount)}人`;
}

/** The newest milestone as the member page's figure notes it: `最新のふしめ 2万人 ・ 2024-01-30`. */
export function latestLabel(milestone: SubscriberMilestone): string {
  return `最新の${MILESTONE_WORD} ${countLabel(milestone.subscriberCount)}人 ・ ${milestone.reachedDate}`;
}
