/**
 * Pure logic for the 統計 screen (#144's data screens task) - the query
 * `GET /admin/api/snapshots` takes, and formatting a UTC instant as the
 * Japan-time clock reading the mock's own `jst()` helper shows.
 */

/** `worker/src/admin/snapshots.ts`'s own `SnapshotTick`. */
export interface SnapshotTick {
  channelId: string;
  fetchedAt: string;
  subscriberCount: number | null;
  viewCount: number;
  videoCount: number;
  excluded: boolean;
  reason: string | null;
}

/** `worker/src/admin/snapshots.ts`'s own `SnapshotDay`. */
export interface SnapshotDay {
  date: string;
  ticks: number;
  excluded: number;
}

/**
 * How many days' worth of ticks the day-level list asks for by default.
 * `TICK_ROW_LIMIT` in worker/src/admin/snapshots.ts is 2,000; one channel's
 * own ticks are 144/day, so 13 days (1,872) stays under it with room to
 * spare, unlike 14 (2,016), which would not.
 */
export const DEFAULT_DAY_SPAN = 13;

/**
 * `from`/`to` for the day-level list, ending today in Japan time. `todayJst`
 * is already a calendar date, so this only ever does calendar-day
 * arithmetic on it - parsed as a bare UTC midnight, which stays offset-free,
 * rather than the actual `+09:00` instant it names in Japan time.
 */
export function defaultDayRange(todayJst: string): { from: string; to: string } {
  const from = new Date(`${todayJst}T00:00:00Z`);

  from.setUTCDate(from.getUTCDate() - (DEFAULT_DAY_SPAN - 1));

  return { from: from.toISOString().slice(0, 10), to: todayJst };
}

/** `GET /admin/api/snapshots`'s own query string. */
export function snapshotsQuery(channelId: string | null, from: string, to: string): string {
  const params = new URLSearchParams({ from, to });

  if (channelId !== null) params.set('channelId', channelId);

  return `?${params.toString()}`;
}

/** Today's date in Japan time, from the browser's own clock. */
export function todayJst(now: Date = new Date()): string {
  const t = new Date(now.getTime() + 9 * 60 * 60 * 1000);

  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
}

/** A UTC instant, as the Japan-time `YYYY-MM-DD HH:MM` the mock's own `jst()` shows. */
export function jstClock(instant: string): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const t = new Date(new Date(instant).getTime() + 9 * 60 * 60 * 1000);

  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())} ${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}`;
}
