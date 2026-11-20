import { SAVE_TOAST, sameFields, saveToastFor } from '@/admin/lib/editing';
import { toFormFields, type FootprintsEvent } from '@/admin/lib/footprints';

const EVENT: FootprintsEvent = {
  eventId: 12,
  datePrecision: 'day',
  startDate: '2025-06-14',
  startsAt: null,
  endDate: null,
  kind: 'debut',
  emphasized: false,
  title: 'ケープペンギン デビュー配信',
  place: null,
  supplement: null,
  videoId: null,
  sourcePending: false,
  memo: null,
  status: 'draft',
  createdAt: '2026-11-01T00:00:00Z',
  updatedAt: '2026-11-01T00:00:00Z',
  channelIds: ['UCEcMIuGR8WO2TwL9XIpjKtw'],
  leadChannelIds: ['UCEcMIuGR8WO2TwL9XIpjKtw'],
  sources: [{ url: 'https://example.com/a', title: null }],
};

describe('sameFields', () => {
  it('is true for a fresh copy of the same row', () => {
    expect(sameFields(toFormFields(EVENT), toFormFields(EVENT))).toBe(true);
  });

  it('notices a changed text field', () => {
    expect(sameFields({ ...toFormFields(EVENT), title: '別の題' }, toFormFields(EVENT))).toBe(false);
  });

  it('notices a changed nested value', () => {
    const fields = toFormFields(EVENT);

    fields.sources[0]!.url = 'https://example.com/b';

    expect(sameFields(fields, toFormFields(EVENT))).toBe(false);
  });

  it('notices an added or removed item', () => {
    const added = toFormFields(EVENT);
    const removed = toFormFields(EVENT);

    added.sources.push({ url: '', title: null });
    removed.channelIds = [];

    expect(sameFields(added, toFormFields(EVENT))).toBe(false);
    expect(sameFields(removed, toFormFields(EVENT))).toBe(false);
  });

  it('notices a moved item, since the order is saved', () => {
    expect(sameFields({ ids: ['a', 'b'] }, { ids: ['b', 'a'] })).toBe(false);
  });

  it('takes a text box typed into and erased again as unchanged', () => {
    expect(sameFields({ ...toFormFields(EVENT), place: '' }, toFormFields(EVENT))).toBe(true);
  });

  it('does not take 0 or false for an empty field', () => {
    expect(sameFields({ n: 0 }, { n: null })).toBe(false);
    expect(sameFields({ b: false }, { b: null })).toBe(false);
  });

  it('does not take an empty list for null', () => {
    expect(sameFields({ list: [] }, { list: null })).toBe(false);
  });
});

describe('saveToastFor', () => {
  it('says a draft was saved for a row that is not public', () => {
    expect(saveToastFor('draft')).toBe('下書きを保存しました');
    expect(saveToastFor('review')).toBe('下書きを保存しました');
  });

  // Until #281, saving a published row does not reach the public site.
  it('does not say a published row reached the public site', () => {
    expect(saveToastFor('published')).toBe('保存しました');
    expect(saveToastFor('published')).not.toBe(SAVE_TOAST.savePublished);
  });
});
