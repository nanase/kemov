import { isAllowedChannelIconHost, resizeChannelIconUrl } from '../api/image';
import type { Env } from '../lib/env';
import { errorResponse, jsonResponse } from '../lib/json';
import { callYouTubeApi } from '../lib/youtube';
import { CHANNEL_ID_PATTERN } from './members';

/**
 * GET /admin/api/channel-lookup/:channelId (#276) - the name and icon of a
 * YouTube channel, for checking a channel_id before a member is added.
 *
 * Nothing it reads is stored. YouTube API values may be kept on this site for
 * 30 days at most (docs/reference/data.md), and a lookup made for a channel
 * that may never become a member has no reason to outlive the answer; the
 * member's own `name` and `thumbnail_url` still come from the collector once
 * the member is saved.
 *
 * The icon comes back inside the answer as a data: URL rather than as an
 * address. The admin site's CSP is `img-src 'self' data:`, so a YouTube URL
 * could not be drawn, and a relay route would be a second place to keep
 * allowed.
 *
 * Answers:
 * - 200 `{ channelId, title, iconDataUrl }`; `iconDataUrl` is null when the
 *   channel exists but its picture could not be fetched, which says nothing
 *   against the id.
 * - 400 for an id that is not `UC` and 22 characters, before YouTube is asked.
 * - 404 with `code: 'channel_not_found'` when Channels.list names no such
 *   channel. The screen blocks adding.
 * - 502 when YouTube could not be asked or did not answer properly. This is
 *   not "not found": the id may be right.
 */

/** The `code` of the 404 that means YouTube has no such channel, as opposed to a 404 from anywhere else. */
export const NOT_FOUND_CODE = 'channel_not_found';

/** The size the icon is fetched at: sharp on a dense screen at the 54px the member preview draws a face, and small enough to carry in the answer. */
const ICON_SIZE = '176';

/** A cap on what is turned into base64, so an unexpected body cannot bloat the answer. */
const MAX_ICON_BYTES = 256 * 1024;

interface ChannelsListSnippet {
  items?: {
    id: string;
    snippet?: {
      title?: string;
      thumbnails?: { default?: { url?: string } };
    };
  }[];
}

function base64Of(bytes: Uint8Array): string {
  let binary = '';

  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }

  return btoa(binary);
}

/** The icon at `url` as a data: URL, or null when it is not where expected or cannot be read. */
async function iconDataUrl(url: string | undefined, fetchImpl: typeof fetch): Promise<string | null> {
  if (url === undefined || !isAllowedChannelIconHost(url) || !url.startsWith('https://')) return null;

  try {
    // `redirect: 'error'`: a redirect would leave the two allowed hosts
    // without anyone checking where it went.
    const response = await fetchImpl(resizeChannelIconUrl(url, ICON_SIZE), { redirect: 'error' });
    const type = response.headers.get('content-type')?.split(';')[0]?.trim() ?? '';

    if (!response.ok || !type.startsWith('image/')) return null;

    const bytes = new Uint8Array(await response.arrayBuffer());

    return bytes.length === 0 || bytes.length > MAX_ICON_BYTES ? null : `data:${type};base64,${base64Of(bytes)}`;
  } catch (error) {
    console.error('channel-lookup: fetching the icon failed', error);
    return null;
  }
}

export async function lookupChannel(env: Env, channelId: string, fetchImpl: typeof fetch = fetch): Promise<Response> {
  if (!CHANNEL_ID_PATTERN.test(channelId)) {
    return errorResponse(400, 'channel id must be UC followed by 22 characters');
  }

  let item: NonNullable<ChannelsListSnippet['items']>[number] | undefined;

  try {
    const response = await callYouTubeApi<ChannelsListSnippet>(
      'channels',
      env.YOUTUBE_API_KEY,
      { part: 'snippet', id: channelId, maxResults: '1' },
      fetchImpl,
    );

    item = response.items?.find((candidate) => candidate.id === channelId);
  } catch (error) {
    console.error('channel-lookup: Channels.list failed', error);
    return errorResponse(502, 'YouTube could not be asked about the channel');
  }

  // `code` is what tells this 404 from any other: a route that does not exist
  // answers 404 with only an `error`, and so can a gateway in front of the
  // worker. The screen blocks adding on this one alone.
  if (item === undefined) {
    return jsonResponse(
      { error: `channel ${channelId} was not found on YouTube`, code: NOT_FOUND_CODE },
      { status: 404 },
    );
  }

  const title = item.snippet?.title;

  if (typeof title !== 'string' || title === '') {
    return errorResponse(502, 'YouTube answered without a title for the channel');
  }

  return jsonResponse({
    channelId,
    title,
    iconDataUrl: await iconDataUrl(item.snippet?.thumbnails?.default?.url, fetchImpl),
  });
}
