import { withCommas } from '@nanase/alnilam/number';
import dayjs, { Dayjs, duration } from '@nanase/alnilam/dayjs';

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

export type VideoProperty =
  | 'viewCount'
  | 'likeCount'
  | 'commentCount'
  | 'chatMessageCount'
  | 'chatUniqueUserCount'
  | 'chatMessageCountPerUniqueUser'
  | 'duration'
  | 'viewCountPerSecond'
  | 'likeCountPerSecond'
  | 'commentCountPerSecond'
  | 'chatMessageCountPerSecond';

export function parse(text: string): Video[] {
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
  }) as Video[];
}

export function readProperty(video: Video, property: VideoProperty): number | undefined {
  switch (property) {
    case 'viewCount':
      return video.viewCount;

    case 'likeCount':
      return video.likeCount;

    case 'commentCount':
      return video.commentCount;

    case 'chatMessageCount':
      return video.chatMessageCount;

    case 'chatUniqueUserCount':
      return video.chatUniqueUserCount;

    case 'chatMessageCountPerUniqueUser':
      return video.chatMessageCount == null || video.chatUniqueUserCount == null
        ? 0
        : video.chatMessageCount / video.chatUniqueUserCount;

    case 'duration':
      return video.duration?.asSeconds();

    case 'viewCountPerSecond':
      return video.viewCount == null || video.duration == null ? 0 : video.viewCount / video.duration?.asSeconds();

    case 'likeCountPerSecond':
      return video.likeCount == null || video.duration == null ? 0 : video.likeCount / video.duration?.asSeconds();

    case 'commentCountPerSecond':
      return video.commentCount == null || video.duration == null
        ? 0
        : video.commentCount / video.duration?.asSeconds();

    case 'chatMessageCountPerSecond':
      return video.chatMessageCount == null || video.duration == null
        ? 0
        : video.chatMessageCount / video.duration?.asSeconds();
  }
}

export function getPropertyName(property: VideoProperty): string {
  switch (property) {
    case 'viewCount':
      return '再生数';

    case 'likeCount':
      return '高評価数';

    case 'commentCount':
      return 'コメント数';

    case 'chatMessageCount':
      return 'チャット数';

    case 'chatUniqueUserCount':
      return 'チャットユーザ数';

    case 'chatMessageCountPerUniqueUser':
      return 'ユーザあたりチャット数';

    case 'duration':
      return '再生時間';

    case 'viewCountPerSecond':
      return '時間あたり再生数';

    case 'likeCountPerSecond':
      return '時間あたり高評価数';

    case 'commentCountPerSecond':
      return '時間あたりコメント数';

    case 'chatMessageCountPerSecond':
      return '時間あたりチャット数';
  }
}

export function formatProperty(property: VideoProperty, value: number | undefined): string {
  switch (property) {
    case 'viewCount':
    case 'likeCount':
    case 'commentCount':
    case 'chatMessageCount':
    case 'chatUniqueUserCount':
      return withCommas(value);

    case 'duration': {
      if (!value) {
        return '00:00';
      } else if (value < 3600) {
        return dayjs.duration(value, 'seconds').format('mm:ss');
      } else {
        return dayjs.duration(value, 'seconds').format('H:mm:ss');
      }
    }

    case 'chatMessageCountPerUniqueUser':
    case 'viewCountPerSecond':
    case 'likeCountPerSecond':
    case 'commentCountPerSecond':
    case 'chatMessageCountPerSecond':
      return value ? value.toFixed(1) : '0';
  }
}
