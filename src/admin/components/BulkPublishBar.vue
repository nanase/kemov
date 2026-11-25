<script setup lang="ts">
import { ref, watch } from 'vue';

import { BULK_TEXT } from '../lib/bulk-publish';

/**
 * The bar under a list while rows are ticked in its select column, and the
 * confirmation before まとめて公開 (#285). `progress` is how far a run has
 * got, or null while none is running. The confirmation closes when the
 * rows it counted change under it - a reload left some out, or the page
 * became busy - so 公開 never acts on other rows than it named.
 */
const props = defineProps<{ count: number; progress: { done: number; total: number } | null; disabled?: boolean }>();
const emit = defineEmits<{ publish: []; clear: [] }>();
// The count the confirmation names, or null while it is closed.
const confirming = ref<number | null>(null);

watch(
  () => [props.count, props.disabled] as const,
  ([count, disabled]) => {
    if (confirming.value !== null && (count !== confirming.value || disabled === true)) confirming.value = null;
  },
);

function confirm(): void {
  confirming.value = null;
  emit('publish');
}
</script>

<template>
  <div v-if="count > 0 || progress" class="bulkbar">
    <span v-if="progress" class="num">{{ BULK_TEXT.progress(progress.done, progress.total) }}</span>
    <template v-else>
      <span class="num">{{ BULK_TEXT.ticked(count) }}</span>
      <button class="btn primary" type="button" :disabled="disabled" @click="confirming = count">
        {{ BULK_TEXT.publish }}
      </button>
      <button class="btn" type="button" @click="emit('clear')">{{ BULK_TEXT.clear }}</button>
    </template>
  </div>
  <div v-if="confirming !== null" class="picker" @mousedown.self="confirming = null">
    <div class="picker-box" role="dialog" :aria-label="BULK_TEXT.publish">
      <div class="picker-head">{{ BULK_TEXT.confirmHead(confirming) }}</div>
      <div class="picker-foot">
        <button class="btn primary" type="button" @click="confirm">{{ BULK_TEXT.confirm }}</button>
        <button class="btn" type="button" @click="confirming = null">{{ BULK_TEXT.cancel }}</button>
      </div>
    </div>
  </div>
</template>
