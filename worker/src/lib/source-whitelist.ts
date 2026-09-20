import type { Env } from './env';

/**
 * URLs a footprints event's source may point at and still count as one source
 * enough by itself (#141's "出典のホワイトリスト"), kept in the
 * `source_whitelist` table and edited from the admin site (#175).
 *
 * Matched by prefix (`URL.startsWith`), so an entry naming an account or a
 * specific article covers everything under it. #141's design decision 7 kept
 * the list a constant on the grounds that it changed rarely; #175 reversed
 * that, since a list that has to be edited is data and not code.
 */

/** Every prefix in the table. */
export async function readSourceWhitelist(env: Env): Promise<string[]> {
  const { results } = await env.DB.prepare('SELECT prefix FROM source_whitelist').all<{
    prefix: string;
  }>();

  return results.map((row) => row.prefix);
}

/**
 * Whether `url` counts as a source `prefixes` accepts.
 *
 * A prefix match alone would let `https://x.com/KEMOVP_staff_fake` count as
 * the entry for `https://x.com/KEMOVP_staff`: `startsWith` does not care what
 * follows the matched text. What follows the prefix is checked instead - the
 * end of the string, or the start of a path segment, query string or
 * fragment - so an entry names exactly that account or page and nothing whose
 * name merely begins the same way. Every entry already ending in `/` gets
 * this for free, since the boundary it requires is inside the prefix itself.
 *
 * `prefixes` is passed in rather than read here: the check is the same
 * whichever list it runs against, and a caller checking several URLs reads
 * the table once.
 */
export function isWhitelistedSource(url: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => {
    if (!url.startsWith(prefix)) return false;

    // The prefix's own trailing `/` already is the boundary a domain-style
    // entry needs - checking the character after it would instead demand a
    // second one right after the first path segment.
    if (prefix.endsWith('/')) return true;

    const boundary = url.charAt(prefix.length);

    return boundary === '' || boundary === '/' || boundary === '?' || boundary === '#';
  });
}

/**
 * Hosts that are one place under two names, each mapped to the name it is
 * counted under. Only for `hasTwoHosts`: the whitelist match above compares
 * the URL's own text and does not read this.
 *
 * Every entry is the same resource written another way, which is what makes
 * a second URL on it no confirmation of the first. This is not a table of
 * domains that look related: two hosts belong to one organisation, or to one
 * service, without that making them the same page.
 *
 * - `twitter.com` is `x.com`. The whitelist already lists
 *   `x.com/KEMOVP_staff` and `twitter.com/KEMOVP_staff` side by side, so the
 *   project already treats the two as one.
 * - `youtu.be/<id>` and `youtube.com/watch?v=<id>` are the same video, and
 *   `m.youtube.com` is YouTube's own mobile form of `youtube.com`.
 *
 * `m.` is named for YouTube alone. It is not stripped from every host: that
 * another site's `m.` shows the same page as its main host is not something
 * any rule here can assume.
 *
 * Small on purpose. Add a pair only when it is known to be the same resource.
 */
const HOST_ALIASES: ReadonlyMap<string, string> = new Map([
  ['twitter.com', 'x.com'],
  ['youtu.be', 'youtube.com'],
  ['m.youtube.com', 'youtube.com'],
]);

/** The name `url`'s host is counted under, or null when `url` names none. `www.` is dropped: it is the same site written with a prefix. */
function countedHost(url: string): string | null {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');

    return HOST_ALIASES.get(host) ?? host;
  } catch {
    return null;
  }
}

/**
 * Whether `urls` are backed by at least two different hosts.
 *
 * What a source outside the whitelist can still count for: one YouTube video
 * says something and a second URL on the same host - another video, or the
 * same one written another way - only repeats it, so it is the number of
 * hosts and not of URLs that says the claim was checked somewhere else. A
 * host is counted as `countedHost` reads it, so `x.com`, `www.x.com` and
 * `twitter.com` are one. A URL `new URL` cannot parse names no host, and adds
 * none.
 */
export function hasTwoHosts(urls: readonly string[]): boolean {
  const hosts = new Set<string>();

  for (const url of urls) {
    const host = countedHost(url);

    if (host !== null) hosts.add(host);
  }

  return hosts.size >= 2;
}
