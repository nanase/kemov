import { expandLink, lexMarkdown, parseYoutubeHref, plainText } from '@/lib/genet/musicMarkdown';

describe('lexMarkdown', () => {
  test('a plain sentence is one text token, entity-decoded', () => {
    expect(lexMarkdown('ジェネット&amp;仲間たち')).toEqual([{ type: 'text', text: 'ジェネット&仲間たち' }]);
  });

  test('a link becomes its own token, with the label read as plain text', () => {
    expect(lexMarkdown('[Ado](wiki:Ado)の楽曲')).toEqual([
      { type: 'link', text: 'Ado', href: 'wiki:Ado' },
      { type: 'text', text: 'の楽曲' },
    ]);
  });

  test('a href is entity-decoded once, like the text, so the renderer does not escape it twice', () => {
    expect(lexMarkdown('[検索](https://example.com/?a=1&amp;b=2)')).toEqual([
      { type: 'link', text: '検索', href: 'https://example.com/?a=1&b=2' },
    ]);
  });

  test('a newline becomes its own token', () => {
    expect(lexMarkdown('一行目\n二行目')).toEqual([
      { type: 'text', text: '一行目' },
      { type: 'br' },
      { type: 'text', text: '二行目' },
    ]);
  });

  test('a backslash escapes the next character literally', () => {
    expect(lexMarkdown('\\[not a link\\]')).toEqual([{ type: 'text', text: '[not a link]' }]);
  });

  test('a href containing balanced parens is read whole', () => {
    const tokens = lexMarkdown('[曲](https://imslp.org/wiki/Symphony_No.9%2C_Op.125_(Beethoven))');

    expect(tokens).toEqual([
      { type: 'link', text: '曲', href: 'https://imslp.org/wiki/Symphony_No.9%2C_Op.125_(Beethoven)' },
    ]);
  });
});

describe('plainText', () => {
  test('strips a link down to its label', () => {
    expect(plainText('[Ado](wiki:Ado)の楽曲')).toEqual('Adoの楽曲');
  });
});

describe('expandLink', () => {
  test.each([
    ['wiki:Ado', 'https://ja.wikipedia.org/wiki/Ado'],
    ['wikien:Ado', 'https://en.wikipedia.org/wiki/Ado'],
    ['yt:abcdefghijk', 'https://www.youtube.com/watch?v=abcdefghijk'],
    ['yt:abcdefghijk?t=90', 'https://www.youtube.com/watch?v=abcdefghijk&t=90'],
    ['https://imslp.org/wiki/x', 'https://imslp.org/wiki/x'],
  ])('expands %s', (href, expected) => {
    expect(expandLink(href)).toEqual(expected);
  });

  test('answers null for a scheme it does not know', () => {
    expect(expandLink('mailto:x@example.com')).toBeNull();
  });
});

describe('parseYoutubeHref', () => {
  test('reads a video id with no offset as 0 seconds', () => {
    expect(parseYoutubeHref('yt:abcdefghijk')).toEqual({ videoId: 'abcdefghijk', seconds: 0 });
  });

  test('reads a video id with an offset', () => {
    expect(parseYoutubeHref('yt:abcdefghijk?t=90')).toEqual({ videoId: 'abcdefghijk', seconds: 90 });
  });

  test('answers null when anything other than ?t=<seconds> follows the id', () => {
    expect(parseYoutubeHref('yt:abcdefghijk?list=x')).toBeNull();
    expect(parseYoutubeHref('yt:abcdefghijk?t=90&x=1')).toBeNull();
  });

  test('answers null for a non-yt href', () => {
    expect(parseYoutubeHref('wiki:Ado')).toBeNull();
  });
});
