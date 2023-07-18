import { withCommas } from '../../src/lib/number';

describe('withCommas', () => {
  test('4 digits', () => {
    expect(withCommas(1000)).toBe('1,000');
  });

  test('7 digits', () => {
    expect(withCommas(1000000)).toBe('1,000,000');
  });

  test('3 digits', () => {
    expect(withCommas(100)).toBe('100');
  });

  test('3 digits with minus', () => {
    expect(withCommas(-100)).toBe('-100');
  });

  test('4 digits with minus', () => {
    expect(withCommas(-1000)).toBe('-1,000');
  });

  test('3 digits with fraction', () => {
    expect(withCommas(100.5)).toBe('100.5');
  });

  test('4 digits with fraction', () => {
    expect(withCommas(1000.5)).toBe('1,000.5');
  });

  test('3 digits with fraction and minus', () => {
    expect(withCommas(-100.5)).toBe('-100.5');
  });

  test('4 digits with fraction and minus', () => {
    expect(withCommas(-1000.5)).toBe('-1,000.5');
  });
});
