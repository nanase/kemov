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

// A relative import across the worker/frontend boundary, as theme.ts does:
// the admin screen judges sources with the same functions as they are typed,
// so the screen and the public JSON cannot come to different answers (#282).
// The worker reaches them through here only.
export {
  countedHost,
  hasTwoHosts,
  isWhitelistedSource,
  sourcesEnough,
  sourceUrlProblem,
} from '../../../src/admin/lib/source-check';

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

/**
 * The video ID `url` points at, or null when it is not a YouTube video's URL
 * (#225). Only the forms a member's own stream is shared as are read:
 * `youtube.com/watch?v=<ID>` on `www.`, `m.` or no prefix, `youtu.be/<ID>`
 * and `www.youtube.com/live/<ID>`, over `https` with no port or user info. Other query parameters, such
 * as a start time, are ignored. A channel page, a playlist, another host or an
 * ID that is not 11 characters is not a video's URL.
 */
export function youtubeVideoIdOf(url: string): string | null {
  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'https:' || parsed.port !== '' || parsed.username !== '' || parsed.password !== '') {
    return null;
  }

  let id: string | null = null;

  if (parsed.hostname === 'youtu.be') {
    id = parsed.pathname.slice(1);
  } else if (['www.youtube.com', 'youtube.com', 'm.youtube.com'].includes(parsed.hostname)) {
    if (parsed.pathname === '/watch') {
      id = parsed.searchParams.get('v');
    } else if (parsed.hostname === 'www.youtube.com' && parsed.pathname.startsWith('/live/')) {
      id = parsed.pathname.slice('/live/'.length);
    }
  }

  return id !== null && VIDEO_ID.test(id) ? id : null;
}

/**
 * The video IDs among `urls` that are videos of `channelId`'s own that this
 * site has collected. A stream the member showed their subscriber count in is
 * their own statement, so it counts as a source by itself, as a whitelisted
 * one does. A video missing from `video` (older than what is collected, #230)
 * does not count: nothing says whose it is.
 */
export async function ownVideoIdsOf(env: Env, urls: readonly string[], channelId: string): Promise<Set<string>> {
  const ids = [...new Set(urls.map(youtubeVideoIdOf).filter((id): id is string => id !== null))];

  if (ids.length === 0) return new Set();

  const { results } = await env.DB.prepare(
    'SELECT video_id FROM video WHERE channel_id = ?1 AND video_id IN (SELECT value FROM json_each(?2))',
  )
    .bind(channelId, JSON.stringify(ids))
    .all<{ video_id: string }>();

  return new Set(results.map((row) => row.video_id));
}
