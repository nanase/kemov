import { countText } from '@/admin/lib/list-count';

describe('countText', () => {
  it('gives the count alone when nothing is filtered', () => {
    expect(countText(40, 40, false)).toBe('40 件');
  });

  it('gives the count out of the whole list while filtered', () => {
    expect(countText(12, 40, true)).toBe('12 / 40 件');
  });

  it('keeps the whole list beside it when the filter happens to show every row', () => {
    expect(countText(40, 40, true)).toBe('40 / 40 件');
  });

  it('gives the count alone while the whole list is unknown', () => {
    expect(countText(12, null, true)).toBe('12 件');
  });

  it('counts an empty list', () => {
    expect(countText(0, 40, true)).toBe('0 / 40 件');
    expect(countText(0, null, false)).toBe('0 件');
  });
});
