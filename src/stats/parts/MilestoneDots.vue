<script setup lang="ts">
import { computed } from 'vue';

import { axisFraction } from '@/lib/milestones';
import type { SubscriberMilestone } from '@/type/api';

/**
 * One row's milestones, drawn small in the list (#225).
 *
 * The same line of time the sum's record shows, without the counts: the
 * list's cell is too narrow to write them, and the row opens the record
 * where they are written. Hidden from a screen reader for the same reason
 * the list's other small charts are.
 */
const { milestones, months } = defineProps<{
  milestones: readonly SubscriberMilestone[];
  months: readonly string[];
}>();

const dots = computed(() =>
  milestones.map((milestone) => ({
    id: milestone.milestoneId,
    listener: milestone.announcedBy === 'listener',
    left: `${axisFraction(milestone.reachedDate, months) * 100}%`,
  })),
);
</script>

<template>
  <span class="milestone-dots" aria-hidden="true">
    <span class="rule"></span>
    <span
      v-for="dot in dots"
      :key="dot.id"
      class="dot"
      :class="{ listener: dot.listener }"
      :style="{ left: dot.left }"
    ></span>
  </span>
</template>

<style scoped>
.milestone-dots {
  display: block;
  position: relative;
  height: 26px;
  margin-inline: 4px;
}

.rule {
  position: absolute;
  top: 50%;
  right: 0;
  left: 0;
  height: 1px;
  background: var(--k-line-2);
}

.dot {
  box-sizing: border-box;
  position: absolute;
  top: 50%;
  width: 7px;
  height: 7px;
  border: 1px solid var(--member-accent, var(--member-color, var(--k-accent)));
  border-radius: 50%;
  background: var(--member-color, var(--k-accent));
  transform: translate(-50%, -50%);
}

.dot.listener {
  border: 1.5px solid var(--member-color, var(--k-accent));
  background: var(--k-surface);
}
</style>
