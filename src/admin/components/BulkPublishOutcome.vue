<script setup lang="ts" generic="T">
import { computed, onMounted, ref } from 'vue';

import { BULK_TEXT, outcomeSummary, type BulkPublishOutcome } from '../lib/bulk-publish';

/**
 * What the last まとめて公開 did, under the list where its bar was, until it
 * is closed (#237, #285). The table above keeps its place. `describe` names
 * a row the way the list shows it.
 *
 * It takes the focus when it opens on a focus that was lost - the run's
 * progress, which BulkPublishBar.vue focused, went away with the run - and
 * leaves it where it is otherwise.
 */
const props = defineProps<{
  outcome: BulkPublishOutcome<T>;
  describe: (row: T) => string;
  keyOf: (row: T) => string | number;
}>();
const emit = defineEmits<{ close: [] }>();
const summary = computed(() => outcomeSummary(props.outcome));
const root = ref<HTMLDivElement | null>(null);

onMounted(() => {
  if (document.activeElement === null || document.activeElement === document.body) root.value?.focus();
});
</script>

<template>
  <div ref="root" class="bulk-outcome" role="status" tabindex="-1">
    <div class="bulk-outcome-head">
      <b>{{ summary.heading }}</b>
      <span class="num">{{ BULK_TEXT.published(summary.published) }}</span>
      <span class="num">{{ BULK_TEXT.failed(summary.failed) }}</span>
      <span class="num">{{ BULK_TEXT.alreadyPublished(summary.alreadyPublished) }}</span>
      <span v-if="summary.untried > 0" class="num">{{ BULK_TEXT.untried(summary.untried) }}</span>
      <span class="grow"></span>
      <button class="btn quiet" type="button" @click="emit('close')">{{ BULK_TEXT.close }}</button>
    </div>
    <template v-if="summary.failedRows.length > 0">
      <div class="hint">{{ BULK_TEXT.failedRows }}</div>
      <ul>
        <li v-for="s in summary.failedRows" :key="keyOf(s.row)">
          <span>{{ describe(s.row) }}</span>
          <span class="sub">{{ s.reason }}</span>
        </li>
      </ul>
    </template>
  </div>
</template>

<style scoped>
/* Under the table, as the bar is: the table keeps its place and only grows shorter. */
.bulk-outcome {
  display: grid;
  gap: 6px;
  max-height: 160px;
  padding: 8px 20px;
  overflow: auto;
  border-top: 1px solid var(--k-line);
  background: var(--k-surface-2);
}

.bulk-outcome-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 12px;
}

.bulk-outcome-head .grow {
  flex: 1 1 auto;
}

ul {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 4px;
  font-size: var(--a-small);
}

li {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

li .sub {
  overflow-wrap: anywhere;
}
</style>
