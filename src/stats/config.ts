export const channelsUri = 'https://nanase.cc/asset/kemov/channels.json';
export const statsUri = 'https://s3.ap-northeast-1.amazonaws.com/nanase.asset/kemov/stats.json';
export const videoUriBase = 'https://s3.ap-northeast-1.amazonaws.com/nanase.asset/kemov/stats/video/';

export function videoUri(channelId: string | undefined) {
  return `${videoUriBase}${channelId}.json`;
}
