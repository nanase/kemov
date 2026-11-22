import {
  emptyFormFields,
  fieldForSaveError,
  moveEntries,
  performanceMoves,
  toFormFields,
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
