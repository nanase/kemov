import {
  AVAILABILITY_LABEL,
  emptyOverrideFields,
  fieldForSaveError,
  overridesNothing,
  toOverrideFormFields,
  TYPE_LABEL,
  type VideoOverride,
} from '@/admin/lib/videos';

describe('TYPE_LABEL and AVAILABILITY_LABEL', () => {
  test('cover every value the schema allows', () => {
    expect(TYPE_LABEL).toEqual({ video: '動画', streaming: '配信', shorts: 'ショート' });
    expect(AVAILABILITY_LABEL).toEqual({
      public: '公開',
      membership: 'メン限',
      private: '非公開',
      unavailable: '削除・不明',
    });
  });
});

describe('toOverrideFormFields', () => {
  test('carries over title/type/availability/memo, leaving out videoId/updatedAt/videoTitle', () => {
    const override: VideoOverride = {
      videoId: 'vid1',
      title: '上書き後の題',
      type: 'streaming',
      availability: null,
      memo: 'メモ',
      updatedAt: '2026-09-01T00:00:00Z',
      videoTitle: '収集した題',
    };

    expect(toOverrideFormFields(override)).toEqual({
      title: '上書き後の題',
      type: 'streaming',
      availability: null,
      memo: 'メモ',
    });
  });
});

describe('emptyOverrideFields', () => {
  test('starts with every field null', () => {
    expect(emptyOverrideFields()).toEqual({ title: null, type: null, availability: null, memo: null });
  });
});

describe('overridesNothing', () => {
  test('is true when title/type/availability are all null, even with a memo', () => {
    expect(overridesNothing({ title: null, type: null, availability: null, memo: null })).toEqual(true);
    expect(overridesNothing({ title: null, type: null, availability: null, memo: 'x' })).toEqual(true);
  });

  test('is false once any of title/type/availability is set', () => {
    expect(overridesNothing({ title: 'x', type: null, availability: null, memo: null })).toEqual(false);
    expect(overridesNothing({ title: null, type: 'streaming', availability: null, memo: null })).toEqual(false);
    expect(overridesNothing({ title: null, type: null, availability: 'public', memo: null })).toEqual(false);
  });
});

describe('fieldForSaveError', () => {
  test.each([
    ['title must be a non-empty string or null', 'title'],
    ['type must be one of video, streaming, shorts, or null', 'type'],
    ['availability must be one of public, membership, private, unavailable, or null', 'availability'],
  ])('maps %s to %s', (message, field) => {
    expect(fieldForSaveError(message)).toEqual(field);
  });

  test('answers null for a message naming no field this screen tracks', () => {
    expect(fieldForSaveError('at least one of title, type and availability must not be null')).toBeNull();
  });
});
