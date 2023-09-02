<script setup lang="ts">
import { type EmbeddedVideo } from '@/types/genet';
import { computed } from 'vue';
import { getEmbedURL } from '@/lib/youtube';

const { video } = defineProps<{
  /**
   * The Video Object of the link to YouTube video.
   */
  video: EmbeddedVideo;
}>();

const start = computed(() => (Number.isFinite(video.position) ? `start=${video.position}` : ''));
</script>

<template>
  <div class="player-container">
    <iframe
      :src="`${getEmbedURL(video.id)}?${start}`"
      frameborder="0"
      allowfullscreen
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
    >
    </iframe>
  </div>
</template>

<style lang="scss">
.player-container {
  min-width: 160px;
  aspect-ratio: 16 / 9;
  background: #000;

  iframe {
    width: 100%;
    height: 100%;
    display: block;
  }
}
</style>
