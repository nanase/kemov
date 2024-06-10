<script setup lang="ts">
import { computed } from 'vue';

import VideoDetail from './VideoDetail.vue';
import VideoThumbnail from './VideoThumbnail.vue';

import { compareWithNull, type SortOrder } from '@/lib/sort';
import {
  type Video,
  type VideoType,
  type VideoProperty,
  readProperty,
  getPropertyName,
  formatProperty,
} from '@/type/video';

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

const filteredVideos = computed<Video[]>(() =>
  data
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
