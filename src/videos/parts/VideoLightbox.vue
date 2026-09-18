<script setup lang="ts">
import { onBeforeUnmount, onMounted, useTemplateRef } from 'vue';

import VideoThumbnail from './VideoThumbnail.vue';

/**
 * The dialog a thumbnail opens into: `maxresdefault`, the one place #135's
 * body asks for the highest resolution, stepping down to `hqdefault` on its
 * own inside `VideoThumbnail.vue` for a video that does not have one.
 *
 * Closes on Esc, on the backdrop, or on its own button - #135's three ways.
 */
const { videoId, title } = defineProps<{
  videoId: string;
  title: string;
}>();

const emit = defineEmits<{ close: [] }>();

const closeButton = useTemplateRef<HTMLButtonElement>('closeButton');

/** The element Tab should return focus to once this closes - the thumbnail button that opened it. */
let opener: HTMLElement | null = null;

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault();
    emit('close');
    return;
  }

  // The close button is the dialog's only focusable element, so trapping
  // Tab here means keeping focus on it rather than cycling between several -
  // there is nothing else inside to cycle to.
  if (event.key === 'Tab') {
    event.preventDefault();
    closeButton.value?.focus({ preventScroll: true });
  }
}

onMounted(() => {
  opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  document.addEventListener('keydown', onKeydown);
  // The thumbnail that opened this is already visible behind it, so nothing
  // needs to scroll into view - only the focus needs to move.
  closeButton.value?.focus({ preventScroll: true });
});

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown);
  opener?.focus({ preventScroll: true });
});
</script>

<template>
  <div class="lightbox">
    <div class="scrim" @click="emit('close')"></div>
    <div class="lbox" role="dialog" aria-modal="true" aria-labelledby="videos-lightbox-title">
      <div class="lbimg">
        <VideoThumbnail :video-id="videoId" size="max" fit="contain" />
      </div>
      <div class="lbfoot">
        <span id="videos-lightbox-title" class="lbtitle">{{ title }}</span>
        <button ref="closeButton" type="button" class="lbclose" @click="emit('close')">閉じる</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.lightbox {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: grid;
  place-items: center;
  padding: 16px;
}

.scrim {
  position: absolute;
  inset: 0;
  background: var(--k-scrim);
}

.lbox {
  position: relative;
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  max-width: min(1280px, 100%);
  max-height: 100%;
  background: var(--k-surface);
  border: 1px solid var(--k-line-2);
  border-radius: 8px;
  box-shadow: 0 24px 50px -20px rgb(14 31 28 / 60%);
  overflow: hidden;
}

.lbimg {
  display: flex;
  max-height: calc(100vh - 100px);
  background: var(--k-sunken);
}

.lbfoot {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 8px 6px 12px;
  border-top: 1px solid var(--k-line);
  font-size: 12px;
}

.lbtitle {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--k-text-2);
}

.lbclose {
  margin-left: auto;
  flex: 0 0 auto;
  font: inherit;
  font-size: 11.5px;
  padding: 3px 10px;
  border: 1px solid var(--k-line-2);
  border-radius: 5px;
  background: var(--k-surface);
  color: var(--k-text-2);
  cursor: pointer;
}

.lbclose:hover {
  border-color: var(--k-accent);
  color: var(--k-text);
}
</style>
