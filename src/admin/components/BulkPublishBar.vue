<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';

import { BULK_TEXT } from '../lib/bulk-publish';
import { wrappedFocusIndex } from '../lib/focus-trap';

/**
 * The bar under a list while rows are ticked in its select column, and the
 * confirmation before まとめて公開 (#285). `progress` is how far a run has
 * got, or null while none is running. The confirmation closes when the
 * rows it counted change under it - a reload left some out, or the page
 * became busy - so 公開 never acts on other rows than it named.
 *
 * The confirmation is modal for the keyboard too: it opens on キャンセル,
 * Tab stays among its buttons, Escape closes it, and closing puts the focus
 * back on まとめて公開.
 */
const props = defineProps<{ count: number; progress: { done: number; total: number } | null; disabled?: boolean }>();
const emit = defineEmits<{ publish: []; clear: [] }>();
// The count the confirmation names, or null while it is closed.
const confirming = ref<number | null>(null);
const opener = ref<HTMLButtonElement | null>(null);
const box = ref<HTMLDivElement | null>(null);
const cancelButton = ref<HTMLButtonElement | null>(null);

watch(
  () => [props.count, props.disabled] as const,
  ([count, disabled]) => {
    if (confirming.value !== null && (count !== confirming.value || disabled === true)) confirming.value = null;
  },
);

watch(confirming, async (count, before) => {
  await nextTick();

  if (count !== null) cancelButton.value?.focus();
  // Gone when a run took the bar's place, and left alone while disabled.
  else if (before !== null && opener.value !== null && !opener.value.disabled) opener.value.focus();
});

function confirm(): void {
  confirming.value = null;
  emit('publish');
}

function keepFocus(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault();
    confirming.value = null;

    return;
  }

  if (event.key !== 'Tab' || box.value === null) return;

  const buttons = [...box.value.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
  const next = wrappedFocusIndex(
    buttons.findIndex((button) => button === document.activeElement),
    buttons.length,
    event.shiftKey,
  );

  if (next === null) return;

  event.preventDefault();
  buttons[next]?.focus();
}
</script>

<template>
  <div v-if="count > 0 || progress" class="bulkbar">
    <span v-if="progress" class="num">{{ BULK_TEXT.progress(progress.done, progress.total) }}</span>
    <template v-else>
      <span class="num">{{ BULK_TEXT.ticked(count) }}</span>
      <button ref="opener" class="btn primary" type="button" :disabled="disabled" @click="confirming = count">
        {{ BULK_TEXT.publish }}
      </button>
      <button class="btn" type="button" @click="emit('clear')">{{ BULK_TEXT.clear }}</button>
    </template>
  </div>
  <div v-if="confirming !== null" class="picker" @mousedown.self="confirming = null">
    <div
      ref="box"
      class="picker-box"
      role="dialog"
      aria-modal="true"
      :aria-label="BULK_TEXT.publish"
      @keydown="keepFocus"
    >
      <div class="picker-head">{{ BULK_TEXT.confirmHead(confirming) }}</div>
      <div class="picker-foot">
        <button class="btn primary" type="button" @click="confirm">{{ BULK_TEXT.confirm }}</button>
        <button ref="cancelButton" class="btn" type="button" @click="confirming = null">
          {{ BULK_TEXT.cancel }}
        </button>
      </div>
    </div>
  </div>
</template>
