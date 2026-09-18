/**
 * URLs a footprints event's source may point at and still count toward
 * `source_pending = 0` (#141's "出典のホワイトリスト").
 *
 * A plain constant rather than a D1 table - #141's design decision 7: there
 * is no screen to edit it from yet, and putting it in D1 would mean a
 * screen, a version history and a backup rule for a handful of prefixes
 * that change rarely. Matched by prefix (`URL.startsWith`), so an entry
 * naming an account or a specific article covers everything under it.
 *
 * Decided by the project owner on 2026-09-15; see #141. Every entry below
 * was confirmed against the source it names at that time - a domain moving
 * or a page being renamed is not something this list tracks on its own.
 */
export const SOURCE_WHITELIST: readonly string[] = [
  // 公式 - the project's own domains and its official social accounts.
  'https://kemov-project.com/',
  'https://www.kemov-project.com/',
  'https://kemono-friends.jp/',
  'https://x.com/KEMOVP_staff',
  'https://twitter.com/KEMOVP_staff',
  'https://kemovproject.stores.jp/',

  // 運営会社・提携先の発表 - press releases and partner pages for a
  // collaboration. "など" in the decision means this category is expected to
  // grow as new partners appear; the three named here are what was decided.
  'https://prtimes.jp/',
  'https://kyodonewsprwire.jp/',
  'https://shop.joysound.com/',

  // 出演イベントの主催者
  'https://vtube.tokyo/',

  // ファンの Wiki・大百科 - unofficial, but treated as a source because #141
  // named these two specifically rather than fan wikis in general.
  'https://wikiwiki.jp/kemo_v/',
  'https://dic.nicovideo.jp/a/%E3%81%91%E3%82%82%E3%81%AE%E3%83%95%E3%83%AC%E3%83%B3%E3%82%BAv%E3%81%B7%E3%82%8D%E3%81%98%E3%81%87%E3%81%8F%E3%81%A8',
  'https://virtualyoutuber.fandom.com/wiki/KemoV',
];

/** Whether `url` counts as a source the whitelist accepts. */
export function isWhitelistedSource(url: string): boolean {
  return SOURCE_WHITELIST.some((prefix) => url.startsWith(prefix));
}
