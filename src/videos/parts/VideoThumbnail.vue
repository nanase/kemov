<script setup lang="ts">
import { computed, ref, watch } from 'vue';

import { getThumbnailURL, type ThumbnailSize } from '@/lib/youtube';

/**
 * One video's thumbnail, with something to show when it does not arrive.
 *
 * Two different failures share this component, and are told apart by how
 * they are retried:
 *
 * - YouTube's image host answers some requests with 429 when a page asks for
 *   many thumbnails at once - the same failure `MemberAvatar.vue` retries
 *   once, after a wait long enough for the rate limit to pass.
 * - `maxresdefault` (`size="max"`) simply does not exist for every video.
 *   That failure is not a rate limit and waiting does not fix it, so it steps
 *   down to `hqdefault` immediately and without a retry of its own - the one
 *   size #135 says to fall back to.
 */
const { videoId, size } = defineProps<{
  videoId: string;
  size: ThumbnailSize;
}>();

/** How long to wait before the one 429 retry. Long enough for a rate limit to pass. */
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
const shown = computed(() => (failed.value ? null : getThumbnailURL(videoId, { size: effectiveSize.value })));

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
    :src="shown"
    alt=""
    loading="lazy"
    decoding="async"
    @error="onError"
  />
  <div v-else class="thumbnail none" aria-hidden="true">—</div>
</template>

<style scoped>
.thumbnail {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: 4px;
  border: 1px solid var(--k-line);
  background: var(--k-sunken);
  object-fit: cover;
}

.thumbnail.none {
  display: flex;
  align-items: center;
  justify-content: center;
  border-style: dotted;
  color: var(--k-text-3);
  font-size: 10px;
}
</style>
