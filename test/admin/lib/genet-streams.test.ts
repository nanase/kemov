import {
  emptyFormFields,
  fieldForSaveError,
  leavesFilter,
  moveEntries,
  openTuneUnread,
  performanceMoves,
  streamsQuery,
  toFormFields,
  withoutIndex,
  withoutItem,
  type GenetStream,
} from '@/admin/lib/genet-streams';

const STREAM: GenetStream = {
  videoId: 'abcdefghijk',
  platform: 'youtube',
  url: null,
  videoType: 'live',
  title: '配信題',
  shortTitle: null,
  publishedAt: '2026-09-01T00:00:00Z',
  categories: ['歌枠'],
  keywords: ['雑談'],
  status: 'draft',
  memo: null,
  createdAt: '2026-09-01T00:00:00Z',
  updatedAt: '2026-09-01T00:00:00Z',
  version: 1,
  performances: [
    { tuneId: 1, description: null, scenes: [{ style: 'sing', videoId: 'abcdefghijk', startSeconds: 90 }] },
  ],
};

describe('toFormFields', () => {
  test('carries over the editable fields, leaving out status/createdAt/updatedAt/videoId', () => {
    const fields = toFormFields(STREAM);

    expect(fields).toEqual({
      platform: 'youtube',
      url: null,
      videoType: 'live',
      title: '配信題',
      shortTitle: null,
      publishedAt: '2026-09-01T00:00:00Z',
      categories: ['歌枠'],
      keywords: ['雑談'],
      memo: null,
      performances: STREAM.performances,
    });
    expect(fields.categories).not.toBe(STREAM.categories);
    expect(fields.performances).not.toBe(STREAM.performances);
    expect(fields.performances[0]).not.toBe(STREAM.performances[0]);
    expect(fields.performances[0]!.scenes).not.toBe(STREAM.performances[0]!.scenes);
  });
});

describe('emptyFormFields', () => {
  test('defaults platform to youtube and videoType to live, everything else empty', () => {
    expect(emptyFormFields()).toEqual({
      platform: 'youtube',
      url: null,
      videoType: 'live',
      title: '',
      shortTitle: null,
      publishedAt: '',
      categories: [],
      keywords: [],
      memo: null,
      performances: [],
    });
  });
});

describe('fieldForSaveError', () => {
  test.each([
    ['title must be a string', 'title', null, null],
    ['shortTitle must be a string or null', 'shortTitle', null, null],
    ['platform must be one of youtube, tiktok', 'platform', null, null],
    ['url must start with https://', 'url', null, null],
    ['videoType must be one of live, video, short', 'videoType', null, null],
    ['publishedAt must be YYYY-MM-DDTHH:MM:SSZ', 'publishedAt', null, null],
    ['categories must be an array of strings', 'categories', null, null],
    ['keywords must be an array of strings', 'keywords', null, null],
    ['memo must be a string or null', 'memo', null, null],
    ['performances must be an array', 'performances', null, null],
    ['each performance must be an object', 'performances', null, null],
    ['each scene must be an object', 'performances', null, null],
    ['unknown tuneIds: 9', 'performances', null, null],
  ])('maps %s to %s / %s / %s', (message, section, performanceIndex, sceneIndex) => {
    expect(fieldForSaveError(message)).toEqual({ section, performanceIndex, sceneIndex });
  });

  test('maps a bare performance index', () => {
    expect(fieldForSaveError('performances[2].tuneId does not exist')).toEqual({
      section: 'performances',
      performanceIndex: 2,
      sceneIndex: null,
    });
  });

  test('maps a performance and scene index together', () => {
    expect(fieldForSaveError('performances[1].scenes[3].startSeconds must be 0 or more')).toEqual({
      section: 'performances',
      performanceIndex: 1,
      sceneIndex: 3,
    });
  });

  test('answers null for a message naming no field this screen tracks', () => {
    expect(fieldForSaveError('withdraw this stream before deleting it')).toBeNull();
  });
});

describe('withoutItem', () => {
  test('removes the item at the given index only', () => {
    expect(withoutItem(['a', 'b', 'c'], 1)).toEqual(['a', 'c']);
  });
});

