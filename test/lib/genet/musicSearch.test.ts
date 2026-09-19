import {
  computeResults,
  isFiltering,
  normalize,
  parseQuery,
  prepareStreams,
  snippet,
  yearOf,
  type Filters,
} from '@/lib/genet/musicSearch';
import type { GenetMusicData, GenetPerson, GenetStream, GenetTune } from '@/lib/genet/musicTypes';

function tune(id: number, title: string, overrides: Partial<GenetTune> = {}): GenetTune {
  return {
    tune_id: id,
    title,
    original_title: null,
    subtunes: [],
    attributes: [],
    videos: [],
    scores: [],
    ...overrides,
  };
}

function stream(videoId: string, title: string, overrides: Partial<GenetStream> = {}): GenetStream {
  return {
    video_id: videoId,
    platform: 'youtube',
    url: null,
    video_type: 'live',
    title,
    short_title: null,
    published_at: '2025-02-01T10:00:00Z',
    categories: [],
    keywords: [],
    performances: [],
    ...overrides,
  };
}

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

describe('yearOf', () => {
  test('reads the JST calendar year, which can roll past a UTC year boundary', () => {
    // 2025-12-31T15:30:00Z is 2026-01-01 00:30 JST.
    expect(yearOf('2025-12-31T15:30:00Z')).toEqual(2026);
  });
});

describe('isFiltering', () => {
  test('false when every filter is unset', () => {
    expect(isFiltering({ terms: [], form: null, year: null, category: null })).toBe(false);
  });

  test('true when any one filter is set', () => {
    expect(isFiltering({ terms: [], form: 'sing', year: null, category: null })).toBe(true);
    expect(isFiltering({ terms: [], form: null, year: 2025, category: null })).toBe(true);
    expect(isFiltering({ terms: [], form: null, year: null, category: 'BGM' })).toBe(true);
  });
});

