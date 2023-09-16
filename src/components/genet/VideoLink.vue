<script setup lang="ts">
import { type VideoBase } from '@/genet/music/types';
import { computed } from 'vue';
import { getThumbnailURL, getWatchURL } from '@/lib/youtube';
import { url } from '@/lib/style';

const { video, title } = defineProps<{
  /**
   * ID of the link to YouTube video.
   */
  video: VideoBase;
  /**
   * Title of the link to YouTube video.
   */
  title?: string;
}>();

const thumbnailUrl = computed(() => url(getThumbnailURL(video.id, { size: 'hq' })));
</script>

<template>
  <a
    class="video-link"
    :href="getWatchURL(video.id)"
    target="_blank"
    :title="video.title ?? title ?? '配信を見る'"
    :style="{ backgroundImage: thumbnailUrl }"
  >
  </a>
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
