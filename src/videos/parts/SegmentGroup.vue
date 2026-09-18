<script setup lang="ts">
/**
 * One row of choices, of which exactly one is taken.
 *
 * Buttons with `aria-pressed` rather than radio inputs: these switch what the
 * page is showing right now, the way a tab strip does, and there is no form
 * to submit them with.
 *
 * Kept identical to `/stats/`'s `src/stats/parts/SegmentGroup.vue` (#161, not
 * yet on main) so the two can be pointed at one shared copy once it merges.
 */
const { items, value, label } = defineProps<{
  items: readonly { id: string; label: string; title?: string }[];
  value: string;
  label: string;
}>();

const emit = defineEmits<{ pick: [id: string] }>();
</script>

<template>
  <div class="segments" role="group" :aria-label="label">
    <button
      v-for="item in items"
      :key="item.id"
      type="button"
      :aria-pressed="item.id === value"
      :title="item.title"
      @click="emit('pick', item.id)"
    >
      {{ item.label }}
    </button>
  </div>
</template>

<style scoped>
.segments {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 2px;
  padding: 2px;
  border: 1px solid var(--k-line);
  border-radius: 6px;
  background: var(--k-surface-2);
}

button {
  padding: 3px 9px;
  border: 0;
  border-radius: 4px;
  background: none;
  color: var(--k-text-2);
  font: inherit;
  font-size: 12px;
  white-space: nowrap;
  cursor: pointer;
}

button:hover {
  background: var(--k-accent-soft);
  color: var(--k-accent);
}

button[aria-pressed='true'] {
  background: var(--k-accent);
  color: var(--k-on-accent);
  font-weight: 600;
}
</style>
