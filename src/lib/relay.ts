import { apiBase } from '@/config';
import { getThumbnailSizeName, type ThumbnailSize } from '@/lib/youtube';

/**
 * Where the pages read a picture from: the worker's image relay, not YouTube.
 *
 * YouTube answers a browser's own requests for thumbnails and icons with 429
 * when they come too often, and which ones fail changes from load to load. The
 * relay (`worker/src/api/image.ts`, #144) asks YouTube once and answers every
 * later request from the edge cache, so the browser talks only to this site.
 *
 * Only an id goes in, never a URL - the relay decides where to fetch from. An
 * id that names nothing, or an image the host does not have, comes back as an
 * error status and the `<img>` fires `error`, exactly as it did when YouTube
 * refused; every place that draws one of these already has its own stand-in.
 */

/** The sizes the relay serves a channel icon at, in pixels. */
export type ChannelIconSize = 48 | 88 | 176;

/**
 * 88 is the size Channels.list reports and the one the pages drew before the
 * relay, so a page that asks for no size sees the same picture as before.
 */
const DEFAULT_ICON_SIZE: ChannelIconSize = 88;

export function relayVideoThumbnailURL(videoId: string, size: ThumbnailSize = 'mq'): string {
  return `${apiBase}/image/video/${encodeURIComponent(videoId)}?size=${getThumbnailSizeName(size)}`;
}

export function relayChannelIconURL(channelId: string, size: ChannelIconSize = DEFAULT_ICON_SIZE): string {
  return `${apiBase}/image/channel/${encodeURIComponent(channelId)}?size=${size}`;
}
