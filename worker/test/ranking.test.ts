import {
  isRankingMetric,
  RANKING_METRICS,
  rankingExpression,
  rankingFilter,
  type RankingMetric,
} from '../src/lib/ranking';

/**
 * The metric definitions on their own. What a ranking returns when it runs is
 * worker/test/videos.test.ts.
 */

describe('RANKING_METRICS', () => {
  // The names src/type/video.ts already uses. #70 moves where the front end
  // gets its data, not what it shows, so a name that differs here turns that
  // move into a rewrite.
  test('are the eleven the front end already ranks by', () => {
    expect([...RANKING_METRICS].sort()).toEqual(
      [
        'chatMessageCount',
        'chatMessageCountPerSecond',
        'chatMessageCountPerUniqueUser',
        'chatUniqueUserCount',
        'commentCount',
        'commentCountPerSecond',
        'duration',
        'likeCount',
        'likeCountPerSecond',
        'viewCount',
        'viewCountPerSecond',
      ].sort(),
    );
  });

  test('every one has an expression and a filter', () => {
    for (const metric of RANKING_METRICS) {
      expect(rankingExpression(metric)).not.toEqual('');
      expect(rankingFilter(metric)).not.toEqual('');
    }
  });
});

// The gate that keeps caller text out of the SQL these functions return.
describe('isRankingMetric', () => {
  test('accepts every metric offered', () => {
    for (const metric of RANKING_METRICS) expect(isRankingMetric(metric)).toBe(true);
  });

  test('rejects a name that is not one of them', () => {
    expect(isRankingMetric('charisma')).toBe(false);
    expect(isRankingMetric('')).toBe(false);
    expect(isRankingMetric('view_count')).toBe(false);
  });

  test('rejects something that would end the string and start a statement', () => {
    expect(isRankingMetric("viewCount'; DROP TABLE video; --")).toBe(false);
  });
});

describe('rankingExpression', () => {
  test('is the column itself for a count the row holds', () => {
    expect(rankingExpression('viewCount')).toEqual('view_count');
    expect(rankingExpression('duration')).toEqual('duration_seconds');
  });

  // Both columns are INTEGER, and SQLite's / on two integers is integer
  // division: without the cast every rate below one is zero and the ranking is
  // a list of ties.
  test('casts before dividing, for every metric that divides', () => {
    const dividing: RankingMetric[] = [
      'viewCountPerSecond',
      'likeCountPerSecond',
      'commentCountPerSecond',
      'chatMessageCountPerSecond',
      'chatMessageCountPerUniqueUser',
    ];

    for (const metric of dividing) {
      expect(rankingExpression(metric)).toContain('CAST(');
      expect(rankingExpression(metric)).toContain('AS REAL)');
    }
  });
});

describe('rankingFilter', () => {
  test('requires the one column a plain count needs', () => {
    expect(rankingFilter('viewCount')).toEqual('view_count IS NOT NULL');
  });

  // A migrated row has neither a type nor a duration until video-update
  // reaches it. It is left out rather than ordered as if the missing part were
  // zero.
  test('requires both columns a rate needs', () => {
    const filter = rankingFilter('viewCountPerSecond');

    expect(filter).toContain('view_count IS NOT NULL');
    expect(filter).toContain('duration_seconds IS NOT NULL');
  });

  // SQLite answers a division by zero with NULL, which sorts as if the video
  // had never been measured rather than as an error.
  test('excludes a divisor of zero wherever it divides', () => {
    expect(rankingFilter('viewCountPerSecond')).toContain('duration_seconds > 0');
    expect(rankingFilter('chatMessageCountPerUniqueUser')).toContain('chat_unique_user_count > 0');
  });

  // Ranking by length is not dividing by it, so a video of no length is a
  // legitimate last place rather than an exclusion.
  test('does not exclude a zero length when length is the ranking', () => {
    expect(rankingFilter('duration')).toEqual('duration_seconds IS NOT NULL');
  });
});
