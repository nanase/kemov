import { DASH, formatCount } from '@/lib/numberFormat';
import { formatDuration as formatVideoDuration } from '@/type/video';

/**
 * Turning this page's numbers into the shapes and words it draws.
 *
 * Geometry is returned as plain numbers and path strings so it can be checked
 * without rendering anything. Every scale here is taken inside one series:
 * nothing in this file ever sees two members at once, which is how #134's
 * rule against comparing them is kept while drawing.
 */

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

const NUMBER = new Intl.NumberFormat('ja-JP');

/** A change, with its sign. The minus is the typographic one, to match the plus's width. */
export function formatChange(value: number | null | undefined): string {
  if (value === null || value === undefined) return DASH;
  if (value === 0) return '0';

  return value > 0 ? `+${NUMBER.format(value)}` : `−${NUMBER.format(Math.abs(value))}`;
}

export function changeSign(value: number | null | undefined): 'pos' | 'neg' | 'zero' {
  if (value === null || value === undefined || value === 0) return 'zero';

  return value > 0 ? 'pos' : 'neg';
}

/** `2026-09` as `2026年9月`, which is how the page says a month out loud. */
export function monthLabel(month: string): string {
  return `${Number(month.slice(0, 4))}年${Number(month.slice(5, 7))}月`;
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * A stream's length, written as the rest of the site writes one.
 *
 * `@/type/video`'s formatter rather than one of this page's own. The two were
 * not the same: this wrote `H:MM`, so a 45-minute stream read as `0:45` -
 * which on `/videos/` and `/members/`, where a length under an hour is
 * `mm:ss`, is how 45 seconds is written. The same four characters meant two
 * different things depending on which page they were on, and nothing on
 * screen said which.
 */
export function formatDuration(seconds: number | null): string {
  return seconds === null ? DASH : formatVideoDuration(Math.max(0, Math.round(seconds)));
}

/** An amount of airtime, in hours and minutes. */
export function formatMinutes(minutes: number): string {
  const whole = Math.round(minutes);

  if (whole <= 0) return '0 分';
  if (whole < 60) return `${whole} 分`;

  const rest = whole % 60;

  return rest === 0
    ? `${formatCount(Math.floor(whole / 60))} 時間`
    : `${formatCount(Math.floor(whole / 60))} 時間 ${rest} 分`;
}

/** Which part of the day a heatmap cell covers, named by the step it was cut with. */
export function slotLabel(slot: number, stepMinutes: number): string {
  const from = slot * stepMinutes;
  const clock = (minutes: number) => `${pad2(Math.floor(minutes / 60) % 24)}:${pad2(minutes % 60)}`;

  return stepMinutes === 60 ? `${pad2(from / 60)} 時台` : `${clock(from)}–${clock(from + stepMinutes)}`;
}
