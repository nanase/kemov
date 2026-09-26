<script setup lang="ts">
import { pointName } from '@/lib/milestones';
import type { SubscriberMilestone } from '@/type/api';

/**
 * One milestone's point, pressable.
 *
 * A filled dot for what a member or the project announced and a hollow one
 * for a listener's post (#225). The button is larger than the dot, so the
 * point can be hit with a finger; the chart places it by its centre.
 */
const { milestone, expanded, controls } = defineProps<{
  milestone: SubscriberMilestone;
  expanded: boolean;
  /** The id of the card this point opens. */
  controls: string;
}>();

const emit = defineEmits<{ press: [event: MouseEvent] }>();
</script>

<template>
  <button
    type="button"
    class="milestone-point"
    :data-by="milestone.announcedBy"
    :aria-label="pointName(milestone)"
    :aria-expanded="expanded"
    :aria-controls="controls"
    @click="emit('press', $event)"
  ></button>
</template>

<style scoped>
.milestone-point {
  position: absolute;
  z-index: 2;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: none;
  cursor: pointer;
  transform: translate(-50%, -50%);
}

.milestone-point::after {
  content: '';
  box-sizing: border-box;
  position: absolute;
  top: 50%;
  left: 50%;
  width: 10px;
  height: 10px;
  border: 1.5px solid var(--member-accent, var(--k-accent));
  border-radius: 50%;
  background: var(--member-color, var(--k-accent));
  transform: translate(-50%, -50%);
}

.milestone-point[data-by='listener']::after {
  width: 9px;
  height: 9px;
  border: 2px solid var(--member-color, var(--k-accent));
  background: var(--k-surface);
}

.milestone-point:hover::after,
.milestone-point[aria-expanded='true']::after {
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--member-color, var(--k-accent)) 30%, transparent);
}

.milestone-point:focus-visible {
  outline: 2px solid var(--k-accent);
  outline-offset: -4px;
}
</style>
