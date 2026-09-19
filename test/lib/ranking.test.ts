import { rankByMetric, rankVideo, type VideoTableRow } from '@/lib/ranking';
import { readProperty, VIDEO_PROPERTIES, type VideoProperty } from '@/type/video';
import {
  RANKING_METRICS as WORKER_METRICS,
  rankingExpression,
  rankingFilter,
  type RankingMetric,
} from '../../worker/src/lib/ranking';

/**
 * Ranking `GET /api/videos/table`'s rows the way #135 and #136 need to: by
 * any of the eleven measures, narrowed to a kind and a period.
 *
 * The worker used to do this in SQL for the cross-channel ranking, and
 * @/type/video.ts's readProperty already had to agree with it - this file
 * adds the "agrees with the worker" section below so that agreement is
 * checked rather than merely intended. `RANKING_METRICS`, `rankingExpression`
 * and `rankingFilter` come straight from worker/src/lib/ranking.ts: nothing
 * here re-types the SQL by hand.
 */

const NOW = new Date('2026-09-17T00:00:00Z');

function row(overrides: Partial<VideoTableRow> = {}): VideoTableRow {
  return {
    videoId: 'v1',
    channelId: 'UCaaa',
    title: 'ある配信',
    type: 'streaming',
    publishedAt: '2026-09-01T00:00:00Z',
    viewCount: 100,
    likeCount: 10,
    commentCount: 5,
    chatMessageCount: 50,
    chatUniqueUserCount: 5,
    durationSeconds: 100,
    actualStartTime: null,
    actualEndTime: null,
    ...overrides,
  };
}

