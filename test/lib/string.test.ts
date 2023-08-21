import { escapeRegex } from '../../src/lib/string';

describe('escapeRegex', () => {
  test('includes regex special chars', () => {
    expect(escapeRegex('/-^$*+?.()|[]{}')).toEqual('\\/\\-\\^\\$\\*\\+\\?\\.\\(\\)\\|\\[\\]\\{\\}');
  });

  test('includes no regex special chars', () => {
    expect(escapeRegex('hello world')).toEqual('hello world');
  });

  test('empty text', () => {
    expect(escapeRegex('')).toEqual('');
  });
});
