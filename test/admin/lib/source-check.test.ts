import { judgeSources, sourcesEnough } from '@/admin/lib/source-check';

const WHITELIST = ['https://x.com/KEMOVP_staff', 'https://kemov-project.com/'];

describe('sourcesEnough', () => {
  test('is true for one source on the whitelist', () => {
    expect(sourcesEnough(['https://x.com/KEMOVP_staff/status/1'], WHITELIST)).toEqual(true);
  });

  test('is true for two sources on different hosts, neither on the whitelist', () => {
    expect(
      sourcesEnough(['https://www.youtube.com/watch?v=a', 'https://ameblo.jp/someone/entry-1'], WHITELIST),
    ).toEqual(true);
  });

  test('is false for sources on one host that is not on the whitelist', () => {
    expect(sourcesEnough(['https://www.youtube.com/watch?v=a', 'https://youtu.be/b'], WHITELIST)).toEqual(false);
  });

  test('is false for no source at all', () => {
    expect(sourcesEnough([], WHITELIST)).toEqual(false);
  });
});

describe('judgeSources', () => {
  test('marks a whitelisted source as such, and another by its host', () => {
    expect(
      judgeSources(['https://x.com/KEMOVP_staff/status/1', 'https://www.youtube.com/watch?v=a'], WHITELIST),
    ).toEqual({
      enough: true,
      marks: [{ kind: 'whitelist' }, { kind: 'host', host: 'youtube.com', sameSite: false }],
      onlyHost: null,
    });
  });

  // youtu.be is counted as youtube.com, so it adds no second host.
  test('marks a second source on a host already counted as the same site', () => {
    expect(judgeSources(['https://www.youtube.com/watch?v=a', 'https://youtu.be/b'], WHITELIST)).toEqual({
      enough: false,
      marks: [
        { kind: 'host', host: 'youtube.com', sameSite: false },
        { kind: 'host', host: 'youtube.com', sameSite: true },
      ],
      onlyHost: 'youtube.com',
    });
  });

  // x.com/KEMOVP_staff is on the whitelist and another account on x.com is not.
  test('counts the host of a whitelisted source as already seen', () => {
    expect(
      judgeSources(['https://x.com/KEMOVP_staff/status/1', 'https://x.com/someone/status/2'], WHITELIST).marks,
    ).toEqual([{ kind: 'whitelist' }, { kind: 'host', host: 'x.com', sameSite: true }]);
  });

  test('gives no mark to a URL that names no host, and counts it for nothing', () => {
    expect(judgeSources(['', 'https://', 'mailto:a@example.com'], WHITELIST)).toEqual({
      enough: false,
      marks: [{ kind: 'none' }, { kind: 'none' }, { kind: 'none' }],
      onlyHost: null,
    });
  });

  // Only an https URL can be saved, so the screen does not count one that is not.
  test('gives no mark to a URL that is not https, and counts it for nothing', () => {
    expect(judgeSources(['https://www.youtube.com/watch?v=a', 'http://ameblo.jp/someone/entry-1'], WHITELIST)).toEqual({
      enough: false,
      marks: [{ kind: 'host', host: 'youtube.com', sameSite: false }, { kind: 'none' }],
      onlyHost: 'youtube.com',
    });
    expect(sourcesEnough(['https://www.youtube.com/watch?v=a', 'mailto:a@example.com'], WHITELIST)).toEqual(false);
  });

  // The same rule a save refuses such a URL by (sourceUrlProblem), so a milestone's judgement and this agree.
  test('counts nothing for a URL carrying a user name', () => {
    expect(
      sourcesEnough(['https://www.youtube.com/watch?v=a', 'https://someone@ameblo.jp/entry-1'], WHITELIST),
    ).toEqual(false);
  });

  test('has no host to name for no source at all', () => {
    expect(judgeSources([], WHITELIST)).toEqual({ enough: false, marks: [], onlyHost: null });
  });

  test('agrees with sourcesEnough', () => {
    const cases = [
      ['https://x.com/KEMOVP_staff/status/1'],
      ['https://www.youtube.com/watch?v=a', 'https://ameblo.jp/someone/entry-1'],
      ['https://www.youtube.com/watch?v=a'],
      [],
    ];

    for (const urls of cases) expect(judgeSources(urls, WHITELIST).enough).toEqual(sourcesEnough(urls, WHITELIST));
  });
});
