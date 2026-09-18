/**
 * How the shell writes instants and ages.
 *
 * Every function takes the instants it compares as arguments rather than
 * reading the clock, so the same input always gives the same text.
 *
 * Japan has no daylight saving, so shifting an instant by nine hours and
 * reading the result's UTC fields gives its JST fields in any runtime
 * timezone.
 */

const SECOND_MS = 1000;
const DAY_MS = 24 * 60 * 60 * SECOND_MS;
const JST_OFFSET_MS = 9 * 60 * 60 * SECOND_MS;

function jst(ms: number): Date {
  return new Date(ms + JST_OFFSET_MS);
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** `YYYY-MM-DD` in JST. */
export function formatDate(ms: number): string {
  const d = jst(ms);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/** `YYYY-MM-DD HH:MM:SS` in JST. */
export function formatDateTime(ms: number): string {
  const d = jst(ms);
  return `${formatDate(ms)} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}`;
}

/**
 * The age of data that is fetched continuously: `たった今` under a minute,
 * then whole minutes, hours or days, rounded down. An instant after `nowMs`
 * counts as `たった今`.
 */
export function formatRecentAge(thenMs: number, nowMs: number): string {
  const seconds = Math.max(0, Math.floor((nowMs - thenMs) / SECOND_MS));
  if (seconds < 60) return 'たった今';
  if (seconds < 60 * 60) return `${Math.floor(seconds / 60)} 分前`;
  if (seconds < 24 * 60 * 60) return `${Math.floor(seconds / (60 * 60))} 時間前`;
  return `${Math.floor(seconds / (24 * 60 * 60))} 日前`;
}

/**
 * The age of data that is edited by hand and can go untouched for a year:
 * days under 30 days, then calendar months, then years and months.
 *
 * Months count whole calendar months in JST, so 01-31 to 03-30 is one month,
 * not two. A span of 30 days or more still says at least `1 か月前`, which
 * keeps a 30-day span inside a 31-day month from reading `0 か月前`.
 */
export function formatCalendarAge(thenMs: number, nowMs: number): string {
  const days = Math.floor((nowMs - thenMs) / DAY_MS);
  if (days < 30) return `${Math.max(0, days)} 日前`;

  const then = jst(thenMs);
  const now = jst(nowMs);
  let months = (now.getUTCFullYear() - then.getUTCFullYear()) * 12 + (now.getUTCMonth() - then.getUTCMonth());
  if (timeIntoMonth(now) < timeIntoMonth(then)) months -= 1;
  months = Math.max(1, months);

  if (months < 12) return `${months} か月前`;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return rest === 0 ? `${years} 年前` : `${years} 年 ${rest} か月前`;
}

/** Milliseconds since the start of the month, for a date already shifted to JST. */
function timeIntoMonth(shifted: Date): number {
  return shifted.getTime() - Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), 1);
}
