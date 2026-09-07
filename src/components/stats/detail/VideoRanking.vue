<script setup lang="ts">
import { computed } from 'vue';

import VideoDetail from './VideoDetail.vue';
import VideoThumbnail from './VideoThumbnail.vue';

import { compareWithNull, type SortOrder } from '@nanase/alnilam/sort';
import type { Video, VideoType } from '@/type/api';
import { type VideoProperty, readProperty, getPropertyName, formatProperty } from '@/type/video';

const {
  data,
  targetProperty,
  filterType = ['streaming', 'video', 'shorts'],
  sortOrder = 'descending',
  maxNumber = 10,
} = defineProps<{
  data: Video[];
  targetProperty: VideoProperty;
  filterType?: VideoType[];
  sortOrder?: SortOrder;
  maxNumber?: number;
}>();

/**
 * The videos this ranking can order, best first.
 *
 * A video whose measure cannot be worked out is left out rather than ordered
 * as though the missing part were zero - the same rule `rankingFilter` applies
 * on the API side. Every video #67 migrated has no duration until
 * video-update reaches it, so the per-second rankings are short until the
 * sweep finishes rather than being padded with videos of no length.
 */
const filteredVideos = computed<Video[]>(() =>
  data
    .filter((v) => v.availability === 'public')
    .filter((v) => v.type !== null && filterType.includes(v.type))
    .filter((v) => {
      const value = readProperty(v, targetProperty);

      return value !== undefined && Number.isFinite(value) && value > 0;
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
      <tr v-for="(video, i) of filteredVideos" :key="video.videoId" style="cursor: pointer">
        <td>{{ i + 1 }}</td>
        <td>{{ formatProperty(targetProperty, readProperty(video, targetProperty)) }}</td>
        <td><VideoThumbnail :videoId="video.videoId" size="mq" /></td>
        <td>{{ video.title }}</td>
        <VideoDetail :video />
      </tr>
    </tbody>
  </v-table>
</template>
