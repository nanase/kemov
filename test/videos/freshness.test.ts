import { freshnessOf } from '@/videos/freshness';

describe('freshnessOf', () => {
  test.each([
    [0, 'ok'],
    [600, 'ok'],
    [601, 'warn'],
    [1800, 'warn'],
    [1801, 'bad'],
    [7200, 'bad'],
  ] as const)('%i seconds old is %s', (seconds, expected) => {
    expect(freshnessOf(seconds)).toEqual(expected);
  });
});
