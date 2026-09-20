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
 * Whether `urls` are backed by at least two different hosts.
 *
 * What a source outside the whitelist can still count for: one YouTube video
 * says something and a second URL on the same host - another video, or the
 * same one written another way - only repeats it, so it is the number of
 * hosts and not of URLs that says the claim was checked somewhere else. A URL
 * `new URL` cannot parse names no host, and adds none.
 */
export function hasTwoHosts(urls: readonly string[]): boolean {
  const hosts = new Set<string>();

  for (const url of urls) {
    try {
      hosts.add(new URL(url).hostname);
    } catch {
      continue;
    }
  }

  return hosts.size >= 2;
}
