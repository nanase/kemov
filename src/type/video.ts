import { withCommas } from '@nanase/alnilam/number';
import dayjs from '@nanase/alnilam/dayjs';

import type { Video } from '@/type/api';

/**
 * The measures a video can be ranked by, and how each one is read, named and
 * written.
 *
 * A video's shape and the reading of a response are @/type/api.ts; this is
 * what the site does with one.
 */

export const VIDEO_PROPERTIES = [
  'viewCount',
  'likeCount',
  'commentCount',
  'chatMessageCount',
  'chatUniqueUserCount',
  'chatMessageCountPerUniqueUser',
  'duration',
  'viewCountPerSecond',
  'likeCountPerSecond',
  'commentCountPerSecond',
  'chatMessageCountPerSecond',
] as const;

export type VideoProperty = (typeof VIDEO_PROPERTIES)[number];

/**
 * The value a video has for one measure, or undefined when it has none.
 *
 * Eight of the eleven are derived from two columns, and the API computes the
 * same eight in SQL for `GET /api/videos/ranking` - `EXPRESSIONS` in
 * worker/src/lib/ranking.ts. **The two have to agree, and nothing checks that
 * they do.** Correcting one without the other would make a ranking of one
 * channel disagree with a ranking across all of them.
 *
 * They are both here on purpose. The ranking on the detail page orders one
 * channel's archive, ascending or descending, filtered by video type, and it
 * re-orders the moment a tab is clicked because the whole archive is already
 * in the browser. The API's ranking is a cross-channel top-N, descending, with
 * no type filter - it cannot answer that page's question, and turning eleven
 * instant re-orderings into eleven requests would be a worse site.
 *
 * Undefined rather than zero when a part is missing, which is the same rule
 * `rankingFilter` applies on the API side: a video whose duration has not been
 * collected yet is left out of a per-second ranking rather than ordered as
 * though it had been measured and found to be nothing. Every video #67
 * migrated has a null duration until video-update reaches it.
 */
export function readProperty(video: Video, property: VideoProperty): number | undefined {
  const per = (count: number | null, divisor: number | null): number | undefined =>
    count === null || divisor === null || divisor <= 0 ? undefined : count / divisor;

  switch (property) {
    case 'viewCount':
      return video.viewCount ?? undefined;

    case 'likeCount':
      return video.likeCount ?? undefined;

    case 'commentCount':
      return video.commentCount ?? undefined;

    case 'chatMessageCount':
      return video.chatMessageCount ?? undefined;

    case 'chatUniqueUserCount':
      return video.chatUniqueUserCount ?? undefined;

    case 'duration':
      return video.durationSeconds ?? undefined;

    case 'chatMessageCountPerUniqueUser':
      return per(video.chatMessageCount, video.chatUniqueUserCount);

    case 'viewCountPerSecond':
      return per(video.viewCount, video.durationSeconds);

    case 'likeCountPerSecond':
      return per(video.likeCount, video.durationSeconds);

    case 'commentCountPerSecond':
      return per(video.commentCount, video.durationSeconds);

    case 'chatMessageCountPerSecond':
      return per(video.chatMessageCount, video.durationSeconds);
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

/** A duration in seconds, written the way a video length is read. */
export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds) return '00:00';

  return seconds < 3600
    ? dayjs.duration(seconds, 'seconds').format('mm:ss')
    : dayjs.duration(seconds, 'seconds').format('H:mm:ss');
}

export function formatProperty(property: VideoProperty, value: number | undefined): string {
  switch (property) {
    case 'viewCount':
    case 'likeCount':
    case 'commentCount':
    case 'chatMessageCount':
    case 'chatUniqueUserCount':
      return withCommas(value);

    case 'duration':
      return formatDuration(value);

    case 'chatMessageCountPerUniqueUser':
    case 'viewCountPerSecond':
    case 'likeCountPerSecond':
    case 'commentCountPerSecond':
    case 'chatMessageCountPerSecond':
      return value ? value.toFixed(1) : '0';
  }
}
