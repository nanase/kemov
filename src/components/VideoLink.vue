<script setup lang="ts">
import { computed } from 'vue';
import { getThumbnailURL, getWatchURL } from '@/lib/youtube';

const props = defineProps<{
  /**
   * The id of the link to YouTube video.
   */
  videoId: string;

  /**
   * The title of the link to YouTube video.
   * If this property is null, the alt attribute of the link image is set to empty.
   */
  videoTitle?: string;
}>();

const thumbnailUrl = computed(() => getThumbnailURL(props.videoId, { size: 'hq' }));
const thumbnailUrlCss = `url('${thumbnailUrl.value}')`;
const videoUrl = computed(() => getWatchURL(props.videoId));
const videoTitle = computed(() => props.videoTitle ?? '');
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
