<script setup lang="ts">
import { getThumbnailURL, getWatchURL, type ThumbnailSize } from '@/lib/youtube';
import { url } from '@/lib/style';

const {
  videoId,
  link = false,
  size = 'hq',
} = defineProps<{
  /**
   * ID of the link to YouTube video.
   */
  videoId: string;
  link?: boolean;
  size?: ThumbnailSize;
}>();
</script>

<template>
  <a
    v-if="link"
    class="video-link"
    :href="getWatchURL(videoId)"
    target="_blank"
    :style="{ backgroundImage: url(getThumbnailURL(videoId, { size })) }"
  >
  </a>
  <div v-else class="video-link" :style="{ backgroundImage: url(getThumbnailURL(videoId, { size })) }"></div>
</template>

<style lang="scss">
.video-link {
  min-width: 160px;
  aspect-ratio: 16 / 9;
  display: inline-block;
  background-position: center center;
  background-repeat: no-repeat;
  background-size: cover;
}
</style>