const daysBefore = (now: Date, days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

/** The one column each metric needs raised to make its own value the largest. */
function raised(metric: VideoProperty): Partial<VideoTableRow> {
  switch (metric) {
    case 'viewCount':
    case 'viewCountPerSecond':
      return { viewCount: 999 };
    case 'likeCount':
    case 'likeCountPerSecond':
      return { likeCount: 999 };
    case 'commentCount':
    case 'commentCountPerSecond':
      return { commentCount: 999 };
    case 'chatMessageCount':
    case 'chatMessageCountPerSecond':
    case 'chatMessageCountPerUniqueUser':
      return { chatMessageCount: 999 };
    case 'chatUniqueUserCount':
      return { chatUniqueUserCount: 999 };
    case 'duration':
      return { durationSeconds: 999 };
  }
}

describe('rankByMetric', () => {
  test.each(VIDEO_PROPERTIES)('%s orders the rows by its value, descending', (metric) => {
    const rows = [row({ videoId: 'low' }), row({ videoId: 'high', ...raised(metric) })];

    expect(rankByMetric(rows, metric, null, 'all', NOW).map((r) => r.videoId)).toEqual(['high', 'low']);
  });

  test('a tie breaks on videoId, descending - the same rule /api/videos/ranking orders by', () => {
    const rows = [row({ videoId: 'a' }), row({ videoId: 'c' }), row({ videoId: 'b' })];

    expect(rankByMetric(rows, 'viewCount', null, 'all', NOW).map((r) => r.videoId)).toEqual(['c', 'b', 'a']);
  });

  test('a row that cannot supply the metric is left out rather than ranked last', () => {
    const rows = [row({ videoId: 'has-no-views', viewCount: null }), row({ videoId: 'has-views' })];

    expect(rankByMetric(rows, 'viewCount', null, 'all', NOW).map((r) => r.videoId)).toEqual(['has-views']);
  });

  test('narrowing by kind re-ranks rather than only hiding rows', () => {
    const rows = [
      row({ videoId: 'stream-1', type: 'streaming', viewCount: 30 }),
      row({ videoId: 'a-video', type: 'video', viewCount: 20 }),
      row({ videoId: 'stream-2', type: 'streaming', viewCount: 10 }),
    ];

    expect(rankByMetric(rows, 'viewCount', 'streaming', 'all', NOW)).toEqual([
      { videoId: 'stream-1', value: 30, rank: 1 },
      { videoId: 'stream-2', value: 10, rank: 2 },
    ]);
  });

  describe('the period boundaries', () => {
    // Each case is admitted at the exact boundary and excluded one millisecond
    // before it, which is where a `>` written for a `>=` would first show up.
    test.each([
      ['p365', daysBefore(NOW, 365)],
      ['p90', daysBefore(NOW, 90)],
      ['p30', daysBefore(NOW, 30)],
      // 2026-01-01T00:00:00+09:00, the Japan-time year NOW falls in.
      [{ year: 2026 }, new Date('2025-12-31T15:00:00Z')],
    ] as const)('%s admits the boundary instant and excludes one millisecond before it', (period, boundary) => {
      const rows = [
        row({ videoId: 'at-boundary', publishedAt: boundary.toISOString() }),
        row({ videoId: 'before-boundary', publishedAt: new Date(boundary.getTime() - 1).toISOString() }),
      ];
      const ids = rankByMetric(rows, 'viewCount', null, period, NOW).map((r) => r.videoId);

      expect(ids).toContain('at-boundary');
      expect(ids).not.toContain('before-boundary');
    });

    test("'all' admits a video from any time", () => {
      const rows = [row({ videoId: 'ancient', publishedAt: '2020-01-01T00:00:00Z' })];

      expect(rankByMetric(rows, 'viewCount', null, 'all', NOW).map((r) => r.videoId)).toEqual(['ancient']);
    });

    // The collector stores published_at as YouTube reports it, uncapped
    // against the request time - a premiere can carry a schedule ahead of
    // NOW. A bounded period must not count that as part of "up to today".
    test('a bounded period admits a video published at NOW and excludes one published after it', () => {
      const rows = [
        row({ videoId: 'at-now', publishedAt: NOW.toISOString() }),
        row({ videoId: 'after-now', publishedAt: new Date(NOW.getTime() + 1).toISOString() }),
      ];
      const ids = rankByMetric(rows, 'viewCount', null, 'p30', NOW).map((r) => r.videoId);

      expect(ids).toContain('at-now');
      expect(ids).not.toContain('after-now');
    });

    test("'all' still admits a video published after NOW", () => {
      const rows = [row({ videoId: 'after-now', publishedAt: new Date(NOW.getTime() + 1).toISOString() })];

      expect(rankByMetric(rows, 'viewCount', null, 'all', NOW).map((r) => r.videoId)).toEqual(['after-now']);
    });

    describe('a calendar year', () => {
      // A past year has no `now` to cap it at, unlike the rolling windows -
      // this is the case that regressed when a year other than NOW's own
      // became selectable. Without an explicit end of its own, "2021" would
      // silently admit everything published since, all the way up to NOW.
      test('a past year excludes a video published in the following year', () => {
        const rows = [
          row({ videoId: 'in-2021', publishedAt: '2021-06-15T00:00:00Z' }),
          row({ videoId: 'in-2022', publishedAt: '2022-01-01T00:00:00Z' }),
        ];
        const ids = rankByMetric(rows, 'viewCount', null, { year: 2021 }, NOW).map((r) => r.videoId);

        expect(ids).toEqual(['in-2021']);
      });

      // 2025-12-31T23:59:59.999+09:00, the last instant of 2025 in Japan time.
      test('a past year admits its last instant and excludes one millisecond after it', () => {
        const boundary = new Date('2025-12-31T14:59:59.999Z');
        const rows = [
          row({ videoId: 'at-boundary', publishedAt: boundary.toISOString() }),
          row({ videoId: 'after-boundary', publishedAt: new Date(boundary.getTime() + 1).toISOString() }),
        ];
        const ids = rankByMetric(rows, 'viewCount', null, { year: 2025 }, NOW).map((r) => r.videoId);

        expect(ids).toContain('at-boundary');
        expect(ids).not.toContain('after-boundary');
      });

      // The year NOW falls in is not over yet, so its end is still NOW - the
      // same rule a rolling window follows - rather than this December 31st,
      // which has not happened.
      test('the current year admits a video published at NOW and excludes one published after it', () => {
        const rows = [
          row({ videoId: 'at-now', publishedAt: NOW.toISOString() }),
          row({ videoId: 'after-now', publishedAt: new Date(NOW.getTime() + 1).toISOString() }),
        ];
        const ids = rankByMetric(rows, 'viewCount', null, { year: 2026 }, NOW).map((r) => r.videoId);

        expect(ids).toContain('at-now');
        expect(ids).not.toContain('after-now');
      });

      // 2024-02-29T00:00:00+09:00, a date that does not exist outside a leap
      // year - `Date.UTC` normalising it silently would put the boundary on
      // March 1st instead.
      test('a leap year admits a video published on its February 29th', () => {
        const rows = [row({ videoId: 'leap-day', publishedAt: '2024-02-28T15:00:00Z' })];
        const ids = rankByMetric(rows, 'viewCount', null, { year: 2024 }, NOW).map((r) => r.videoId);

        expect(ids).toEqual(['leap-day']);
      });
    });
  });
});

describe('rankVideo', () => {
  const rows = [
    row({ videoId: 'a', viewCount: 30, likeCount: 1, durationSeconds: 10 }),
    row({ videoId: 'b', viewCount: 20, likeCount: null, durationSeconds: 10 }),
    row({ videoId: 'c', viewCount: 10, likeCount: 3, durationSeconds: null }),
  ];

  test('agrees with rankByMetric for every metric and every video', () => {
    for (const metric of VIDEO_PROPERTIES) {
      const byMetric = rankByMetric(rows, metric, null, 'all', NOW);

      for (const video of rows) {
        const found = byMetric.find((r) => r.videoId === video.videoId);

        expect(rankVideo(rows, video.videoId, null, 'all', NOW)[metric]).toEqual({
          rank: found?.rank ?? null,
          total: byMetric.length,
        });
      }
    }
  });

  test('a video missing a metric has no rank, but the total still counts the others', () => {
    // 'c' has no durationSeconds, so it has no per-second value and no rank -
    // but the other two videos still ranked, so the total is not zero.
    expect(rankVideo(rows, 'c', null, 'all', NOW).viewCountPerSecond).toEqual({ rank: null, total: 2 });
  });
});

describe('agreement with the worker', () => {
  const COLUMN: Record<string, keyof VideoTableRow> = {
    view_count: 'viewCount',
    like_count: 'likeCount',
    comment_count: 'commentCount',
    chat_message_count: 'chatMessageCount',
    chat_unique_user_count: 'chatUniqueUserCount',
    duration_seconds: 'durationSeconds',
  };

  /**
   * Reads `rankingExpression`'s SQL against a row, the same way SQLite would.
   *
   * Every expression EXPRESSIONS holds is either a bare column or a division
   * of two, cast to REAL to force float division - the two shapes this
   * understands. A shape it does not throws, so a metric added later without
   * updating this test fails loudly instead of silently passing.
   */
  function sqlValue(expression: string, r: VideoTableRow): number {
    const ratio = /^CAST\((\w+) AS REAL\) \/ (\w+)$/.exec(expression);

    if (ratio) {
      const [, numerator, denominator] = ratio;

      return (r[COLUMN[numerator]] as number) / (r[COLUMN[denominator]] as number);
    }

    if (expression in COLUMN) return r[COLUMN[expression]] as number;

    throw new Error(`test does not understand the expression "${expression}"`);
  }

  /** Reads `rankingFilter`'s SQL against a row: `col IS NOT NULL` and `col > 0`, joined by AND. */
  function sqlAdmits(filter: string, r: VideoTableRow): boolean {
    return filter.split(' AND ').every((condition) => {
      const notNull = /^(\w+) IS NOT NULL$/.exec(condition);
      if (notNull) return r[COLUMN[notNull[1]]] !== null;

      const positive = /^(\w+) > 0$/.exec(condition);
      if (positive) return (r[COLUMN[positive[1]]] as number) > 0;

      throw new Error(`test does not understand the condition "${condition}"`);
    });
  }

  test('the worker offers exactly the eleven metrics this file ranks by', () => {
    expect([...WORKER_METRICS]).toEqual([...VIDEO_PROPERTIES]);
  });

  test.each(VIDEO_PROPERTIES)(
    '%s reads the same value and admits the same rows as worker/src/lib/ranking.ts',
    (name) => {
      const metric = name as RankingMetric;
      const expression = rankingExpression(metric);
      const filter = rankingFilter(metric);

      const cases = [
        row(),
        row({ viewCount: null }),
        row({ likeCount: null }),
        row({ commentCount: null }),
        row({ chatMessageCount: null }),
        row({ chatUniqueUserCount: null }),
        row({ durationSeconds: null }),
        row({ durationSeconds: 0 }),
        row({ chatUniqueUserCount: 0 }),
        row({ viewCount: 7, durationSeconds: 3 }),
      ];

      for (const testRow of cases) {
        const value = readProperty(testRow, name);

        if (sqlAdmits(filter, testRow)) {
          expect(value).toEqual(sqlValue(expression, testRow));
        } else {
          expect(value).toBeUndefined();
        }
      }
    },
  );
});
