import { JST, UTC, toDateTimeText } from '../../src/lib/dayjs';

describe('JST', () => {
  test('of locale', () => {
    expect(JST().locale()).toBe('ja');
  });

  test('of timezone', () => {
    expect(JST().format('zzz')).toBe('Japan Standard Time');
  });
});

describe('UTC', () => {
  test('of locale', () => {
    expect(UTC().locale()).toBe('en');
  });

  test('of timezone', () => {
    expect(UTC().format('Z')).toBe('+00:00');
  });
});

describe('toDateTimeText', () => {
  test('with date', () => {
    expect(toDateTimeText('2023/08/14')).toBe('2023/08/14 (Mon)');
  });

  test('with date and time', () => {
    expect(toDateTimeText('2023/08/14 14:11')).toBe('2023/08/14 (Mon) 14:11');
  });

  test('with date and time in JST', () => {
    expect(toDateTimeText('2023/08/14 14:11', JST)).toBe('2023/08/14 (月) 14:11');
  });

  test('with date and time in UTC', () => {
    expect(toDateTimeText('2023/08/14 14:11', UTC)).toBe('2023/08/14 (Mon) 14:11');
  });
});
