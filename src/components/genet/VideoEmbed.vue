<script setup lang="ts">
import { getEmbedURL } from '@/lib/youtube';
import { type EmbeddedVideo } from '@/type/genet/music';

const { video } = defineProps<{
  /**
   * Video object of the link to YouTube video.
   */
  video: EmbeddedVideo;
}>();
</script>

<template>
  <iframe
    class="video-embed"
    :src="`${getEmbedURL(video.id)}?${Number.isFinite(video.position) ? `start=${video.position}` : ''}`"
    frameborder="0"
    allowfullscreen
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
  >
  </iframe>
</template>

<style lang="scss">
.video-embed {
  display: block;
  width: 100%;
  height: 100%;
  min-width: 160px;
  aspect-ratio: 16 / 9;
  background: #000;
}
</style>
