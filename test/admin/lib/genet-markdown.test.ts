import { clock, insertAt, mdSnippet, ytParts } from '@/admin/lib/genet-markdown';

describe('mdSnippet', () => {
  test('wiki/wikien/yt get a scheme prefix', () => {
    expect(mdSnippet('wiki', 'Ado', 'Ado')).toEqual('[Ado](wiki:Ado)');
    expect(mdSnippet('wikien', 'Ado', 'Ado')).toEqual('[Ado](wikien:Ado)');
    expect(mdSnippet('yt', '歌唱', 'abcdefghijk?t=90')).toEqual('[歌唱](yt:abcdefghijk?t=90)');
  });

  test('url is written as-is, with no scheme prefix', () => {
    expect(mdSnippet('url', 'IMSLP', 'https://imslp.org/wiki/x')).toEqual('[IMSLP](https://imslp.org/wiki/x)');
  });
});

describe('insertAt', () => {
  test('splices the snippet into the selection, leaving the cursor after it', () => {
    expect(insertAt('曲名です', 2, 2, '[記号](wiki:x)')).toEqual({
      text: '曲名[記号](wiki:x)です',
      cursor: 2 + '[記号](wiki:x)'.length,
    });
  });

  test('replaces a non-empty selection rather than only inserting at a point', () => {
    expect(insertAt('abcdef', 1, 4, 'XY')).toEqual({ text: 'aXYef', cursor: 3 });
  });
});

describe('clock', () => {
  test.each([
    [0, '0:00'],
    [59, '0:59'],
    [90, '1:30'],
    [3599, '59:59'],
    [3600, '1:00:00'],
    [7325, '2:02:05'],
  ])('formats %s seconds as %s', (seconds, expected) => {
    expect(clock(seconds)).toEqual(expected);
  });
});

describe('ytParts', () => {
  test('splits a bare video id with no offset', () => {
    expect(ytParts('abcdefghijk')).toEqual({ videoId: 'abcdefghijk', seconds: 0 });
  });

  test('splits a video id with a ?t= offset', () => {
    expect(ytParts('abcdefghijk?t=90')).toEqual({ videoId: 'abcdefghijk', seconds: 90 });
  });
});
