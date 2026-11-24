import { getJson } from '@/admin/lib/api';
import {
  isShortOfSources,
  markLabel,
  shortfallMessage,
  shortWhateverTheWhitelist,
  useWhitelist,
} from '@/admin/lib/footprints-sources';

vi.mock('@/admin/lib/api', () => ({ getJson: vi.fn() }));

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

describe('useWhitelist', () => {
  test('is neither known nor failed while it is on its way', () => {
    const { whitelist, failed } = useWhitelist();

    expect(whitelist.value).toBeNull();
    expect(failed.value).toBe(false);
  });

  test('holds the prefixes once read', async () => {
    vi.mocked(getJson).mockResolvedValueOnce({ sourceWhitelist: [{ prefix: WHITELIST[0] }] });
    const { whitelist, failed, load } = useWhitelist();

    await load();

    expect(whitelist.value).toEqual(WHITELIST);
    expect(failed.value).toBe(false);
  });

  test('says it failed when it could not be read, and clears that on a later read', async () => {
    vi.mocked(getJson).mockRejectedValueOnce(new Error('unreachable'));
    const { whitelist, failed, load } = useWhitelist();

    await load();

    expect(whitelist.value).toBeNull();
    expect(failed.value).toBe(true);

    vi.mocked(getJson).mockResolvedValueOnce({ sourceWhitelist: [{ prefix: WHITELIST[0] }] });
    await load();

    expect(whitelist.value).toEqual(WHITELIST);
    expect(failed.value).toBe(false);
  });
});

describe('shortWhateverTheWhitelist', () => {
  test('is true with no source, or none a save accepts', () => {
    expect(shortWhateverTheWhitelist(event())).toBe(true);
    expect(shortWhateverTheWhitelist(event('', 'http://example.com/a'))).toBe(true);
  });

  // Whether one source is enough depends on the whitelist, which is not known here.
  test('is false once a source a save accepts is there', () => {
    expect(shortWhateverTheWhitelist(event('https://www.youtube.com/watch?v=a'))).toBe(false);
  });
});
