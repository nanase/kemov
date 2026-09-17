import { heatmapBins, HEATMAP_STEP_MINUTES, spanOf, streamSpans, WEEK_MINUTES, type StreamSpan } from '@/lib/heatmap';
import type { VideoTableRow } from '@/lib/ranking';
import { SPAN_CASES } from '../fixtures/spanCases';

/**
 * The two steps between `GET /api/videos/table` and a member's heatmap: one
 * span per finished stream, and a week's grid of how many were live in each
 * cell.
 */

function row(overrides: Partial<VideoTableRow> = {}): VideoTableRow {
  return {
    videoId: 'v1',
    channelId: 'UCaaa',
    title: 'ある配信',
    type: 'streaming',
    publishedAt: '2026-09-14T00:00:00Z',
    viewCount: null,
    likeCount: null,
    commentCount: null,
    chatMessageCount: null,
    chatUniqueUserCount: null,
    durationSeconds: null,
    actualStartTime: '2026-09-14T00:00:00Z',
    actualEndTime: '2026-09-14T01:00:00Z',
    ...overrides,
  };
}

describe('spanOf', () => {
  // The same table worker/test/streams.test.ts checks `spanOf` against, so a
  // change to the rule on one side and not the other fails here too.
  test.each(SPAN_CASES)('%s', (_name, actualStartTime, actualEndTime, expected) => {
    expect(spanOf(actualStartTime, actualEndTime)).toEqual(expected);
  });
});

describe('streamSpans', () => {
  test('turns a finished stream into the same span spanOf would', () => {
    const [, actualStartTime, actualEndTime, expected] = SPAN_CASES[0]!;
    const rows = [row({ actualStartTime, actualEndTime })];

    expect(streamSpans(rows)).toEqual([expected]);
  });

  test('orders spans oldest first, regardless of the row order given', () => {
    const rows = [
      row({ videoId: 'newer', actualStartTime: '2026-09-14T00:00:00Z', actualEndTime: '2026-09-14T01:00:00Z' }),
      row({ videoId: 'older', actualStartTime: '2026-09-07T00:00:00Z', actualEndTime: '2026-09-07T01:00:00Z' }),
    ];

    // Both start at the same JST time of week, so the pairs repeat - what this
    // checks is the order they come out in, not the values themselves.
    expect(streamSpans(rows)).toEqual([
      spanOf('2026-09-07T00:00:00Z', '2026-09-07T01:00:00Z'),
      spanOf('2026-09-14T00:00:00Z', '2026-09-14T01:00:00Z'),
    ]);
  });

  test('leaves out a video that is not a finished stream', () => {
    const rows = [
      row({ videoId: 'a-video', type: 'video' }),
      row({ videoId: 'upcoming', actualStartTime: null, actualEndTime: null }),
      row({ videoId: 'live', actualStartTime: '2026-09-14T00:00:00Z', actualEndTime: null }),
    ];

    expect(streamSpans(rows)).toEqual([]);
  });
});

describe('heatmapBins', () => {
  test.each(HEATMAP_STEP_MINUTES)('has one bin per %d minutes of the week', (step) => {
    expect(heatmapBins([], step)).toHaveLength(WEEK_MINUTES / step);
  });

  test('counts a span in every bin it overlaps, once each', () => {
    const bins = heatmapBins([[0, 90]], 60);

    // Minutes 0-89 touch bins 0 and 1; nothing else was live.
    expect(bins[0]).toEqual(1);
    expect(bins[1]).toEqual(1);
    expect(bins.slice(2)).toEqual(new Array(bins.length - 2).fill(0));
  });

  test('counts two streams in the same bin as two', () => {
    const spans: StreamSpan[] = [
      [0, 10],
      [5, 10],
    ];

    expect(heatmapBins(spans, 60)[0]).toEqual(2);
  });

  // The design's own case: a stream starting Saturday 23:59 JST and running
  // six minutes wraps to Sunday's first bins rather than reporting minutes
  // that do not exist in the week.
  test('a span crossing the end of the week wraps to Sunday 00:00', () => {
    const bins = heatmapBins([[10079, 6]], 1);

    expect(bins[10079]).toEqual(1);
    expect(bins.slice(0, 5)).toEqual([1, 1, 1, 1, 1]);
    expect(bins.slice(5, 10079)).toEqual(new Array(10079 - 5).fill(0));
  });

  // If wrapping ever revisited a bin it had already counted, this would show
  // a 2 somewhere instead of a 1 in every bin.
  test.each(HEATMAP_STEP_MINUTES)(
    'a stream lasting a full week counts once in every bin, not twice (%d-minute cells)',
    (step) => {
      const bins = heatmapBins([[0, WEEK_MINUTES]], step);

      expect(bins).toEqual(new Array(bins.length).fill(1));
    },
  );

  // Starting mid-cell rounds the unwrapped range up to one more cell than the
  // week actually has (169 hour-cells for a week of 168), and that extra cell
  // wraps onto cell 0. Uncapped, cell 0 would show 2 instead of 1.
  test.each(HEATMAP_STEP_MINUTES)(
    'a full-week stream starting mid-cell still counts once in every bin (%d-minute cells)',
    (step) => {
      const bins = heatmapBins([[5, WEEK_MINUTES]], step);

      expect(bins).toEqual(new Array(bins.length).fill(1));
    },
  );
});
