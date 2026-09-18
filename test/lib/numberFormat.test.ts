import { DASH, formatCount } from '@/lib/numberFormat';

/** How the site writes a number it measured, on every page that draws one. */

describe('formatCount', () => {
  test('a count is grouped, and an absent one is a dash', () => {
    expect(formatCount(1234567)).toEqual('1,234,567');
    expect(formatCount(null)).toEqual(DASH);
    expect(formatCount(2.51, 1)).toEqual('2.5');
  });
});
