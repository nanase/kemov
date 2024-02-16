<script lang="ts">
export type TargetProperty =
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

function readProperty(video: Video, property: TargetProperty): number | undefined {
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

function getPropertyName(property: TargetProperty): string {
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

function formatProperty(property: TargetProperty, value: number | undefined): string {
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
</script>

<script setup lang="ts">
import { computed } from 'vue';

import VideoDetail from './VideoDetail.vue';
import VideoThumbnail from './VideoThumbnail.vue';

import { compareWithNull, type SortOrder } from '@/lib/sort';
import { type Video, type VideoType } from '@/type/video';
import { withCommas } from '@/lib/number';
import dayjs from '@/lib/dayjs';

const {
  data,
  targetProperty,
  filterType = ['streaming', 'video', 'shorts'],
  sortOrder = 'descending',
  maxNumber = 10,
} = defineProps<{
  data: readonly Video[];
  targetProperty: TargetProperty;
  filterType?: VideoType[];
  sortOrder?: SortOrder;
  maxNumber?: number;
}>();

const videos = computed(() => [...data]);
const filteredVideos = computed(() =>
  videos.value
    .filter((v) => v.availability === 'public')
    .filter((v) => v.type && filterType.includes(v.type))
    .filter((v) => {
      const value = readProperty(v, targetProperty) ?? 0;
      return isFinite(value) && value > 0;
    })
    .sort((x, y) => compareWithNull(readProperty(x, targetProperty), readProperty(y, targetProperty), sortOrder))
    .slice(0, maxNumber),
);
</script>

<template>
  <v-table height="600px" density="compact" hover>
    <thead>
      <tr>
        <th>#</th>
        <th class="text-left">{{ getPropertyName(targetProperty) }}</th>
        <th></th>
        <th class="text-left">タイトル</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="(video, i) of filteredVideos" :key="video.videoId">
        <td>{{ i + 1 }}</td>
        <td>{{ formatProperty(targetProperty, readProperty(video, targetProperty)) }}</td>
        <td>
          <VideoThumbnail :videoId="video.videoId" size="mq"></VideoThumbnail>
        </td>
        <td>{{ video.title }}</td>
        <VideoDetail :video="video" />
      </tr>
    </tbody>
  </v-table>
</template>