describe('performanceMoves', () => {
  test('follows each tune to its new index', () => {
    expect(performanceMoves([11, 22, 33], [33, 11, 22])).toEqual(
      new Map([
        [0, 1],
        [1, 2],
        [2, 0],
      ]),
    );
  });

  test('leaves out a tune the new order no longer holds', () => {
    expect(performanceMoves([11, 22, 33], [11, 33])).toEqual(
      new Map([
        [0, 0],
        [2, 1],
      ]),
    );
  });

  // The same tune twice in one stream: the k-th goes to the k-th, so neither
  // copy takes the other's fields.
  test('pairs a repeated tune in order', () => {
    expect(performanceMoves([11, 22, 11], [22, 11, 44, 11])).toEqual(
      new Map([
        [0, 1],
        [1, 0],
        [2, 3],
      ]),
    );
  });

  test('a repeated tune held fewer times keeps only its first copies', () => {
    expect(performanceMoves([11, 11], [11])).toEqual(new Map([[0, 0]]));
  });
});

describe('moveEntries', () => {
  test('moves each kept key and drops the rest', () => {
    const byIndex = new Map([
      [0, 'a'],
      [1, 'b'],
      [2, 'c'],
    ]);

    expect(
      moveEntries(
        byIndex,
        new Map([
          [0, 1],
          [2, 0],
        ]),
      ),
    ).toEqual(
      new Map([
        [1, 'a'],
        [0, 'c'],
      ]),
    );
  });
});

describe('fieldForSaveError on a new stream', () => {
  test('a taken id marks the id', () => {
    expect(fieldForSaveError('stream abcdefghijk already exists')).toEqual({
      section: 'videoId',
      performanceIndex: null,
      sceneIndex: null,
    });
  });

  test('a missing id marks the id', () => {
    expect(fieldForSaveError('videoId must be a non-empty string')?.section).toEqual('videoId');
  });
});

describe('streamsQuery', () => {
  test('is empty when nothing narrows the list', () => {
    expect(streamsQuery('all', '  ')).toEqual('');
  });

  test('carries the status and the trimmed title', () => {
    expect(streamsQuery('published', ' 歌枠 ')).toEqual(`?status=published&q=${encodeURIComponent('歌枠')}`);
  });
});

describe('leavesFilter', () => {
  test('a stream stays under すべて, and under the status it becomes', () => {
    expect(leavesFilter('all', 'published')).toBe(false);
    expect(leavesFilter('published', 'published')).toBe(false);
  });

  test('a stream published under 下書き, or withdrawn under 公開中, leaves the list', () => {
    expect(leavesFilter('draft', 'published')).toBe(true);
    expect(leavesFilter('published', 'draft')).toBe(true);
  });

  test('a stream whose title no longer has the title filter in it leaves the list', () => {
    expect(leavesFilter('all', 'draft', 'ライブ', 'ピアノ演奏会')).toBe(true);
    expect(leavesFilter('all', 'draft', 'ライブ', '夜のライブ配信')).toBe(false);
    expect(leavesFilter('all', 'draft', '  ', '')).toBe(false);
  });

  test('matches the title filter as the worker does, ignoring the case of ASCII letters alone', () => {
    expect(leavesFilter('all', 'draft', 'live', 'LIVE 配信')).toBe(false);
    expect(leavesFilter('all', 'draft', 'ａ', 'Ａ')).toBe(true);
  });
});

describe('withoutIndex', () => {
  test('drops the entry taken off, and moves every later one up by one', () => {
    const byIndex = new Map([
      [0, 'a'],
      [1, 'b'],
      [3, 'd'],
    ]);

    expect(withoutIndex(byIndex, 1)).toEqual(
      new Map([
        [0, 'a'],
        [2, 'd'],
      ]),
    );
  });
});

// #284: a tune still being read when a performance above it was taken off
// lost its answer, and stayed open with nothing read until opened again.
describe('openTuneUnread', () => {
  test('is true for an open tune with nothing read and no read on its way', () => {
    expect(openTuneUnread(1, new Map([[0, 'a']]), new Map())).toBe(true);
  });

  test('is false while a read is on its way for it, or once it is read', () => {
    expect(openTuneUnread(1, new Map(), new Map([[1, 7]]))).toBe(false);
    expect(openTuneUnread(1, new Map([[1, 'b']]), new Map())).toBe(false);
  });

  test('is false when no tune is open', () => {
    expect(openTuneUnread(null, new Map(), new Map())).toBe(false);
  });
});
