import type { VideoTableRow } from '@/lib/ranking';
import type { VideoTable } from '@/type/api';
import {
  activeFilterKeys,
  filterUniverse,
  funnelSteps,
  kindStages,
  lengthBandOf,
  matchRanges,
  NO_FILTERS,
  nonEmptyAlternatives,
  passesLength,
  periodLabel,
  rowsFrom,
  scopeName,
  titleSegments,
  searchTokens,
  shelfFilterCount,
  shownCountOf,
  universeOf,
  yearsIn,
  type Filters,
} from '@/videos/model';

/**
 * #135's page logic, checked without a DOM.
 *
 * Every scenario here comes from #135's own body or from the confirmed mock:
 * species and period alone decide a ranking's denominator, and the length,
 * channel and title filters only ever hide rows out of it.
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

describe('rowsFrom', () => {
  test('denormalizes each column into one row per video', () => {
    const table: VideoTable = {
      fetchedAt: null,
      columns: {
        videoId: ['a', 'b'],
        channelId: ['UCaaa', 'UCbbb'],
        title: ['あ', 'い'],
        type: ['streaming', null],
        publishedAt: ['2026-01-01T00:00:00Z', '2026-02-01T00:00:00Z'],
        durationSeconds: [60, null],
        viewCount: [1, null],
        likeCount: [null, null],
        commentCount: [null, null],
        chatMessageCount: [null, null],
        chatUniqueUserCount: [null, null],
        actualStartTime: [null, null],
        actualEndTime: [null, null],
      },
    };

    const rows = rowsFrom(table);

    expect(rows).toEqual([
      {
        videoId: 'a',
        channelId: 'UCaaa',
        title: 'あ',
        type: 'streaming',
        publishedAt: '2026-01-01T00:00:00Z',
        durationSeconds: 60,
        viewCount: 1,
        likeCount: null,
        commentCount: null,
        chatMessageCount: null,
        chatUniqueUserCount: null,
        actualStartTime: null,
        actualEndTime: null,
      },
      {
        videoId: 'b',
        channelId: 'UCbbb',
        title: 'い',
        type: null,
        publishedAt: '2026-02-01T00:00:00Z',
        durationSeconds: null,
        viewCount: null,
        likeCount: null,
        commentCount: null,
        chatMessageCount: null,
        chatUniqueUserCount: null,
        actualStartTime: null,
        actualEndTime: null,
      },
    ]);
  });
});

describe('passesLength', () => {
  test("'any' admits every duration, including a missing one", () => {
    expect(passesLength(null, lengthBandOf('any'))).toBe(true);
    expect(passesLength(999999, lengthBandOf('any'))).toBe(true);
  });

  test('a band with only an upper bound admits up to it and excludes at it', () => {
    const band = lengthBandOf('a'); // 〜10 分, hi: 600

    expect(passesLength(599, band)).toBe(true);
    expect(passesLength(600, band)).toBe(false);
  });

  test('a band with both bounds admits its lower bound and excludes its upper one', () => {
    const band = lengthBandOf('b'); // 10 分〜1 時間, lo: 600, hi: 3600

    expect(passesLength(600, band)).toBe(true);
    expect(passesLength(3600, band)).toBe(false);
    expect(passesLength(599, band)).toBe(false);
  });

  test('a bounded band excludes a video whose duration is not collected', () => {
    expect(passesLength(null, lengthBandOf('a'))).toBe(false);
  });
});

describe('yearsIn', () => {
  test('lists the distinct JST years, newest first', () => {
    const rows = [
      row({ videoId: 'a', publishedAt: '2021-06-15T00:00:00Z' }),
      row({ videoId: 'b', publishedAt: '2024-01-01T00:00:00Z' }),
      row({ videoId: 'c', publishedAt: '2021-01-01T00:00:00Z' }),
    ];

    expect(yearsIn(rows).map((y) => y.year)).toEqual([2024, 2021]);
  });

  // 2025-12-31T15:00:00Z is 2026-01-01T00:00:00+09:00 - the JST year has
  // already turned over even though the UTC year has not.
  test('a video published just after JST midnight counts toward the new year', () => {
    const rows = [row({ publishedAt: '2025-12-31T15:00:00Z' })];

    expect(yearsIn(rows).map((y) => y.year)).toEqual([2026]);
  });

  test('each option carries the period universeOf can be called with', () => {
    const rows = [row({ publishedAt: '2021-06-15T00:00:00Z' })];

    expect(yearsIn(rows)).toEqual([{ year: 2021, period: { year: 2021 }, name: '2021 年' }]);
  });
});

describe('periodLabel', () => {
  test.each([
    ['all', '全期間'],
    ['p365', '直近 1 年'],
    ['p90', '90 日'],
    ['p30', '30 日'],
  ] as const)('%s reads as %s', (period, label) => {
    expect(periodLabel(period)).toEqual(label);
  });

  test('a year reads as the year itself', () => {
    expect(periodLabel({ year: 2021 })).toEqual('2021 年');
  });
});

describe('scopeName', () => {
  test('joins the kind and the period the way the count sentence does', () => {
    expect(scopeName('streaming', 'all')).toEqual('配信・全期間');
    expect(scopeName('video', { year: 2021 })).toEqual('動画・2021 年');
  });
});

describe('universeOf', () => {
  test('ranks every video that has the metric, best first, and reports the total and the top value', () => {
    const rows = [
      row({ videoId: 'low', viewCount: 10 }),
      row({ videoId: 'high', viewCount: 30 }),
      row({ videoId: 'mid', viewCount: 20 }),
    ];

    const universe = universeOf(rows, 'viewCount', 'streaming', 'all', NOW);

    expect(universe.entries.map((e) => e.row.videoId)).toEqual(['high', 'mid', 'low']);
    expect(universe.entries.map((e) => e.rank)).toEqual([1, 2, 3]);
    expect(universe.total).toEqual(3);
    expect(universe.top).toEqual(30);
    expect(universe.byId.get('high')?.rank).toEqual(1);
  });

  test('an empty universe has a top of zero rather than throwing', () => {
    const universe = universeOf([row({ type: 'video' })], 'viewCount', 'streaming', 'all', NOW);

    expect(universe.total).toEqual(0);
    expect(universe.top).toEqual(0);
    expect(universe.entries).toEqual([]);
  });

  // #135's central rule: a video keeps the rank it has in the whole kind and
  // period, whether or not it happens to be in the caller's filtered rows.
  test('a video not admitted by the metric has no entry, rather than one ranked last', () => {
    const rows = [row({ videoId: 'has-views', viewCount: 10 }), row({ videoId: 'no-views', viewCount: null })];

    const universe = universeOf(rows, 'viewCount', 'streaming', 'all', NOW);

    expect(universe.byId.has('no-views')).toBe(false);
    expect(universe.total).toEqual(1);
  });
});

describe('kindStages', () => {
  test('counts the kind alone, and the kind narrowed to what can supply the metric', () => {
    const rows = [
      row({ videoId: 'a', type: 'streaming', viewCount: 1, durationSeconds: 10 }),
      row({ videoId: 'b', type: 'streaming', viewCount: null, durationSeconds: 10 }),
      row({ videoId: 'c', type: 'video', viewCount: 1, durationSeconds: 10 }),
    ];

    expect(kindStages(rows, 'viewCount', 'streaming')).toEqual({ kind: 2, metric: 1 });
  });

  // A per-second rate needs a duration, not just a view count - the case #70
  // exists for.
  test('a rate metric needs its divisor too, not only its numerator', () => {
    const rows = [row({ viewCount: 100, durationSeconds: null })];

    expect(kindStages(rows, 'viewCountPerSecond', 'streaming')).toEqual({ kind: 1, metric: 0 });
  });

  // kindStages does not take a period: it is what #135's funnel compares a
  // period-narrowed count against, not itself narrowed by one.
  test('is not narrowed by how old a video is', () => {
    const rows = [row({ publishedAt: '2000-01-01T00:00:00Z' })];

    expect(kindStages(rows, 'viewCount', 'streaming').kind).toEqual(1);
  });
});

describe('searchTokens', () => {
  test('splits on whitespace, including full-width space', () => {
    expect(searchTokens('歌って　みた')).toEqual(['歌って', 'みた']);
  });

  test('folds case and katakana onto hiragana, so either form can be typed', () => {
    expect(searchTokens('ABC')).toEqual(searchTokens('abc'));
    expect(searchTokens('マイクラ')).toEqual(searchTokens('まいくら'));
  });

  test('an empty or all-whitespace query has no tokens', () => {
    expect(searchTokens('')).toEqual([]);
    expect(searchTokens('   ')).toEqual([]);
  });
});

describe('matchRanges', () => {
  test('finds where a token occurs, case- and kana-insensitively', () => {
    expect(matchRanges('マイクラ実況', searchTokens('まいくら'))).toEqual([{ start: 0, end: 4 }]);
  });

  test('merges overlapping or touching hits into one range', () => {
    expect(matchRanges('ああああ', searchTokens('ああ'))).toEqual([{ start: 0, end: 4 }]);
  });

  // The two tokens land back-to-back in the title, so - like two hits that
  // overlap - they merge into one highlighted run rather than two adjacent
  // ones with nothing marking the seam between them.
  test('reports one merged range when two tokens land back-to-back', () => {
    expect(matchRanges('歌ってみた特集', searchTokens('歌って みた'))).toEqual([{ start: 0, end: 5 }]);
  });

  test('reports one range per token when they do not touch', () => {
    expect(matchRanges('歌ってみた特集配信', searchTokens('歌って 配信'))).toEqual([
      { start: 0, end: 3 },
      { start: 7, end: 9 },
    ]);
  });

  test('no tokens is no ranges', () => {
    expect(matchRanges('タイトル', [])).toEqual([]);
  });

  test('no match is no ranges', () => {
    expect(matchRanges('雑談', searchTokens('マイクラ'))).toEqual([]);
  });
});

describe('titleSegments', () => {
  test('no tokens is the whole title as one unmarked segment', () => {
    expect(titleSegments('マイクラ実況', [])).toEqual([{ text: 'マイクラ実況', marked: false }]);
  });

  test('a match in the middle splits the title into three segments', () => {
    expect(titleSegments('雑談・マイクラ・企画', searchTokens('マイクラ'))).toEqual([
      { text: '雑談・', marked: false },
      { text: 'マイクラ', marked: true },
      { text: '・企画', marked: false },
    ]);
  });

  test('a match at the very start has no leading unmarked segment', () => {
    expect(titleSegments('マイクラ実況', searchTokens('マイクラ'))).toEqual([
      { text: 'マイクラ', marked: true },
      { text: '実況', marked: false },
    ]);
  });

  test('joining every segment back together reproduces the title', () => {
    const title = '雑談・マイクラ・企画会議';
    const segments = titleSegments(title, searchTokens('マイクラ'));

    expect(segments.map((s) => s.text).join('')).toEqual(title);
  });
});

describe('filterUniverse', () => {
  const rows = [
    row({ videoId: 'a', channelId: 'UCaaa', title: '歌ってみた', durationSeconds: 200, viewCount: 30 }),
    row({ videoId: 'b', channelId: 'UCbbb', title: '雑談', durationSeconds: 4000, viewCount: 20 }),
    row({ videoId: 'c', channelId: 'UCaaa', title: '歌ってみた その2', durationSeconds: 200, viewCount: 10 }),
  ];
  const universe = universeOf(rows, 'viewCount', 'streaming', 'all', NOW);

  test('no filters admits every entry, still in rank order', () => {
    const view = filterUniverse(universe, NO_FILTERS);

    expect(view.rows.map((e) => e.row.videoId)).toEqual(['a', 'b', 'c']);
    expect(view.afterLength).toEqual(3);
    expect(view.afterChannel).toEqual(3);
  });

  test('narrows by length without moving a surviving row’s rank', () => {
    const filters: Filters = { ...NO_FILTERS, lengthBandId: 'a' }; // 〜10 分
    const view = filterUniverse(universe, filters);

    expect(view.rows.map((e) => e.row.videoId)).toEqual(['a', 'c']);
    expect(view.rows.map((e) => e.rank)).toEqual([1, 3]);
    expect(view.afterLength).toEqual(2);
  });

  test('narrows by channel after length, reporting the count between the two stages', () => {
    const filters: Filters = { ...NO_FILTERS, channelIds: new Set(['UCbbb']) };
    const view = filterUniverse(universe, filters);

    expect(view.rows.map((e) => e.row.videoId)).toEqual(['b']);
    expect(view.afterLength).toEqual(3);
    expect(view.afterChannel).toEqual(1);
  });

  test('narrows by title last, every word required', () => {
    const filters: Filters = { ...NO_FILTERS, query: '歌ってみた' };
    const view = filterUniverse(universe, filters);

    expect(view.rows.map((e) => e.row.videoId)).toEqual(['a', 'c']);
  });

  test('combines every filter, each narrowing what the last left', () => {
    const filters: Filters = { lengthBandId: 'a', channelIds: new Set(['UCaaa']), query: 'その2' };
    const view = filterUniverse(universe, filters);

    expect(view.rows.map((e) => e.row.videoId)).toEqual(['c']);
  });

  // Filtering never asks universeOf a second question: a video's rank is
  // always the one it has in the whole kind and period, #135's rule against
  // a filter quietly making a member-by-member ranking.
  test('a filtered row keeps the rank the unfiltered universe gave it', () => {
    const filters: Filters = { ...NO_FILTERS, channelIds: new Set(['UCaaa']) };
    const view = filterUniverse(universe, filters);

    expect(view.rows.map((e) => e.rank)).toEqual([1, 3]);
  });
});

describe('activeFilterKeys and shelfFilterCount', () => {
  test('no filters is nothing active', () => {
    expect(activeFilterKeys(NO_FILTERS)).toEqual([]);
    expect(shelfFilterCount(NO_FILTERS)).toEqual(0);
  });

  test('a length band and a channel selection both count toward the shelf badge', () => {
    const filters: Filters = { lengthBandId: 'a', channelIds: new Set(['UCaaa']), query: '' };

    expect(activeFilterKeys(filters)).toEqual(['length', 'channel']);
    expect(shelfFilterCount(filters)).toEqual(2);
  });

  // The title search has its own "消す" beside the field and is not part of
  // the shelf's own badge.
  test('a title search is active but not counted on the shelf badge', () => {
    const filters: Filters = { ...NO_FILTERS, query: 'マイクラ' };

    expect(activeFilterKeys(filters)).toEqual(['query']);
    expect(shelfFilterCount(filters)).toEqual(0);
  });
});

describe('shownCountOf', () => {
  test('is the smaller of the page size and the row count', () => {
    expect(shownCountOf(250, 100)).toEqual(100);
    expect(shownCountOf(40, 100)).toEqual(40);
  });
});

describe('funnelSteps', () => {
  test('the three fixed rungs are always present, in order', () => {
    const rows = [row({ videoId: 'a', viewCount: 1 })];
    const universe = universeOf(rows, 'viewCount', 'streaming', 'all', NOW);
    const view = filterUniverse(universe, NO_FILTERS);

    const steps = funnelSteps(rows, 'viewCount', 'streaming', 'all', NO_FILTERS, universe, view);

    expect(steps.map((s) => s.key)).toEqual(['kind', 'metric', 'period']);
  });

  test('an inactive filter adds no rung, and an active one adds exactly one, in the fixed order', () => {
    const rows = [
      row({ videoId: 'a', channelId: 'UCaaa', title: '歌ってみた', durationSeconds: 200, viewCount: 1 }),
      row({ videoId: 'b', channelId: 'UCbbb', title: '雑談', durationSeconds: 4000, viewCount: 2 }),
    ];
    const universe = universeOf(rows, 'viewCount', 'streaming', 'all', NOW);
    const filters: Filters = { lengthBandId: 'a', channelIds: new Set(['UCaaa']), query: '歌ってみた' };
    const view = filterUniverse(universe, filters);

    const steps = funnelSteps(rows, 'viewCount', 'streaming', 'all', filters, universe, view);

    expect(steps.map((s) => s.key)).toEqual(['kind', 'metric', 'period', 'length', 'channel', 'query']);
    expect(steps.find((s) => s.key === 'length')?.count).toEqual(view.afterLength);
    expect(steps.find((s) => s.key === 'channel')?.count).toEqual(view.afterChannel);
    expect(steps.find((s) => s.key === 'query')?.count).toEqual(view.rows.length);
  });
});

describe('nonEmptyAlternatives', () => {
  test('offers other kinds and other periods that are not empty, best-stocked first', () => {
    const rows = [
      row({ videoId: 'a', type: 'streaming', publishedAt: '2020-01-01T00:00:00Z', viewCount: 1 }),
      row({ videoId: 'b', type: 'video', publishedAt: '2026-09-01T00:00:00Z', viewCount: 1 }),
      row({ videoId: 'c', type: 'video', publishedAt: '2026-09-02T00:00:00Z', viewCount: 1 }),
      row({ videoId: 'd', type: 'video', publishedAt: '2026-09-03T00:00:00Z', viewCount: 1 }),
    ];

    const alternatives = nonEmptyAlternatives(rows, 'viewCount', 'streaming', 'p30', ['all', 'p30'], NOW);

    // streaming/p30 is empty (the one streaming video is from 2020); video is
    // the best-stocked alternative kind, and 'all' beats the current period.
    expect(alternatives[0]).toMatchObject({ kind: 'video', count: 3 });
  });

  test('never offers the combination already being shown', () => {
    const rows = [row({ type: 'streaming', viewCount: 1 })];

    const alternatives = nonEmptyAlternatives(rows, 'viewCount', 'streaming', 'all', ['all'], NOW);

    expect(alternatives).toEqual([]);
  });

  test('leaves out a combination that is itself empty', () => {
    const rows = [row({ type: 'streaming', viewCount: 1, publishedAt: '2020-01-01T00:00:00Z' })];

    const alternatives = nonEmptyAlternatives(rows, 'viewCount', 'streaming', 'all', ['all', 'p30'], NOW);

    expect(alternatives.some((a) => a.period === 'p30')).toBe(false);
  });

  test('stops at the limit', () => {
    const rows = [
      row({ videoId: 'a', type: 'video', viewCount: 1 }),
      row({ videoId: 'b', type: 'shorts', viewCount: 1 }),
    ];

    const alternatives = nonEmptyAlternatives(rows, 'viewCount', 'streaming', 'all', ['all', 'p30', 'p90'], NOW, 1);

    expect(alternatives).toHaveLength(1);
  });
});
