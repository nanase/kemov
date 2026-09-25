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

  return `${name}の登録者数の節目 ${milestones.length} 件。最新は ${last.reachedDate} の ${countLabel(last.subscriberCount)}人`;
}
