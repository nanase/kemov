<script setup lang="ts">
import { type VideoBase } from '@/types/genet';
import { computed } from 'vue';
import { getThumbnailURL, getWatchURL } from '@/lib/youtube';

const props = defineProps<{
  /**
   * The id of the link to YouTube video.
   */
  video: VideoBase;
  title?: string;
}>();

const thumbnailUrlCss = computed(() => `url('${getThumbnailURL(props.video.id, { size: 'hq' })}')`);
</script>

<template>
  <a
    class="video-link"
    :href="getWatchURL(props.video.id)"
    target="_blank"
    :title="video.title ?? title ?? '配信を見る'"
  >
  </a>
</template>

<style lang="scss" scoped>
.video-link {
  background-image: v-bind('thumbnailUrlCss');
}
</style>

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
