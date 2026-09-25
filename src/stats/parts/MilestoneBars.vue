<script setup lang="ts">
import { computed } from 'vue';

import type { MonthEstimate } from '@/lib/milestones';

/**
 * One member's subscriber count month by month in the list, estimated from
 * their milestones and drawn as bars the way the other series are (#225).
 *
 * The scale is this member's own, from zero (#134). A month with a known
 * count is solid; one interpolated between known counts is pale. A month
 * with no estimate has no bar at all rather than a bar of zero.
 */
const { estimates } = defineProps<{
  estimates: readonly (MonthEstimate | null)[];
}>();

const top = computed(() => Math.max(1, ...estimates.map((e) => e?.count ?? 0)));
</script>

<template>
  <span class="milestone-bars">
    <span v-for="(estimate, index) in estimates" :key="index" class="slot">
      <span
        v-if="estimate"
        class="bar"
        :data-recorded="estimate.recorded || undefined"
        :style="{ height: `${(estimate.count / top) * 100}%` }"
      ></span>
    </span>
  </span>
</template>

<style scoped>
.milestone-bars {
  --solid: var(--member-color, var(--k-accent));
  --pale: color-mix(in srgb, var(--member-color, var(--k-accent)) 32%, transparent);

  display: flex;
  align-items: flex-end;
  height: 26px;
  border-bottom: 1px solid var(--k-line-2);
}

.slot {
  display: flex;
  flex: 1 1 0;
  align-items: flex-end;
  justify-content: center;
  height: 100%;
  min-width: 0;
}

.bar {
  width: 76%;
  min-height: 1px;
  background: var(--pale);
}

.bar[data-recorded] {
  background: var(--solid);
}
</style>
