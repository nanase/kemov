export const channelsUri = 'https://nanase.cc/asset/kemov/channels.json';
export const statsUri = 'https://d1zvseiqyto6c5.cloudfront.net/kemov/stats.json';
export const videoUriBase = 'https://d1zvseiqyto6c5.cloudfront.net/kemov/stats/video/';

export function videoUri(channelId: string | undefined) {
  return `${videoUriBase}${channelId}.json`;
}
