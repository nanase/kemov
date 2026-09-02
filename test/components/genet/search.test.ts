import { StreamingSearch } from '@/components/genet/search';
import type { Streaming } from '@/type/genet/music';

function streaming(overrides: Partial<Streaming> = {}): Streaming {
  return {
    video: { id: 'id', publishedAt: '2024-01-01', type: 'live' },
    name: '無題',
    tunes: [{ title: '無題の曲' }],
    ...overrides,
  };
}

const search = new StreamingSearch();

describe('StreamingSearch', () => {
  describe('fields searched', () => {
    test('name', () => {
      const items = [streaming({ name: 'ジャズの夕べ' }), streaming({ name: 'クラシック特集' })];

      expect(search.search(items, 'ジャズ')).toEqual([items[0]]);
    });

    test('shortname replaces name, it does not add to it', () => {
      const items = [streaming({ name: 'ジャズの夕べ', shortname: 'ジャズ会' })];

      expect(search.search(items, 'ジャズ会')).toHaveLength(1);
      expect(search.search(items, '夕べ')).toHaveLength(0);
    });

    test('categories', () => {
      const items = [streaming({ categories: ['歌枠', '雑談'] })];

      expect(search.search(items, '歌枠')).toHaveLength(1);
    });

    test('tune title, original title, subtunes and description', () => {
      const items = [
        streaming({
          tunes: [
            {
              title: '曲名',
              originalTitle: '原題',
              subtunes: ['メドレー曲'],
              description: '説明文',
            },
          ],
        }),
      ];

      for (const query of ['曲名', '原題', 'メドレー曲', '説明文']) {
        expect(search.search(items, query), query).toHaveLength(1);
      }
    });

    test('tune attribute text', () => {
      const items = [streaming({ tunes: [{ title: '曲名', attributes: [{ text: 'アカペラ' }] }] })];

      expect(search.search(items, 'アカペラ')).toHaveLength(1);
    });

    test('a field the search does not cover', () => {
      const items = [streaming({ notes: ['備考'] })];

      expect(search.search(items, '備考')).toHaveLength(0);
    });
  });

  describe('query handling', () => {
    test('is case insensitive', () => {
      const items = [streaming({ name: 'Jazz Night' })];

      expect(search.search(items, 'jazz')).toHaveLength(1);
      expect(search.search(items, 'JAZZ')).toHaveLength(1);
    });

    test('whitespace separates terms and every term must match', () => {
      const items = [
        streaming({ name: 'ジャズの夕べ', categories: ['歌枠'] }),
        streaming({ name: 'ジャズの朝', categories: ['雑談'] }),
      ];

      expect(search.search(items, 'ジャズ 歌枠')).toEqual([items[0]]);
      expect(search.search(items, 'ジャズ 存在しない')).toHaveLength(0);
    });

    test('an empty query keeps everything', () => {
      const items = [streaming(), streaming()];

      expect(search.search(items, '')).toHaveLength(2);
    });

    test('regex metacharacters are matched literally', () => {
      const items = [streaming({ name: 'A+B (2024)' }), streaming({ name: 'AAAB' })];

      expect(search.search(items, 'A+B')).toEqual([items[0]]);
      expect(search.search(items, '(2024)')).toEqual([items[0]]);
    });
  });

  describe('kana normalisation', () => {
    test('a plain kana query also matches its small-kana spelling', () => {
      const items = [streaming({ name: 'ヴァイオリン' })];

      expect(search.search(items, 'バイオリン')).toHaveLength(1);
    });

    test('and the other way round', () => {
      const items = [streaming({ name: 'バイオリン' })];

      expect(search.search(items, 'ヴァイオリン')).toHaveLength(1);
    });

    test('normalisation does not make unrelated words match', () => {
      const items = [streaming({ name: 'チェロ' })];

      expect(search.search(items, 'バイオリン')).toHaveLength(0);
    });
  });
});
