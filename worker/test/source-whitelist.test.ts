import { isWhitelistedSource } from '../src/lib/source-whitelist';

describe('isWhitelistedSource', () => {
  test.each([
    'https://kemov-project.com/news/123',
    'https://www.kemov-project.com/news/123',
    'https://kemono-friends.jp/3301',
    'https://x.com/KEMOVP_staff/status/123',
    'https://kemovproject.stores.jp/items/1',
    'https://prtimes.jp/main/html/rd/p/000000218.000050441.html',
    'https://kyodonewsprwire.jp/release/202403067590',
    'https://shop.joysound.com/campaign/kemov-project/',
    'https://vtube.tokyo/events/1',
    'https://wikiwiki.jp/kemo_v/some-page',
    'https://virtualyoutuber.fandom.com/wiki/KemoV',
    // A prefix with no trailing slash (an account handle, not a domain),
    // matched exactly and with a query string or a fragment after it.
    'https://x.com/KEMOVP_staff',
    'https://x.com/KEMOVP_staff?ref=share',
    'https://x.com/KEMOVP_staff#pinned',
  ])('accepts %s', (url) => {
    expect(isWhitelistedSource(url)).toEqual(true);
  });

  test.each([
    // Not in the decision: an individual's blog and a source the project
    // owner explicitly excluded, both named in #141.
    'https://kemochan.com/2026/09/15/post',
    'https://ameblo.jp/some-member/entry-1.html',
    // A prefix elsewhere on the same host is not the same source.
    'https://joysound.com/web/search/title/24171',
    'https://dic.nicovideo.jp/a/some-other-article',
    // Same prefix text, but the account handle it names is not this one.
    'https://x.com/KEMOVP_staff_fake',
  ])('refuses %s', (url) => {
    expect(isWhitelistedSource(url)).toEqual(false);
  });
});
