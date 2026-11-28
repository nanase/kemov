import { clashesKept, fieldsAfterSave, fieldsOnReload, removePath, sameFields, writeBody } from '@/admin/lib/editing';
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
  memo: null,
  status: 'draft',
  createdAt: '2026-11-01T00:00:00Z',
  updatedAt: '2026-11-01T00:00:00Z',
  version: 1,
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

describe('fieldsOnReload', () => {
  const before = { title: 'もとの題', supplement: null as string | null, sources: [{ url: 'https://a', title: null }] };

  it('keeps what is typed, and takes the rest as saved now', () => {
    const current = { ...before, title: '打った題' };
    const after = { ...before, supplement: '別の画面の補足' };

    expect(fieldsOnReload(current, before, after)).toEqual({
      fields: { title: '打った題', supplement: '別の画面の補足', sources: before.sources },
      clashes: [],
    });
  });

  it('names a field both screens changed, keeping what is typed', () => {
    const current = { ...before, title: '打った題' };
    const after = { ...before, title: '別の画面の題' };

    expect(fieldsOnReload(current, before, after)).toEqual({ fields: current, clashes: ['title'] });
  });

  it('does not count a field both screens changed the same way', () => {
    const current = { ...before, title: '同じ題' };
    const after = { ...before, title: '同じ題' };

    expect(fieldsOnReload(current, before, after).clashes).toEqual([]);
  });

  it('takes a list typed into as a whole, and copies it', () => {
    const current = { ...before, sources: [{ url: 'https://b', title: null }] };
    const result = fieldsOnReload(current, before, { ...before, title: '別の画面の題' });

    expect(result.fields.sources).toEqual([{ url: 'https://b', title: null }]);
    expect(result.fields.sources).not.toBe(current.sources);
  });

  it('counts a box typed in and erased again as untouched', () => {
    const current = { ...before, supplement: '' };
    const after = { ...before, supplement: '別の画面の補足' };

    expect(fieldsOnReload(current, before, after)).toEqual({ fields: after, clashes: [] });
  });

  it('is the saved row once nothing is typed', () => {
    const after = { ...before, title: '別の画面の題' };

    expect(fieldsOnReload(before, before, after)).toEqual({ fields: after, clashes: [] });
  });
});

describe("fieldsOnReload with the panel's reactive fields", () => {
  it('copies them, though structuredClone would refuse them', async () => {
    const { reactive } = await import('vue');
    const before = { title: 'もとの題', sources: [{ url: 'https://a', title: null }] };
    const current = reactive({ ...before, sources: [{ url: 'https://b', title: null }] });

    expect(fieldsOnReload(current, before, before).fields).toEqual({ ...before, sources: current.sources });
  });
});

describe('writeBody', () => {
  it('sends the fields with the version of the row they were typed over', () => {
    expect(writeBody({ title: '打った題' }, { version: 7 })).toEqual({ title: '打った題', version: 7 });
  });

  it('leaves the fields as they were', () => {
    const fields = { title: '打った題' };

    writeBody(fields, { version: 7 });

    expect(fields).toEqual({ title: '打った題' });
  });
});

describe('removePath', () => {
  it('puts the version of the row the delete was pressed over in the query', () => {
    expect(removePath('/footprints/events/12', { version: 3 })).toEqual('/footprints/events/12?version=3');
  });
});

describe('fieldsAfterSave', () => {
  const before = { title: 'もとの題', supplement: null as string | null };
  const sent = { title: '送った題', supplement: null as string | null };

  it('takes the row as saved when nothing was typed since it was sent', () => {
    const after = { title: '送った題', supplement: null };

    expect(fieldsAfterSave(sent, before, after, sent)).toEqual({ fields: after, clashes: [] });
  });

  it('keeps what was typed after it was sent', () => {
    const current = { title: '送った題', supplement: '後から打った補足' };
    const after = { title: '送った題（整えた）', supplement: null };

    expect(fieldsAfterSave(current, before, after, sent)).toEqual({
      fields: { title: '送った題（整えた）', supplement: '後から打った補足' },
      clashes: [],
    });
  });

  // Saved 送った題, the read failed, then もとの題 was typed back and a retry was refused.
  it('keeps a field typed back to what the row held before the save', () => {
    const current = { title: 'もとの題', supplement: null };
    const after = { title: '送った題', supplement: '別の画面の補足' };

    expect(fieldsAfterSave(current, before, after, sent)).toEqual({
      fields: { title: 'もとの題', supplement: '別の画面の補足' },
      clashes: [],
    });
  });

  it('names a field another screen changed since it was sent, and typed in since', () => {
    const current = { title: '後から打った題', supplement: null };
    const after = { title: '別の画面の題', supplement: null };

    expect(fieldsAfterSave(current, before, after, sent).clashes).toEqual(['title']);
  });

  // A read after the save failed: the next one is measured against what was sent, not the row before it.
  it('still answers the save when the row arrives a read later', () => {
    const current = { title: '後から打った題', supplement: null };
    const after = { title: '送った題', supplement: null };

    expect(fieldsAfterSave(current, before, after, sent).fields).toEqual(current);
  });

  it('is fieldsOnReload when nothing was saved', () => {
    const current = { title: '打った題', supplement: null };
    const after = { title: '別の画面の題', supplement: null };

    expect(fieldsAfterSave(current, before, after, null)).toEqual(fieldsOnReload(current, before, after));
  });
});

describe('clashesKept', () => {
  const before = { title: 'もとの題', supplement: null as string | null };

  // A clash found, then the row read again with nothing new from another screen.
  it('keeps a clash found before while its field is still typed', () => {
    const current = { title: '打った題', supplement: null };
    const after = { title: '別の画面の題', supplement: null };
    const reloaded = fieldsOnReload(current, after, after);

    expect(reloaded.clashes).toEqual([]);
    expect(clashesKept(['title'], reloaded, after)).toEqual(['title']);
  });

  it('drops a clash once its field reads as the row now does', () => {
    const current = { title: '別の画面の題', supplement: null };
    const after = { title: '別の画面の題', supplement: null };

    expect(clashesKept(['title'], fieldsOnReload(current, after, after), after)).toEqual([]);
  });

  it('adds the clashes the read found, each once', () => {
    const current = { title: '打った題', supplement: '打った補足' };
    const after = { title: '別の画面の題', supplement: '別の画面の補足' };
    const reloaded = fieldsOnReload(current, before, after);

    expect(reloaded.clashes).toEqual(['title', 'supplement']);
    expect(clashesKept(['title'], reloaded, after)).toEqual(['title', 'supplement']);
  });
});
