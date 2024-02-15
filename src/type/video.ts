import dayjs, { Dayjs, duration } from '@/lib/dayjs';

export type LiveBroadcastContentType = 'none' | 'upcoming' | 'live';
export type VideoType = 'video' | 'streaming' | 'shorts';
export type VideoAvailability = 'public' | 'membership' | 'private' | 'unavalable';

export interface Video {
  videoId: string;
  publishedAt: Dayjs;
  fetchedAt?: Dayjs;
  availability?: VideoAvailability;
  title: string;
  liveBroadcastContent: LiveBroadcastContentType;
  type?: VideoType;
  duration?: duration.Duration;
  viewCount?: number;
  likeCount?: number;
  commentCount?: number;
  chatMessageCount?: number;
  chatUniqueUserCount?: number;
  scheduledStartTime?: Dayjs;
  actualStartTime?: Dayjs;
  actualEndTime?: Dayjs;
}

export function parse(text: string): readonly Video[] {
  return JSON.parse(text, (key, value) => {
    switch (key) {
      case 'videoId':
      case 'title':
      case 'liveBroadcastContent':
      case 'availability':
        return value.toString();

      case 'publishedAt':
        return dayjs(value);

      case 'fetchedAt':
      case 'scheduledStartTime':
      case 'actualStartTime':
      case 'actualEndTime':
        return value ? dayjs(value) : undefined;

      case 'type':
        return value ?? undefined;

      case 'duration':
        return value ? dayjs.duration(value) : undefined;

      case 'viewCount':
      case 'likeCount':
      case 'commentCount':
      case 'chatMessageCount':
      case 'chatUniqueUserCount': {
        if (value === '') {
          return undefined;
        } else {
          const num = Number(value);

          return Number.isFinite(num) ? num : undefined;
        }
      }

      default:
        return value;
    }
  }) as readonly Video[];
}
