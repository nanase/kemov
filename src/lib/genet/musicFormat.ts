/**
 * The number/date formats #139's「数値の書き方」section fixes for this page
 * alone - `src/lib/timeFormat.ts` already covers 更新日, reused as-is there.
 */

const WEEKDAY = ['日', '月', '火', '水', '木', '金', '土'] as const;

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** `publishedAtUtc`'s own JST calendar fields. */
function jstParts(publishedAtUtc: string) {
  const ms = Date.parse(publishedAtUtc) + 9 * 60 * 60 * 1000;
  const d = new Date(ms);

  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    date: d.getUTCDate(),
    hours: d.getUTCHours(),
    minutes: d.getUTCMinutes(),
    weekday: WEEKDAY[d.getUTCDay()]!,
  };
}

/** `2025-02-01 (土)` - a stream's own published date, JST. */
export function publishedDateText(publishedAtUtc: string): string {
  const p = jstParts(publishedAtUtc);

  return `${p.year}-${pad2(p.month)}-${pad2(p.date)} (${p.weekday})`;
}

/** `2025-02-01 (土) 19:00` - date plus time, JST. */
export function publishedDateTimeText(publishedAtUtc: string): string {
  const p = jstParts(publishedAtUtc);

  return `${publishedDateText(publishedAtUtc)} ${pad2(p.hours)}:${pad2(p.minutes)}`;
}

/** A moment inside a video: `9:30` under an hour, `1:06:16` at or past one. */
export function videoTimeText(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return hours > 0 ? `${hours}:${pad2(minutes)}:${pad2(seconds)}` : `${minutes}:${pad2(seconds)}`;
}

/** `113 本` / `228 曲` - a plain count with its own counter word. */
export function countText(count: number, counter: string): string {
  return `${count} ${counter}`;
}

/**
 * `113 本 · 228 曲` when nothing narrows the list, `113 本 → 10 本 ・ 228 曲
 * → 2 曲` once something does - #139's own "件数（絞り込み）" row.
 */
export function summaryCountText(
  totalStreams: number,
  totalSongs: number,
  filtering: boolean,
  matchedStreams: number,
  matchedSongs: number,
): string {
  if (!filtering) return `${countText(totalStreams, '本')} · ${countText(totalSongs, '曲')}`;

  return `${totalStreams} 本 → ${matchedStreams} 本 · ${totalSongs} 曲 → ${matchedSongs} 曲`;
}
