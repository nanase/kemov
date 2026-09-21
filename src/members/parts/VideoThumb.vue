<script setup lang="ts">
import { computed, ref, watch } from 'vue';

import { relayVideoThumbnailURL } from '@/lib/relay';
import ThumbnailFallback from '@/parts/ThumbnailFallback.vue';

/**
 * One video's picture, with something to show when it does not arrive.
 *
 * The image relay (`@/lib/relay`) answers with YouTube's refusal - a 429 when a
 * page asks for a screenful at once, a 404 for a video with no such file - and
 * the browser then has no image to draw. It asks once more after a wait, and
 * shows `ThumbnailFallback`, the stand-in every page shares, from the first
 * failure until the retry settles.
 */
const { videoId, width, height } = defineProps<{
  videoId: string;
  width: number;
  height: number;
}>();

/**
 * How long to wait before the one retry. It covers a dropped connection. A
 * refusal from YouTube is kept by the relay for a while, so asking again this
 * soon meets the same answer.
 */
const RETRY_MS = 1500;

const errors = ref(0);
const token = ref(0);
const failed = ref(false);
const waiting = ref(false);

watch(
  () => videoId,
  () => {
    errors.value = 0;
    token.value = 0;
    failed.value = false;
    waiting.value = false;
  },
);

function onError() {
  errors.value += 1;

  // The first failure buys one more try, after a wait. The second settles it:
  // asking a third time would be the page adding to the load that refused it.
  if (errors.value > 1) {
    failed.value = true;

    return;
  }

  waiting.value = true;
  window.setTimeout(() => {
    waiting.value = false;
    token.value += 1;
  }, RETRY_MS);
}

const shown = computed(() => failed.value || waiting.value);
const style = computed(() => ({ width: `${width}px`, height: `${height}px`, minWidth: `${width}px` }));
</script>

<template>
  <ThumbnailFallback v-if="shown" class="thumb" :style="style" />
  <img
    v-else
    :key="token"
    class="thumb"
    :src="relayVideoThumbnailURL(videoId, 'mq')"
    :style="style"
    alt=""
    :width="width"
    :height="height"
    loading="lazy"
    decoding="async"
    @error="onError"
  />
</template>

<style scoped>
.thumb {
  display: block;
  flex: none;
  max-width: none;
  border: 1px solid var(--k-line);
  border-radius: 2px;
  background: var(--k-track);
  object-fit: cover;
}
</style>