describe('computeResults', () => {
  const PEOPLE: GenetPerson[] = [{ person_id: 1, name: 'ベートーヴェン', link: 'wiki:x' }];

  function dataset(): GenetMusicData {
    // Two streams. Stream A performs both tune 1 ("カノン", composer text
    // mentions "パッヘルベル") and tune 2 ("月光", credited to person 1 via
    // structured people - name "ベートーヴェン" only reachable through the
    // person table, not the tune's own text). Stream B performs only tune 3
    // ("エリーゼのために"), sung, in 2024.
    const t1 = tune(1, 'カノン', { attributes: [{ name: '作曲', text: 'パッヘルベル', people: [] }] });
    const t2 = tune(2, '月光', {
      attributes: [{ name: '作曲', text: null, people: [{ person_id: 1, credited_as: null, note: null }] }],
    });
    const t3 = tune(3, 'エリーゼのために');

    const a = stream('vidA', '演奏配信A', {
      published_at: '2025-06-01T10:00:00Z',
      categories: ['演奏配信'],
      performances: [
        { tune_id: 1, description: null, scenes: [{ style: 'play', video_id: 'vidA', start_seconds: 10 }] },
        { tune_id: 2, description: null, scenes: [{ style: 'play', video_id: 'vidA', start_seconds: 200 }] },
      ],
    });
    const b = stream('vidB', '歌枠配信B', {
      published_at: '2024-03-01T10:00:00Z',
      categories: ['歌枠配信'],
      performances: [
        { tune_id: 3, description: null, scenes: [{ style: 'sing', video_id: 'vidB', start_seconds: 5 }] },
      ],
    });

    return { published_at: '2026-01-01T00:00:00Z', streams: [a, b], tunes: [t1, t2, t3], people: PEOPLE };
  }

  test('with no filters, every stream matches and every tune is counted once', () => {
    const prepared = prepareStreams(dataset());
    const filters: Filters = { terms: [], form: null, year: null, category: null };
    const result = computeResults(prepared, filters);

    expect(result.streams.map((s) => s.stream.video_id)).toEqual(['vidA', 'vidB']);
    expect(result.songIds).toEqual(new Set([1, 2, 3]));
  });

  test('searching a tune-level term (composer name) matches only the stream performing that tune', () => {
    const prepared = prepareStreams(dataset());
    const filters: Filters = { terms: parseQuery('パッヘルベル'), form: null, year: null, category: null };
    const result = computeResults(prepared, filters);

    expect(result.streams.map((s) => s.stream.video_id)).toEqual(['vidA']);
    expect(result.songIds).toEqual(new Set([1]));
  });

  test('a person credited via the structured people table is searchable by name', () => {
    const prepared = prepareStreams(dataset());
    const filters: Filters = { terms: parseQuery('ベートーヴェン'), form: null, year: null, category: null };
    const result = computeResults(prepared, filters);

    expect(result.songIds).toEqual(new Set([2]));
  });

  test('per-song-only matching: two terms that each hit a different tune in the same stream do not pass it', () => {
    // "パッヘルベル" only hits tune 1's text; "月光" only hits tune 2's own title.
    // Neither tune alone satisfies both terms, so stream A must not match -
    // this is exactly the old search.ts leakage this page's search must not have.
    const prepared = prepareStreams(dataset());
    const filters: Filters = { terms: parseQuery('パッヘルベル 月光'), form: null, year: null, category: null };
    const result = computeResults(prepared, filters);

    expect(result.streams).toEqual([]);
  });

  test('a term that matches the stream text lets any of its tunes through', () => {
    // "演奏配信" is stream A's own category text, not any tune's own text -
    // every one of stream A's tunes should pass via the shared stream text.
    const prepared = prepareStreams(dataset());
    const filters: Filters = { terms: parseQuery('演奏配信'), form: null, year: null, category: null };
    const result = computeResults(prepared, filters);

    expect(result.matchedTuneIdsByStream.get('vidA')).toEqual(new Set([1, 2]));
    // Neither tune's own text was hit, so the ".hits" summary line is empty for this stream.
    expect(result.hitTuneIdsByStream.has('vidA')).toBe(false);
  });

  test('form filters to performances with a matching scene style', () => {
    const prepared = prepareStreams(dataset());
    const filters: Filters = { terms: [], form: 'sing', year: null, category: null };
    const result = computeResults(prepared, filters);

    expect(result.streams.map((s) => s.stream.video_id)).toEqual(['vidB']);
  });

  test('year filters by JST calendar year', () => {
    const prepared = prepareStreams(dataset());
    const filters: Filters = { terms: [], form: null, year: 2024, category: null };
    const result = computeResults(prepared, filters);

    expect(result.streams.map((s) => s.stream.video_id)).toEqual(['vidB']);
  });

  test('category filters to streams carrying that category', () => {
    const prepared = prepareStreams(dataset());
    const filters: Filters = { terms: [], form: null, year: null, category: '歌枠配信' };
    const result = computeResults(prepared, filters);

    expect(result.streams.map((s) => s.stream.video_id)).toEqual(['vidB']);
  });

  test('filters combine (AND)', () => {
    const prepared = prepareStreams(dataset());
    const filters: Filters = { terms: [], form: 'play', year: 2025, category: '演奏配信' };
    const result = computeResults(prepared, filters);

    expect(result.streams.map((s) => s.stream.video_id)).toEqual(['vidA']);
  });
});

describe('snippet', () => {
  test('returns the text unchanged when there are no terms', () => {
    expect(snippet('ここにある四季 冬の楽曲について長い説明が続きます', [])).toEqual(
      'ここにある四季 冬の楽曲について長い説明が続きます',
    );
  });

  test('trims up to a late match so it stays visible', () => {
    const long = 'あ'.repeat(20) + 'カノン';
    const terms = parseQuery('カノン');

    expect(snippet(long, terms)).toEqual(`…${long.slice(20 - 6)}`);
  });

  test('leaves an early match untrimmed', () => {
    const text = 'カノンについての短い説明';
    const terms = parseQuery('カノン');

    expect(snippet(text, terms)).toEqual(text);
  });

  // `at - 6` lands exactly on 🎻's own low surrogate here - a plain
  // text.slice() there would split the violin emoji into a lone, unpaired
  // surrogate rather than keep it whole.
  test('does not split a surrogate pair the trim point lands inside', () => {
    const text = `${'あ'.repeat(10)}🎻${'あ'.repeat(5)}カノン`;
    const terms = parseQuery('カノン');

    expect(snippet(text, terms)).toEqual(`…🎻${'あ'.repeat(5)}カノン`);
  });
});
