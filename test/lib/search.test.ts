import { normalize, parseQuery } from '@/lib/search';

/**
 * The matching rules every search on the site shares. What matters is that a
 * word finds what a reader would call the same word, and that marking a hit
 * never breaks the text around it.
 */

describe('normalize', () => {
  test('folds full-width digits and katakana width via NFKC', () => {
    expect(normalize('１２３')).toEqual('123');
  });

  test('folds katakana to hiragana and lower-cases', () => {
    expect(normalize('カノンABC')).toEqual('かのんabc');
  });
});

describe('parseQuery term matching', () => {
  test('ヴィヴァルディ and ビバルディ match each other', () => {
    const [term] = parseQuery('ビバルディ');

    expect(term!.test(normalize('ヴィヴァルディの四季'))).toBe(true);
  });

  test('a plain word with no kana variants matches literally', () => {
    const [term] = parseQuery('カノン');

    expect(term!.test(normalize('パッヘルベルのカノン'))).toBe(true);
    expect(term!.test(normalize('別の曲'))).toBe(false);
  });

  test('an empty query has no terms', () => {
    expect(parseQuery('')).toEqual([]);
    expect(parseQuery('   ')).toEqual([]);
  });

  test('multiple words become multiple terms', () => {
    expect(parseQuery('四季 冬')).toHaveLength(2);
  });
});
