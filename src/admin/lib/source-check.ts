/**
 * Whether a footprints event's sources are enough (#141, #175, #282): one
 * source on the whitelist, or sources on two different hosts. The admin
 * screen judges as it is typed, and the worker judges what the public JSON's
 * 「出典の確認待ち」 says, both from this file, so the two cannot come to
 * different answers.
 *
 * Nothing here reads D1: the whitelist is passed in.
 */

/** A path segment that is `.` or `..`, written plainly or with its dots percent-encoded: a browser resolves it away. */
const DOT_SEGMENT = /^(?:\.|%2e){1,2}$/i;

/**
 * Whether opening `url` goes where its text says it does.
 *
 * The prefix match reads the text, and a browser reads the URL: it resolves
 * `.` and `..` segments, treats `\` as `/`, drops tabs and line breaks, and
 * takes user info and a port as part of the host. Text that a browser would
 * read as somewhere else than it spells is refused outright, so the match
 * below only ever sees a URL whose text and meaning agree. That means:
 *
 * - `new URL` parses it;
 * - its origin is the text before the path - no user info, no port, and a host
 *   already in the form `URL` normalises to;
 * - the path (the text between the origin and `?` or `#`) holds no `.` or `..`
 *   segment, no encoded `/` or `\`, and no `\`, tab or line break.
 *
 * The path is read from the original text, not from `URL.pathname`, so a URL
 * with non-ASCII characters in it is compared as it was written.
 */
function readsAsWrittenOnTheWire(url: string): boolean {
  let origin: string;

  try {
    origin = new URL(url).origin;
  } catch {
    return false;
  }

  // An opaque origin (`"null"`) is a scheme that has none, which no https URL is.
  if (!url.startsWith(origin) || origin === 'null') return false;

  const path = url.slice(origin.length).split(/[?#]/, 1)[0];

  if (/[\\\t\n\r]|%2f|%5c/i.test(path)) return false;

  return !path.split('/').some((segment) => DOT_SEGMENT.test(segment));
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
  if (!readsAsWrittenOnTheWire(url)) return false;

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
 * counted under. For `hasTwoHosts` and the screen's marks: the whitelist
 * match above compares the URL's own text and does not read this.
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
export function countedHost(url: string): string | null {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');

    return HOST_ALIASES.get(host) ?? host;
  } catch {
    return null;
  }
}

/**
 * Why a save refuses `url` as a source's URL, or null when it accepts it.
 * Only a URL a save accepts counts towards a judgement, so the screen never
 * calls enough what a save then refuses.
 *
 * `message` is the sentence the screen shows when the worker refuses the save
 * for it, and `detail` the same in English for marking the field (#291).
 */
export function sourceUrlProblem(url: string): { message: string; detail: string } | null {
  if (!url.startsWith('https://')) {
    return {
      message: '出典の URL が https:// で始まっていません',
      detail: 'every source url must start with https://',
    };
  }
  // The schema's CHECK looks at the prefix alone, so `https://` by itself
  // would save, and count towards nothing but still reach the public JSON.
  const parsed = parseUrl(url);

  if (parsed === null || parsed.hostname === '') {
    return { message: '出典の URL の形式が正しくありません', detail: 'every source url must be a valid https URL' };
  }
  // A source's URL reaches the public JSON as written.
  if (parsed.username !== '' || parsed.password !== '') {
    return {
      message: '出典の URL にユーザー名かパスワードが含まれています',
      detail: 'every source url must not carry a user name or password',
    };
  }

  return null;
}

function parseUrl(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

/** The host `url` counts for as a source, or null when it counts for none: only a URL a save accepts does. */
function sourceHost(url: string): string | null {
  return sourceUrlProblem(url) === null ? countedHost(url) : null;
}

/**
 * Whether `urls` are backed by at least two different hosts.
 *
 * What a source outside the whitelist can still count for: one YouTube video
 * says something and a second URL on the same host - another video, or the
 * same one written another way - only repeats it, so it is the number of
 * hosts and not of URLs that says the claim was checked somewhere else. A
 * host is counted as `countedHost` reads it, so `x.com`, `www.x.com` and
 * `twitter.com` are one. A URL a save refuses (`sourceUrlProblem`) adds none.
 */
export function hasTwoHosts(urls: readonly string[]): boolean {
  const hosts = new Set<string>();

  for (const url of urls) {
    const host = sourceHost(url);

    if (host !== null) hosts.add(host);
  }

  return hosts.size >= 2;
}

/**
 * Whether `urls` back an event: one of them on `whitelist`, or two of them on
 * different hosts. No source at all is not enough. What the public JSON's
 * `source_pending` is the opposite of.
 */
export function sourcesEnough(urls: readonly string[], whitelist: readonly string[]): boolean {
  return urls.some((url) => isWhitelistedSource(url, whitelist)) || hasTwoHosts(urls);
}

/**
 * What the screen shows beside one source (#277's decision 2a): that it is on
 * the whitelist, or the host it is counted under. `sameSite` is a host an
 * earlier source is already on, which adds nothing to the count. `none` is a
 * URL that names no host, such as one still being typed: it counts for
 * nothing and has no mark.
 */
export type SourceMark = { kind: 'whitelist' } | { kind: 'host'; host: string; sameSite: boolean } | { kind: 'none' };

export interface SourcesJudgement {
  enough: boolean;
  /** One for each URL, in the same order. */
  marks: SourceMark[];
  /**
   * When the sources are not enough, the one host they are on, or null when
   * none of them names a host. Not enough means no source is on the whitelist
   * and there are fewer than two hosts, so there is never more than one.
   * Null when they are enough.
   */
  onlyHost: string | null;
}

/** `sourcesEnough`, with a mark for each source and the host that leaves them short. */
export function judgeSources(urls: readonly string[], whitelist: readonly string[]): SourcesJudgement {
  const seen = new Set<string>();

  const marks = urls.map((url): SourceMark => {
    const host = sourceHost(url);

    if (host === null) return { kind: 'none' };

    const sameSite = seen.has(host);

    seen.add(host);

    return isWhitelistedSource(url, whitelist) ? { kind: 'whitelist' } : { kind: 'host', host, sameSite };
  });

  const enough = sourcesEnough(urls, whitelist);

  return { enough, marks, onlyHost: enough ? null : ([...seen][0] ?? null) };
}
