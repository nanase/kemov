<script setup lang="ts">
import { computed, ref, watch } from 'vue';

import { memberColor } from '../draw';

/**
 * One member's picture, with something to show when it does not arrive.
 *
 * YouTube's image host answers some of these with 429 when a page asks for
 * eleven of them at once, and the browser then blocks the response as a
 * non-image. Which ones fail changes from load to load, so the page cannot
 * know in advance and has to be able to draw a member without their picture.
 *
 * What it draws instead is the member's own colour and the first character of
 * their name, at the same size and full strength. A member who has finished
 * must never be the faded one on the page (#134), and that holds whether or
 * not their picture loaded.
 */
const { src, name, color, size, dark } = defineProps<{
  src: string | null;
  name: string;
  /** The member's own colour, or null for the sum. */
  color: string | null;
  size: number;
  dark: boolean;
}>();

/** How long to wait before the one retry. Long enough for a rate limit to pass. */
const RETRY_MS = 1500;

const errors = ref(0);
/** Bumped to ask again: the element is rebuilt, so the browser re-requests. */
const token = ref(0);
const failed = ref(false);

watch(
  () => src,
  () => {
    errors.value = 0;
    token.value = 0;
    failed.value = false;
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

  window.setTimeout(() => {
    token.value += 1;
  }, RETRY_MS);
}

const shown = computed(() => (src === null || failed.value ? null : src));
const initial = computed(() => [...name][0] ?? '');
const style = computed(() => ({
  width: `${size}px`,
  height: `${size}px`,
  '--avatar-color': color === null ? 'var(--k-accent)' : memberColor(color, dark),
  '--avatar-font': `${Math.max(9, Math.round(size * 0.46))}px`,
}));
</script>

<template>
  <img
    v-if="shown"
    :key="token"
    class="avatar"
    :src="shown"
    :style="style"
    alt=""
    :width="size"
    :height="size"
    loading="lazy"
    decoding="async"
    @error="onError"
  />
  <span v-else class="avatar stand-in" :style="style" :title="name" aria-hidden="true">{{ initial }}</span>
</template>

<style scoped>
.avatar {
  display: block;
  flex: none;
  border-radius: 50%;
  object-fit: cover;
}

.stand-in {
  display: grid;
  place-items: center;
  box-shadow: inset 0 0 0 1.5px var(--avatar-color);
  background: var(--k-surface-2);
  color: var(--avatar-color);
  font-size: var(--avatar-font);
  font-weight: 700;
  line-height: 1;
  user-select: none;
}
</style>
