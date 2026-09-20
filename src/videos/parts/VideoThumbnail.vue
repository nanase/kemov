<script setup lang="ts">
import { computed, ref, watch } from 'vue';

import { relayVideoThumbnailURL } from '@/lib/relay';
import type { ThumbnailSize } from '@/lib/youtube';

/**
 * One video's thumbnail, with something to show when it does not arrive.
 *
 * Two different failures share this component, and are told apart by how
 * they are retried:
 *
 * - YouTube answers some requests with 429 when a page asks for many
 *   thumbnails at once, and the image relay (`@/lib/relay`) passes that on -
 *   the same failure `@/parts/MemberAvatar.vue` retries once.
 * - `maxresdefault` (`size="max"`) simply does not exist for every video.
 *   That failure is not a rate limit and waiting does not fix it, so it steps
 *   down to `hqdefault` immediately and without a retry of its own - the one
 *   size #135 says to fall back to.
 */
const {
  videoId,
  size,
  fit = 'cover',
} = defineProps<{
  videoId: string;
  size: ThumbnailSize;
  /**
   * 'cover' fills its box and crops, for the list and the record panel's own
   * hero image. 'contain' never stretches or crops - the lightbox's own rule
   * (#135): a fallback that is not 16:9 is shown whole rather than cropped
   * into looking like one.
   */
  fit?: 'cover' | 'contain';
}>();

/**
 * How long to wait before the one retry. It covers a dropped connection. A
 * refusal from YouTube is kept by the relay for a while, so asking again this
 * soon meets the same answer.
 */
const RETRY_MS = 1500;

const errors = ref(0);
/** Bumped to ask again: the element is rebuilt, so the browser re-requests. */
const token = ref(0);
const failed = ref(false);
/** `max` stepped down to `hq` once, because it does not exist for this video. */
const steppedDown = ref(false);

watch(
  () => [videoId, size],
  () => {
    errors.value = 0;
    token.value = 0;
    failed.value = false;
    steppedDown.value = false;
  },
);

const effectiveSize = computed<ThumbnailSize>(() => (size === 'max' && steppedDown.value ? 'hq' : size));
const shown = computed(() => (failed.value ? null : relayVideoThumbnailURL(videoId, effectiveSize.value)));

function onError() {
  if (size === 'max' && !steppedDown.value) {
    steppedDown.value = true;

    return;
  }

  errors.value += 1;

  // The first failure buys one more try, after a wait. The second settles it:
  // asking a third time would be the page adding to the load that refused it.
  if (errors.value > 1) {
    failed.value = true;

    return;
  }

  window.setTimeout(() => {
    token.value += 1;
  }, RETRY_MS);
}
</script>

<template>
  <img
    v-if="shown"
    :key="token"
    class="thumbnail"
    :class="fit"
    :src="shown"
    alt=""
    loading="lazy"
    decoding="async"
    @error="onError"
  />
  <div v-else class="thumbnail none" :class="fit" aria-hidden="true">—</div>
</template>

<style scoped>
.thumbnail {
  display: block;
  border-radius: 4px;
  border: 1px solid var(--k-line);
  background: var(--k-sunken);
}

.thumbnail.cover {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* Never stretched or cropped: a fallback size that is not 16:9 is shown
   whole, at up to its own box, rather than cropped into looking like one. */
.thumbnail.contain {
  max-width: 100%;
  max-height: 100%;
  width: auto;
  height: auto;
  margin: auto;
}

.thumbnail.none {
  display: flex;
  align-items: center;
  justify-content: center;
  border-style: dotted;
  color: var(--k-text-3);
  font-size: 10px;
}

/* The fallback div has no intrinsic size of its own to contain within, so
   'contain' here means a reasonable 16:9 box rather than a collapsed one. */
.thumbnail.none.contain {
  width: 100%;
  aspect-ratio: 16 / 9;
}
</style>
