import { relayChannelIconURL } from '@/lib/relay';
import type { GenetMusicData } from './musicTypes';

/**
 * Where the page's title icon is read from, or `null` when it has none to ask
 * for and draws its plain coloured circle instead.
 *
 * `channel_id` is `null` when the published streams do not point clearly at
 * one channel, and is absent altogether from a JSON published before the field
 * existed; `== null` takes both as "no icon". 88 is the relay size for a
 * circle of 30 CSS pixels on a screen of twice or three times the density.
 */
export function channelIconURL(data: Pick<GenetMusicData, 'channel_id'> | null): string | null {
  const channelId = data?.channel_id;

  return channelId == null || channelId === '' ? null : relayChannelIconURL(channelId, 88);
}
