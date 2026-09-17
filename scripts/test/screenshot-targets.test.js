import { parseTargets } from '../screenshot-targets.js';

describe('parseTargets', () => {
  test('parses one name=url pair', () => {
    expect(parseTargets(['stats=http://localhost:4173/stats/'])).toEqual([
      { name: 'stats', url: 'http://localhost:4173/stats/' },
    ]);
  });

  test('parses several pairs', () => {
    expect(
      parseTargets(['stats=http://localhost:4173/stats/', 'ranking=http://localhost:4173/stats/ranking/']),
    ).toEqual([
      { name: 'stats', url: 'http://localhost:4173/stats/' },
      { name: 'ranking', url: 'http://localhost:4173/stats/ranking/' },
    ]);
  });

  test('keeps everything after the first "=" as the url', () => {
    expect(parseTargets(['detail=http://localhost:4173/stats/detail/#/UCxxx?a=b'])).toEqual([
      { name: 'detail', url: 'http://localhost:4173/stats/detail/#/UCxxx?a=b' },
    ]);
  });

  test('rejects an argument with no "="', () => {
    expect(() => parseTargets(['stats'])).toThrow('expected <name>=<url>');
  });

  test('rejects an empty name', () => {
    expect(() => parseTargets(['=http://localhost/'])).toThrow('expected <name>=<url>');
  });

  test.each(['a/b', 'a\\b', '.', '..'])('rejects a name of "%s"', (name) => {
    expect(() => parseTargets([`${name}=http://localhost/`])).toThrow('name must be a single filename');
  });

  test('rejects an empty url', () => {
    expect(() => parseTargets(['stats='])).toThrow('url must be an absolute URL');
  });

  test('rejects a relative url', () => {
    expect(() => parseTargets(['stats=/stats/'])).toThrow('url must be an absolute URL');
  });

  test('rejects a duplicate name before any target is returned', () => {
    expect(() => parseTargets(['stats=http://localhost/a', 'stats=http://localhost/b'])).toThrow(
      'duplicate name "stats"',
    );
  });
});
