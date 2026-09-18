import { DAY_NAMES } from '@/lib/timeFormat';

import { jstParts } from './model';

/**
 * How the footprints page writes what its model worked out.
 *
 * Dates are the page's main material, and every one of them is Japanese time
 * (#140). The wording lives here so that the components hold markup and this
 * holds sentences.
 */

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/** `2026-09-19 (土)`, which is how a full date is written on this page. */
export function formatDate(ms: number): string {
  const { year, month, day, weekday } = jstParts(ms);

  return `${year}-${pad2(month)}-${pad2(day)} (${DAY_NAMES[weekday]})`;
}

/** `19日`, for the date column, where the month is already in the heading. */
export function formatDayOfMonth(ms: number): string {
  return `${jstParts(ms).day}日`;
}

/** `09-19`, for the far end of a run that crossed into another month. */
export function formatMonthDay(ms: number): string {
  const { month, day } = jstParts(ms);

  return `${pad2(month)}-${pad2(day)}`;
}

/** The weekday on its own, which sits under the day in the date column. */
export function formatWeekday(ms: number): string {
  return DAY_NAMES[jstParts(ms).weekday] ?? '';
}

/** `20:00`, the time of day. */
export function formatTime(ms: number): string {
  const { hour, minute } = jstParts(ms);

  return `${pad2(hour)}:${pad2(minute)}`;
}

/**
 * How long ago something was, in the words a reader would use.
 *
 * Whole months and years rather than a count of days, because "3 年 2 か月前"
 * is what somebody remembers and "1,158 日前" is not. Something still to come
 * is written as the wait rather than as a negative.
 */
export function formatSince(ms: number, now: number): string {
  const then = jstParts(ms);
  const today = jstParts(now);
  const days = Math.floor((now - ms) / (24 * 60 * 60 * 1000));

  if (formatDate(ms).slice(0, 10) === formatDate(now).slice(0, 10)) return '今日';
  if (ms > now) return `あと ${Math.max(1, -days)} 日`;

  const months = (today.year - then.year) * 12 + (today.month - then.month) - (today.day < then.day ? 1 : 0);

  if (months < 1) return `${Math.max(1, days)} 日前`;

  const years = Math.floor(months / 12);
  const rest = months % 12;

  return `${years > 0 ? `${years} 年 ` : ''}${rest > 0 ? `${rest} か月` : ''}前`;
}

/** A length of time as `H:MM:SS`, or `MM:SS` under an hour. */
export function formatLength(seconds: number | null): string {
  if (seconds === null) return '';

  const whole = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(whole / 60) % 60;

  return whole >= 3600
    ? `${Math.floor(whole / 3600)}:${pad2(minutes)}:${pad2(whole % 60)}`
    : `${pad2(minutes)}:${pad2(whole % 60)}`;
}

/** The host a source is on, which is what the page shows instead of the URL. */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
