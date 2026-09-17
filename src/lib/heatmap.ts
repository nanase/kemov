import type { VideoTableRow } from './ranking';

/**
 * Turning `GET /api/videos/table`'s rows into a week-long heatmap of when a
 * member goes live.
 *
 * `worker/src/api/streams.ts` computes the same [week minute, duration] pair
 * for `GET /api/streams`, and this file cannot import it: that file is built
 * for workerd, and @/type/api.ts already explains why the browser bundle does
 * not import worker/src. test/lib/heatmap.test.ts instead checks `spanOf`
 * below against the same table worker/test/streams.test.ts does -
 * test/fixtures/spanCases.ts - so the two cannot drift apart unnoticed.
 */

const MINUTE_MS = 60_000;

/** Japan has no daylight saving, so this offset is exact and unconditional. */
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** How many minutes a week holds. Also the longest a span may report. */
export const WEEK_MINUTES = 7 * 24 * 60;

/** One stream's `[week minute, duration in minutes]`. */
export type StreamSpan = readonly [weekMinute: number, minutes: number];

/**
 * One stream's span, by the same rule `GET /api/streams` uses.
 *
 * The week minute counts from Sunday 00:00 JST. Shifting the UTC instant by
 * JST's offset and reading the shifted value's UTC fields makes getUTCDay 0
 * for the JST Sunday rather than the UTC one, without a timezone library.
 * Seconds are dropped by flooring to the minute before that shift.
 *
 * Duration is the ceiling of the minutes from that floored start to the end,
 * clamped to between 1 and a full week: a span shorter than a minute or
 * longer than the grid it is drawn on would either vanish or overflow it.
 */
export function spanOf(actualStartTime: string, actualEndTime: string): StreamSpan {
  const flooredStartMs = Math.floor(new Date(actualStartTime).getTime() / MINUTE_MS) * MINUTE_MS;
  const endMs = new Date(actualEndTime).getTime();

  const shiftedStart = new Date(flooredStartMs + JST_OFFSET_MS);
  const weekMinute =
    shiftedStart.getUTCDay() * 24 * 60 + shiftedStart.getUTCHours() * 60 + shiftedStart.getUTCMinutes();

  const rawMinutes = Math.ceil((endMs - flooredStartMs) / MINUTE_MS);
  const minutes = Math.min(WEEK_MINUTES, Math.max(1, rawMinutes));

  return [weekMinute, minutes];
}

/**
 * Every finished stream's span, oldest first.
 *
 * The same row set `GET /api/streams` draws `spans` from: a `streaming` video
 * with both instants recorded. A row without one - an upcoming or a live
 * stream, or anything that is not a stream at all - has no span to report.
 */
export function streamSpans(rows: readonly VideoTableRow[]): StreamSpan[] {
  return rows
    .filter(
      (row): row is VideoTableRow & { actualStartTime: string; actualEndTime: string } =>
        row.type === 'streaming' && row.actualStartTime !== null && row.actualEndTime !== null,
    )
    .sort((a, b) => (a.actualStartTime < b.actualStartTime ? -1 : a.actualStartTime > b.actualStartTime ? 1 : 0))
    .map((row) => spanOf(row.actualStartTime, row.actualEndTime));
}

/** The grid a heatmap can be drawn on, in minutes per cell. */
export const HEATMAP_STEP_MINUTES = [60, 30, 10, 1] as const;

export type HeatmapStepMinutes = (typeof HEATMAP_STEP_MINUTES)[number];

/**
 * How many streams were live in each cell of the week, at `stepMinutes` per
 * cell.
 *
 * A cell counts a stream once even if the stream is longer than one cell -
 * counting minutes covered rather than streams would answer a different
 * question, "how much airtime", not "how often is this member live here". A
 * span that reaches past Sunday 23:59 wraps to the start of the grid: a
 * stream beginning Saturday night and running past midnight is exactly as
 * live at Sunday 00:30 as one that started then.
 *
 * The number of cells touched is capped at `binCount` rather than left as
 * `endBin - startBin`: a span starting mid-cell and lasting close to a full
 * week reaches past its own start once wrapped - `weekMinute` 5 and `minutes`
 * `WEEK_MINUTES` spans every cell exactly once, but rounds to 169 cells of an
 * hour each before the cap, one more than the 168 a week actually has. Left
 * uncapped, that extra cell wraps onto cell 0 and counts the stream there
 * twice.
 */
export function heatmapBins(spans: readonly StreamSpan[], stepMinutes: HeatmapStepMinutes): number[] {
  const binCount = WEEK_MINUTES / stepMinutes;
  const bins = new Array<number>(binCount).fill(0);

  for (const [weekMinute, minutes] of spans) {
    const startBin = Math.floor(weekMinute / stepMinutes);
    const endBin = Math.ceil((weekMinute + minutes) / stepMinutes);
    const cellsTouched = Math.min(endBin - startBin, binCount);

    for (let offset = 0; offset < cellsTouched; offset += 1) {
      bins[(startBin + offset) % binCount] += 1;
    }
  }

  return bins;
}
