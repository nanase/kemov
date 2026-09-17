/**
 * The rule for turning one stream into a [week minute, duration] pair, as a
 * table of input and expected output.
 *
 * worker/test/streams.test.ts checks `spanOf` against this table, and
 * test/lib/heatmap.test.ts checks `streamSpans` against the same one - #144's
 * design put the same rule in both places, and an input or an expected value
 * changed on one side without the other is exactly the drift this shared
 * table exists to catch.
 */
export const SPAN_CASES: [name: string, actualStartTime: string, actualEndTime: string, expected: [number, number]][] =
  [
    // The week's origin: Sunday 00:00 JST is Saturday 15:00 UTC.
    ['Sunday 00:00 JST exactly', '2026-09-12T15:00:00Z', '2026-09-12T15:30:00Z', [0, 30]],
    // Starts in the week's last minute and ends after JST midnight - the start
    // does not wrap, only the duration reaches past it.
    ['Saturday 23:59 JST start, crossing into Sunday', '2026-09-12T14:59:00Z', '2026-09-12T15:05:00Z', [10079, 6]],
    // 00:12:45Z floors to 00:12:00Z; measuring from :45 instead would answer 3
    // minutes here, not 4.
    ['the start second is truncated', '2026-09-14T00:12:45Z', '2026-09-14T00:15:20Z', [1992, 4]],
    ['under a minute rounds up to one', '2026-09-14T00:12:00Z', '2026-09-14T00:12:30Z', [1992, 1]],
    ['over a week clamps to a week', '2026-09-12T15:00:00Z', '2026-09-25T15:00:00Z', [0, 10080]],
  ];
