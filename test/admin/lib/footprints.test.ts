import {
  emptyFormFields,
  fieldForSaveError,
  footprintsButtonsFor,
  footprintsQuery,
  kindLabel,
  KINDS,
  STATUS_LABEL,
  toFormFields,
  type FootprintsEvent,
} from '@/admin/lib/footprints';

describe('KINDS', () => {
  test('has 14 entries, matching worker/src/admin/footprints.ts', () => {
    expect(KINDS).toHaveLength(14);
  });

  test('every value is unique', () => {
    expect(new Set(KINDS.map((k) => k.value)).size).toEqual(KINDS.length);
  });
});

describe('kindLabel', () => {
  test('answers the label for a known kind', () => {
    expect(kindLabel('debut')).toEqual('デビュー');
  });

  test('falls back to the raw value for an unknown kind', () => {
    expect(kindLabel('nope')).toEqual('nope');
  });
});

describe('STATUS_LABEL', () => {
  test('covers draft, review and published', () => {
    expect(STATUS_LABEL).toEqual({ draft: '下書き', review: '確認中', published: '公開' });
  });
});

describe('footprintsQuery', () => {
  test('is empty when status is all and q is blank', () => {
    expect(footprintsQuery('all', '')).toEqual('');
    expect(footprintsQuery('all', '   ')).toEqual('');
  });

  test('narrows by status alone', () => {
    expect(footprintsQuery('draft', '')).toEqual('?status=draft');
  });

  test('narrows by q alone, trimmed', () => {
    expect(footprintsQuery('all', '  デビュー  ')).toEqual(`?q=${encodeURIComponent('デビュー')}`);
  });

  test('narrows by both together', () => {
    expect(footprintsQuery('review', 'x')).toEqual('?status=review&q=x');
  });
});

describe('fieldForSaveError', () => {
  test.each([
    ['datePrecision must be day or month', 'datePrecision'],
    ['startDate must be YYYY-MM-DD', 'startDate'],
    ['startsAt must be YYYY-MM-DDTHH:MM:SSZ or null', 'startsAt'],
    ['endDate is before startDate', 'endDate'],
    ['kind must be one of project, announcement, ...', 'kind'],
    ['title must not be empty', 'title'],
    ['videoId must be 11 characters', 'videoId'],
    ['every source url must start with https://', 'sources'],
    ['sourcePending is false but there are no sources', 'sources'],
    ['unknown channelIds: UCnope', 'channelIds'],
    ['emphasized must be a boolean', 'emphasized'],
  ])('maps %s to %s', (message, field) => {
    expect(fieldForSaveError(message)).toEqual(field);
  });

  test('answers null for a message naming no field', () => {
    expect(fieldForSaveError('no footprints event 1')).toBeNull();
  });

  // startDate also appears inside "endDate is before startDate" - endDate
  // must win there since that is the field actually out of range.
  test('prefers the more specific field when a message names two', () => {
    expect(fieldForSaveError('endDate is before startDate')).toEqual('endDate');
  });
});

describe('toFormFields', () => {
  const event: FootprintsEvent = {
    eventId: 1,
    datePrecision: 'day',
    startDate: '2025-01-01',
    startsAt: null,
    endDate: null,
    kind: 'debut',
    emphasized: true,
    title: 'デビュー配信',
    place: 'YouTube',
    supplement: null,
    videoId: null,
    sourcePending: false,
    status: 'published',
    memo: null,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    channelIds: ['UCaaa'],
    sources: [{ url: 'https://example.com', title: null }],
  };

  test('carries over every field a save sends', () => {
    expect(toFormFields(event)).toEqual({
      datePrecision: 'day',
      startDate: '2025-01-01',
      startsAt: null,
      endDate: null,
      kind: 'debut',
      emphasized: true,
      title: 'デビュー配信',
      place: 'YouTube',
      supplement: null,
      videoId: null,
      sourcePending: false,
      memo: null,
      channelIds: ['UCaaa'],
      sources: [{ url: 'https://example.com', title: null }],
    });
  });

  test('deep-copies channelIds and sources, so editing the result leaves the row untouched', () => {
    const fields = toFormFields(event);

    fields.channelIds.push('UCbbb');
    fields.sources[0]!.url = 'https://changed.example.com';

    expect(event.channelIds).toEqual(['UCaaa']);
    expect(event.sources).toEqual([{ url: 'https://example.com', title: null }]);
  });
});

describe('emptyFormFields', () => {
  test('starts as an empty draft, ready to publish once filled in', () => {
    expect(emptyFormFields('2026-09-19')).toEqual({
      datePrecision: 'day',
      startDate: '2026-09-19',
      startsAt: null,
      endDate: null,
      kind: 'other',
      emphasized: false,
      title: '',
      place: null,
      supplement: null,
      videoId: null,
      sourcePending: true,
      memo: null,
      channelIds: [],
      sources: [],
    });
  });
});

describe('footprintsButtonsFor', () => {
  test('a draft or review event offers 公開する, with 削除 enabled', () => {
    expect(footprintsButtonsFor('draft')).toEqual({ primaryLabel: '公開する', deleteDisabled: false });
    expect(footprintsButtonsFor('review')).toEqual({ primaryLabel: '公開する', deleteDisabled: false });
  });

  test('a published event offers 下書きに戻す, with 削除 disabled', () => {
    expect(footprintsButtonsFor('published')).toEqual({ primaryLabel: '下書きに戻す', deleteDisabled: true });
  });
});
