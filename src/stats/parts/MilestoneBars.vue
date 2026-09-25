<script setup lang="ts">
import { computed } from 'vue';

import type { MonthEstimate } from '@/lib/milestones';

/**
 * One member's subscriber count month by month, estimated from their
 * milestones and drawn as bars the way the other series are (#225).
 *
 * The scale is this member's own, from zero (#134). A month with a known
 * count is solid; one interpolated between known counts is pale; a month
 * after the member's activity ended is striped, solid or pale the same way.
 * A month with nothing known has no bar at all rather than a bar of zero.
 *
 * Drawn in HTML rather than SVG so the stripes keep their angle whatever
 * width the row is stretched to.
 */
const { estimates, small = false } = defineProps<{
  estimates: readonly (MonthEstimate | null)[];
  /** The list's cell rather than a row of the record. */
  small?: boolean;
}>();

const top = computed(() => Math.max(1, ...estimates.map((e) => e?.count ?? 0)));
</script>

<template>
  <span class="milestone-bars" :class="{ small }">
    <span v-for="(estimate, index) in estimates" :key="index" class="slot">
      <span
        v-if="estimate"
        class="bar"
        :data-recorded="estimate.recorded || undefined"
        :data-after-end="estimate.afterEnd || undefined"
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
  height: 30px;
  border-bottom: 1px solid var(--k-line-2);
}

.milestone-bars.small {
  height: 26px;
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

.bar[data-after-end] {
  background: repeating-linear-gradient(135deg, var(--pale) 0 2px, transparent 2px 4px);
}

.bar[data-after-end][data-recorded] {
  background: repeating-linear-gradient(135deg, var(--solid) 0 2px, transparent 2px 4px);
}
</style>
