<script setup lang="ts">
import { ref, watch, type StyleValue } from 'vue';

import ThumbnailFallback from './ThumbnailFallback.vue';

/**
 * A thumbnail `<img>` that becomes `ThumbnailFallback` when it fails to load.
 *
 * It asks for the picture once and does not retry: a second request would be
 * the page adding to the load that made YouTube refuse the first. A caller
 * that retries by its own rules (`@/videos/parts/VideoThumbnail.vue`,
 * `@/members/parts/VideoThumb.vue`) uses `ThumbnailFallback` directly instead.
 *
 * Whatever attributes the caller gives go to the `<img>`. Its `class` and
 * `style` also go to the fallback, so the same rules size both. A caller that
 * wants another stand-in gives a `fallback` slot, and then draws its own box.
 */
defineOptions({ inheritAttrs: false });

const { src } = defineProps<{ src: string }>();

const failed = ref(false);

watch(
  () => src,
  () => {
    failed.value = false;
  },
);
</script>

<template>
  <slot v-if="failed" name="fallback">
    <ThumbnailFallback :class="$attrs.class" :style="$attrs.style as StyleValue" />
  </slot>
  <img v-else v-bind="$attrs" :src="src" alt="" @error="failed = true" />
</template>
