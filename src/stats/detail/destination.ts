/**
 * Where an old `/stats/detail/#/<channel id>` address should land.
 *
 * The member lived in the fragment, which no request sends to a server, so the
 * worker cannot pick the page and the browser has to (#144).
 */

/**
 * A YouTube channel ID: `UC` and 22 URL-safe characters.
 *
 * The shape is checked before the ID goes into an address. A fragment that is
 * not an ID - a typo, a half-copied link - sent as it is would open whatever
 * page that text happens to name, which is worse than the list page it falls
 * back to: nothing says the link was wrong.
 */
const CHANNEL_ID = /^UC[\w-]{22}$/;

/** The members list, where a fragment with no usable channel goes. */
const MEMBERS = '/members/';

/**
 * The address for a `location.hash`.
 *
 * Only the first segment after `#/` is read, as the old router did: what
 * followed it (a query, a trailing slash) never named another member.
 */
export function destinationOf(hash: string): string {
  if (!hash.startsWith('#/')) return MEMBERS;

  const [channelId = ''] = hash.slice(2).split(/[/?]/, 1);

  return CHANNEL_ID.test(channelId) ? `${MEMBERS}${channelId}` : MEMBERS;
}
