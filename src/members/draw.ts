import { formatCount } from '@/stats/draw';
import { formatDuration } from '@/type/video';

import { DAY_NAMES, type Top } from './model';

/**
 * How the member page writes what its model worked out.
 *
 * Only the wording lives here. What the numbers are is ./model.ts, which is
 * why nothing in this file is tested for arithmetic and everything in it is
 * tested for what it says.
 */

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * A length of time, written as the rest of the site writes a video's length.
 *
 * `@/type/video`'s formatter rather than one of this page's own: the list
 * writes a stream's length with it, and a median length beside it in another
 * format would read as another kind of measurement.
 */
export function formatLength(seconds: number | null): string {
  return seconds === null ? '—' : formatDuration(Math.max(0, Math.round(seconds)));
}

/** A time of day as `HH:MM`, from minutes since midnight. */
export function formatClock(minuteOfDay: number): string {
  return `${pad2(Math.floor(minuteOfDay / 60) % 24)}:${pad2(minuteOfDay % 60)}`;
}

/**
 * A share of something, always to one decimal place.
 *
 * 9 % and 9.0 % say different things about how precisely it was measured
 * (#136), so the place is kept even when it is a zero.
 */
export function formatPercent(part: number, whole: number): string {
  return whole > 0 ? ((part / whole) * 100).toFixed(1) : '0.0';
}

/** A rate to one decimal place, with the thousands marked. */
export function formatRate(value: number | null): string {
  if (value === null) return '—';

  const [whole, fraction] = (Math.round(value * 10) / 10).toFixed(1).split('.');

  return `${formatCount(Number(whole))}.${fraction}`;
}

/** How a share of the day is written. Four or more is a count, not a list. */
export interface TopWords {
  value: string;
  unit: string;
}

/**
 * The busiest entries in words.
 *
 * A tie is said as a tie: naming one of three equal weekdays would invent a
 * winner the data does not have. Four or more in the lead are counted rather
 * than listed, because by then the list is longer than the answer (#136).
 */
export function topWords(top: Top, name: (index: number) => string, unit: string): TopWords {
  if (top.list.length === 0) return { value: '—', unit: '' };
  if (top.list.length >= 4) return { value: String(top.list.length), unit: `${unit}が同数` };

  return { value: top.list.map(name).join('・'), unit };
}

/** `各` before a figure shared by several entries, and nothing before one. */
export function eachWord(top: Top): string {
  return top.list.length > 1 ? '各 ' : '';
}

/** An hour of the day as the shape panel names it. */
export function hourName(hour: number): string {
  return String(hour);
}

/** A weekday as the shape panel names it. */
export function weekdayName(weekday: number): string {
  return DAY_NAMES[weekday] ?? '';
}

/** What a stretch of the day between two hours is called. */
export function bandLabel(fromHour: number): string {
  const to = (fromHour + 6) % 24;

  return `${formatClock(fromHour * 60)}–${to === 0 ? '24:00' : formatClock(to * 60)}`;
}

/**
 * What one class of a count distribution covers.
 *
 * The last one is open: the tail of a count runs to a single video with fifty
 * times the median, and a class that named its upper bound would be naming
 * that one video.
 */
export function countClassLabel(index: number, step: number, classes: number): string {
  if (index === classes - 1) return `${formatCount(step * (classes - 1))} 以上`;

  return `${formatCount(step * index)}–${formatCount(step * (index + 1))}`;
}

/** Which part of the day a heatmap column covers, at the resolution in use. */
export function columnLabel(column: number, stepMinutes: number): string {
  const from = column * stepMinutes;
  const to = from + stepMinutes;

  return `${formatClock(from)}–${to >= 1440 ? '24:00' : formatClock(to)}`;
}
