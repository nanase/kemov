import { parseQuery } from '@/lib/genet/musicSearch';
import { creditText, escapeHtml, markdownHtml, tuneOccurrences } from '@/lib/genet/musicSong';

describe('escapeHtml', () => {
  test('the five characters HTML reads are escaped', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
  });
});

describe('markdownHtml', () => {
  test('nothing to draw is an empty string', () => {
    expect(markdownHtml(null, [])).toBe('');
    expect(markdownHtml('', [])).toBe('');
  });

  test('text is escaped and a newline is a line break', () => {
    expect(markdownHtml('<b>\n二行目', [])).toBe('&lt;b&gt;<br>二行目');
  });

  test('a link opens its expanded address in a new tab', () => {
    expect(markdownHtml('[ボレロ](wiki:ボレロ)', [])).toBe(
      '<a href="https://ja.wikipedia.org/wiki/ボレロ" target="_blank" rel="noopener">ボレロ</a>',
    );
  });

  test('a link with no scheme the page reads is its label alone', () => {
    expect(markdownHtml('[どこか](ftp://example.com)', [])).toBe('どこか');
  });

  test('what the search asks for is marked', () => {
    expect(markdownHtml('くるみ割り人形', parseQuery('くるみ'))).toBe('<mark>くるみ</mark>割り人形');
  });

  test('a time link has no button unless the caller wants them', () => {
    expect(markdownHtml('[演奏](yt:abc?t=65)', [])).not.toContain('<button');
  });

  test('a time link is followed by a button that plays from its second', () => {
    const html = markdownHtml('[演奏](yt:abc?t=65)', [], { playing: null });

    expect(html).toContain('data-vid="abc"');
    expect(html).toContain('data-at="65"');
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain('>1:05</button>');
  });

  test('the button is pressed while it is what plays', () => {
    expect(markdownHtml('[演奏](yt:abc?t=65)', [], { playing: { videoId: 'abc', seconds: 65 } })).toContain(
      'aria-pressed="true"',
    );
    expect(markdownHtml('[演奏](yt:abc?t=65)', [], { playing: { videoId: 'abc', seconds: 0 } })).toContain(
      'aria-pressed="false"',
    );
  });
});

describe('creditText', () => {
  const people = [
    { person_id: 1, name: 'チャイコフスキー', link: null },
    { person_id: 2, name: 'R&amp;B', link: null },
  ];

  test("each person's name, with their note in brackets, joined", () => {
    expect(
      creditText(
        [
          { person_id: 1, credited_as: null, note: null },
          { person_id: 2, credited_as: null, note: '編曲' },
        ],
        people,
      ),
    ).toBe('チャイコフスキー、R&B（編曲）');
  });

  test('a person the list does not have is left blank, not dropped', () => {
    expect(creditText([{ person_id: 9, credited_as: null, note: '不明' }], people)).toBe('（不明）');
  });
});

describe('tuneOccurrences', () => {
  const stream = (videoId: string, tuneIds: number[]) => ({
    video_id: videoId,
    title: videoId,
    short_title: null,
    published_at: '2026-01-01T00:00:00Z',
    performances: tuneIds.map((tune_id) => ({ tune_id })),
  });

  test('the streams that perform the tune, in the order given, the current one marked', () => {
    const streams = [stream('c', [1]), stream('b', [2]), stream('a', [1, 3])];

    expect(tuneOccurrences(streams, 1, 'a').map((o) => [o.stream.video_id, o.isCurrent])).toEqual([
      ['c', false],
      ['a', true],
    ]);
  });

  test('a stream that performs the tune twice is one row', () => {
    expect(tuneOccurrences([stream('a', [1, 1])], 1, null)).toHaveLength(1);
  });
});
