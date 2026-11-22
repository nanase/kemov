import {
  emptyFormFields,
  fieldForSaveError,
  footprintsFootFor,
  footprintsQuery,
  kindLabel,
  KINDS,
  STATUS_OPTIONS,
  toFormFields,
  type FootprintsEvent,
} from '@/admin/lib/footprints';

describe('KINDS', () => {
  test('has 15 entries, matching worker/src/admin/footprints.ts', () => {
    expect(KINDS).toHaveLength(15);
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

// The filter is a query on the status column. 「あとで」 (`review`) is gone
// since #281, and 公開待ち never was a status (#185).
describe('STATUS_OPTIONS', () => {
  test('filters by the two statuses #277 decided, and nothing else', () => {
    expect(STATUS_OPTIONS).toEqual([
      { value: 'all', label: 'すべて' },
      { value: 'draft', label: '下書き' },
      { value: 'published', label: '公開中' },
    ]);
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
    ['unknown channelIds: UCnope', 'channelIds'],
    ['every leadChannelIds entry must also be in channelIds', 'leadChannelIds'],
    ['a debut needs at least one leadChannelIds entry', 'leadChannelIds'],
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
    status: 'published',
    memo: null,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    channelIds: ['UCaaa'],
    leadChannelIds: ['UCaaa'],
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
      memo: null,
      channelIds: ['UCaaa'],
      leadChannelIds: ['UCaaa'],
      sources: [{ url: 'https://example.com', title: null }],
    });
  });

  test('deep-copies channelIds, leadChannelIds and sources, so editing the result leaves the row untouched', () => {
    const fields = toFormFields(event);

    fields.channelIds.push('UCbbb');
    fields.leadChannelIds.push('UCbbb');
    fields.sources[0]!.url = 'https://changed.example.com';

    expect(event.channelIds).toEqual(['UCaaa']);
    expect(event.leadChannelIds).toEqual(['UCaaa']);
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
      memo: null,
      channelIds: [],
      leadChannelIds: [],
      sources: [],
    });
  });
});

describe('footprintsFootFor', () => {
  // #277's decision 1a: 公開 is the primary button of a draft.
  test('a draft offers 公開 first and 保存, with 削除 enabled', () => {
    expect(footprintsFootFor('draft')).toEqual({
      actions: [
        { action: 'publish', label: '公開' },
        { action: 'save', label: '保存' },
      ],
      note: null,
      deleteDisabled: false,
      deleteReason: null,
    });
  });

  // A row left `review` by a database the migration has not reached yet is still a draft.
  test('anything not published is offered what a draft is', () => {
    expect(footprintsFootFor('review')).toEqual(footprintsFootFor('draft'));
  });

  // 1a and 6-9: the save reaches the public site, and 削除 says why it cannot be pressed.
  test('a published event offers 保存 first and 非公開に戻す, with 削除 disabled and why', () => {
    expect(footprintsFootFor('published')).toEqual({
      actions: [
        { action: 'save', label: '保存' },
        { action: 'withdraw', label: '非公開に戻す' },
      ],
      note: '保存すると、すぐ本番に出ます',
      deleteDisabled: true,
      deleteReason: '公開中は削除できません。先に「非公開に戻す」を押してください。',
    });
  });
});
