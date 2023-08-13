<script setup lang="ts">
import { type VideoBase } from '@/types/genet';
import { computed } from 'vue';
import { getThumbnailURL, getWatchURL } from '@/lib/youtube';

const props = defineProps<{
  /**
   * The id of the link to YouTube video.
   */
  video: VideoBase;
}>();

const thumbnailUrlCss = computed(() => `url('${getThumbnailURL(props.video.id, { size: 'hq' })}')`);
</script>

<template>
  <a class="videolink" :href="videoUrl" target="_blank" :alt="videoTitle"> </a>
</template>

<style lang="scss" scoped>
.videolink {
  background-image: v-bind('thumbnailUrlCss');
}
</style>

<style lang="scss">
.videolink {
  min-width: 160px;
  aspect-ratio: 16 / 9;
  display: inline-block;
  background-position: center center;
  background-repeat: no-repeat;
  background-size: cover;
}
</style>
