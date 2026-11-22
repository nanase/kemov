import { isShortOfSources, markLabel, shortfallMessage } from '@/admin/lib/footprints-sources';

const WHITELIST = ['https://x.com/KEMOVP_staff'];

function event(...urls: string[]) {
  return { sources: urls.map((url) => ({ url, title: null })) };
}

describe('markLabel', () => {
  test('names a whitelisted source as such', () => {
    expect(markLabel({ kind: 'whitelist' })).toEqual('ホワイトリスト');
  });

  test('names another source by its host, and a second one on it as the same site', () => {
    expect(markLabel({ kind: 'host', host: 'youtube.com', sameSite: false })).toEqual('youtube.com');
    expect(markLabel({ kind: 'host', host: 'youtube.com', sameSite: true })).toEqual('youtube.com（同じサイト）');
  });

  test('has no label for a URL that names no host', () => {
    expect(markLabel({ kind: 'none' })).toBeNull();
  });
});

describe('shortfallMessage', () => {
  // #277's decision 2a, word for word.
  test('names the one host the sources are on', () => {
    expect(shortfallMessage('youtube.com')).toEqual(
      'ホワイトリストに載った出典を 1 つ足すか、別のサイトの出典を足してください。いまは youtube.com の出典しかありません。足りないまま公開すると、年表に「出典の確認待ち」と出ます。',
    );
  });

  test('says there is no source when there is none', () => {
    expect(shortfallMessage(null)).toEqual(
      'ホワイトリストに載った出典を 1 つ足すか、別のサイトの出典を足してください。いまは出典がありません。足りないまま公開すると、年表に「出典の確認待ち」と出ます。',
    );
  });
});

describe('isShortOfSources', () => {
  test('is true for sources that are not enough', () => {
    expect(isShortOfSources(event('https://www.youtube.com/watch?v=a'), WHITELIST)).toEqual(true);
    expect(isShortOfSources(event(), WHITELIST)).toEqual(true);
  });

  test('is false for sources that are enough', () => {
    expect(isShortOfSources(event('https://x.com/KEMOVP_staff/status/1'), WHITELIST)).toEqual(false);
  });

  // A list that could not be read says nothing about any row.
  test('is false while the whitelist is unknown', () => {
    expect(isShortOfSources(event(), null)).toEqual(false);
  });
});
