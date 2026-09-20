import { env } from 'cloudflare:test';

import { hasTwoHosts, isWhitelistedSource, readSourceWhitelist } from '../src/lib/source-whitelist';

// What SOURCE_WHITELIST held when #175 moved it into D1, in its own order.
// Written out here rather than imported: it is the record that migration 0008
// added nothing and dropped nothing, so it must not be able to follow the
// migration if the migration is edited.
const SEEDED = [
  'https://kemov-project.com/',
  'https://www.kemov-project.com/',
  'https://kemono-friends.jp/',
  'https://x.com/KEMOVP_staff',
  'https://twitter.com/KEMOVP_staff',
  'https://kemovproject.stores.jp/',
  'https://prtimes.jp/',
  'https://kyodonewsprwire.jp/',
  'https://shop.joysound.com/',
  'https://vtube.tokyo/',
  'https://wikiwiki.jp/kemo_v/',
  'https://dic.nicovideo.jp/a/%E3%81%91%E3%82%82%E3%81%AE%E3%83%95%E3%83%AC%E3%83%B3%E3%82%BAv%E3%81%B7%E3%82%8D%E3%81%98%E3%81%87%E3%81%8F%E3%81%A8',
  'https://virtualyoutuber.fandom.com/wiki/KemoV',
];

// This file never empties the table, so what it reads is what the migration
// left.
describe('the seeded source_whitelist', () => {
  test('holds the 13 entries the constant held, and nothing else', async () => {
    const { results } = await env.DB.prepare('SELECT prefix FROM source_whitelist ORDER BY rowid').all<{
      prefix: string;
    }>();

    expect(results.map((row) => row.prefix)).toEqual(SEEDED);
  });

  // The day the owner decided them (#141), not the day migration 0008 ran.
  test('dates every entry 2026-09-15, and has updated_at say when it was written', async () => {
    const { results } = await env.DB.prepare(
      `SELECT created_at, updated_at FROM source_whitelist WHERE created_at <> '2026-09-15T00:00:00Z' OR updated_at <= created_at`,
    ).all();

    expect(results).toEqual([]);
  });

  test('gives every entry a note naming why it is there', async () => {
    const { results } = await env.DB.prepare('SELECT prefix FROM source_whitelist WHERE note IS NULL').all();

    expect(results).toEqual([]);
  });
});

describe('readSourceWhitelist', () => {
  test('reads every prefix in the table', async () => {
    expect([...(await readSourceWhitelist(env))].sort()).toEqual([...SEEDED].sort());
  });
});

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
  ])('accepts %s', async (url) => {
    expect(isWhitelistedSource(url, await readSourceWhitelist(env))).toEqual(true);
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
    // #175: neither is on the list, and no host is on it by being a big one.
    'https://www.youtube.com/watch?v=aaaaaaaaaaa',
    'https://x.com/Junglecat_KEMOV/status/1',
  ])('refuses %s', async (url) => {
    expect(isWhitelistedSource(url, await readSourceWhitelist(env))).toEqual(false);
  });

  // The list is an argument, so the answer follows it and nothing else.
  test('accepts only what the list it is given names', () => {
    expect(isWhitelistedSource('https://www.youtube.com/watch?v=a', [])).toEqual(false);
    expect(isWhitelistedSource('https://www.youtube.com/watch?v=a', ['https://www.youtube.com/'])).toEqual(true);
  });
});

describe('hasTwoHosts', () => {
  test('is true for two URLs on different hosts', () => {
    expect(hasTwoHosts(['https://www.youtube.com/watch?v=a', 'https://x.com/someone/status/1'])).toEqual(true);
  });

  test('is false for two URLs on the same host', () => {
    expect(hasTwoHosts(['https://www.youtube.com/watch?v=a', 'https://www.youtube.com/watch?v=b'])).toEqual(false);
  });

  test('is false for one URL, and for none', () => {
    expect(hasTwoHosts(['https://x.com/someone'])).toEqual(false);
    expect(hasTwoHosts([])).toEqual(false);
  });

  // A host is compared as `URL` reads it, so the same host written with a
  // different case, or with a port the default already implies, is one host.
  test('reads the host the way URL does', () => {
    expect(hasTwoHosts(['https://X.com/a', 'https://x.com:443/b'])).toEqual(false);
  });

  // The same post reached as x.com and as twitter.com is one source seen
  // twice, which is what counting hosts is there to refuse.
  test('counts x.com, www.x.com and twitter.com as one host', () => {
    expect(hasTwoHosts(['https://x.com/someone/status/1', 'https://twitter.com/someone/status/1'])).toEqual(false);
    expect(hasTwoHosts(['https://x.com/someone/status/1', 'https://www.x.com/someone/status/1'])).toEqual(false);
    expect(hasTwoHosts(['https://twitter.com/a', 'https://www.twitter.com/b'])).toEqual(false);
  });

  test('still counts x.com and youtube.com as two hosts', () => {
    expect(hasTwoHosts(['https://x.com/someone/status/1', 'https://www.youtube.com/watch?v=a'])).toEqual(true);
    expect(hasTwoHosts(['https://twitter.com/someone/status/1', 'https://youtube.com/watch?v=a'])).toEqual(true);
  });

  // Not a suffix match: a host that merely ends the same way is another site.
  test('does not fold a host that only ends in the alias', () => {
    expect(hasTwoHosts(['https://x.com/a', 'https://nottwitter.com/b'])).toEqual(true);
  });

  test('counts a URL that names no host as none', () => {
    expect(hasTwoHosts(['https://', 'https://x.com/a'])).toEqual(false);
  });
});
