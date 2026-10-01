import type { FootprintsEvent } from '@/admin/lib/footprints';
import type { GenetStream } from '@/admin/lib/genet-streams';
import {
  canPublishAny,
  firstStart,
  jstDate,
  moveSelection,
  plainTitle,
  publishItemLink,
  publishItemMark,
  reviewRows,
  runEach,
  selectionAfterReload,
  type PublishItem,
} from '@/admin/lib/inbox';

function event(eventId: number, startDate: string, status = 'draft'): FootprintsEvent {
  return {
    eventId,
    datePrecision: startDate.length === 7 ? 'month' : 'day',
    startDate,
    startsAt: null,
    endDate: null,
    kind: 'other',
    emphasized: false,
    title: `event ${eventId}`,
    place: null,
    supplement: null,
    videoId: null,
    sourcePending: false,
    status,
    memo: null,
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
    channelIds: [],
    sources: [],
  };
}

function stream(videoId: string, publishedAt: string, status = 'draft'): GenetStream {
  return {
    videoId,
    platform: 'youtube',
    url: null,
    videoType: 'live',
    title: videoId,
    shortTitle: null,
    publishedAt,
    categories: [],
    keywords: [],
    status,
    memo: null,
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
    performances: [],
  };
}

describe('jstDate', () => {
  test('is the Japan-time date, a day ahead of UTC from 15:00', () => {
    expect(jstDate('2026-01-31T14:59:59Z')).toEqual('2026-01-31');
    expect(jstDate('2026-01-31T15:00:00Z')).toEqual('2026-02-01');
  });
});

describe('reviewRows', () => {
  test('puts rows not yet looked at first, then by date across both pages', () => {
    const rows = reviewRows({
      events: [event(1, '2025-03-01'), event(2, '2021-01-01', 'review'), event(3, '2022-10')],
      streams: [stream('s1', '2024-06-30T15:30:00Z'), stream('s2', '2020-01-01T00:00:00Z', 'review')],
      tuneTitles: {},
    });

    expect(rows.map((r) => [r.key, r.date])).toEqual([
      ['event:3', '2022-10'],
      ['stream:s1', '2024-07-01'],
      ['event:1', '2025-03-01'],
      ['stream:s2', '2020-01-01'],
      ['event:2', '2021-01-01'],
    ]);
  });
});

describe('moveSelection', () => {
  const keys = ['a', 'b', 'c'];

  test('moves one row and stops at either end', () => {
    expect(moveSelection(keys, 'b', 1)).toEqual('c');
    expect(moveSelection(keys, 'c', 1)).toEqual('c');
    expect(moveSelection(keys, 'a', -1)).toEqual('a');
  });

  test('starts from the first row when nothing is selected', () => {
    expect(moveSelection(keys, null, 1)).toEqual('a');
    expect(moveSelection([], null, 1)).toBeNull();
  });
});

describe('selectionAfterReload', () => {
  test('keeps a row that is still there', () => {
    expect(selectionAfterReload(['a', 'b'], ['b', 'a'], 'a')).toEqual('a');
  });

  test('moves to the row that took the settled one’s place', () => {
    expect(selectionAfterReload(['a', 'b', 'c'], ['a', 'c'], 'b')).toEqual('c');
  });

  test('counts only the rows before it that are still there, when several went at once', () => {
    expect(selectionAfterReload(['a', 'b', 'c', 'd'], ['c', 'd'], 'b')).toEqual('c');
  });

  test('falls back to the last row, and to nothing when the list is empty', () => {
    expect(selectionAfterReload(['a', 'b'], ['a'], 'b')).toEqual('a');
    expect(selectionAfterReload(['a'], [], 'a')).toBeNull();
  });

  test('selects the first row when nothing was selected', () => {
    expect(selectionAfterReload([], ['x', 'y'], null)).toEqual('x');
  });
});

describe('runEach', () => {
  test('carries on past a failure and reports it with its reason', async () => {
    const progress: number[] = [];
    const acted: number[] = [];

    const failures = await runEach(
      [1, 2, 3],
      async (n) => {
        if (n === 2) throw new Error('title must not be empty');
        acted.push(n);
      },
      (n) => ({ key: String(n), title: `row ${n}` }),
      (done) => progress.push(done),
    );

    expect(acted).toEqual([1, 3]);
    expect(progress).toEqual([1, 2, 3]);
    expect(failures).toEqual([{ key: '2', title: 'row 2', message: 'title must not be empty' }]);
  });
});

describe('firstStart', () => {
  test('is the first scene that has a moment, or null', () => {
    expect(
      firstStart({
        tuneId: 1,
        description: null,
        scenes: [
          { style: 'bgm', videoId: 'x', startSeconds: null },
          { style: 'play', videoId: 'x', startSeconds: 90 },
        ],
      }),
    ).toEqual(90);
    expect(firstStart({ tuneId: 1, description: null, scenes: [] })).toBeNull();
  });
});

function item(overrides: Partial<PublishItem>): PublishItem {
  return {
    target: 'footprints',
    entity: 'footprints_event',
    key: '7',
    title: 't',
    date: null,
    latestAction: 'publish',
    ...overrides,
  };
}

describe('publishItemMark', () => {
  test('a withdrawn row waits to be taken off, not to go public', () => {
    expect(publishItemMark(item({ latestAction: 'withdraw' }))).toEqual({ label: '取り下げ待ち', tone: 'draft' });
    expect(publishItemMark(item({ latestAction: 'publish' }))).toEqual({ label: '公開待ち', tone: 'waiting' });
  });
});

describe('publishItemLink', () => {
  test('leads to the screen the row is edited on', () => {
    expect(publishItemLink(item({}))).toEqual({ path: '/footprints', query: { event: '7' } });
    expect(publishItemLink(item({ entity: 'genet_stream', key: 'abc' }))).toEqual({
      path: '/sets',
      query: { video: 'abc' },
    });
    expect(publishItemLink(item({ entity: 'genet_tune' }))).toEqual({ path: '/sets' });
    expect(publishItemLink(item({ entity: 'subscriber_milestone', key: '9' }))).toEqual({
      path: '/subscribers',
      query: { milestone: '9' },
    });
  });
});

describe('canPublishAny', () => {
  test('is true when either public JSON has something to do', () => {
    expect(canPublishAny({ items: [], canPublish: { footprints: false, genet: false, milestones: false } })).toBe(
      false,
    );
    expect(canPublishAny({ items: [], canPublish: { footprints: false, genet: true, milestones: false } })).toBe(true);
    expect(canPublishAny({ items: [], canPublish: { footprints: false, genet: false, milestones: true } })).toBe(true);
  });
});

describe('plainTitle', () => {
  test('reads each link as its label', () => {
    expect(plainTitle('「[アルルの女](wiki:アルルの女)」より [ファランドール](wiki:アルルの女#第2組曲)')).toEqual(
      '「アルルの女」より ファランドール',
    );
    expect(plainTitle('ダミーの曲 2')).toEqual('ダミーの曲 2');
    expect(plainTitle('[猫](wiki:猫_(DISH//の曲))')).toEqual('猫');
  });
});
