<script setup lang="ts">
import { computed } from 'vue';

import { plotOf } from '../draw';

/**
 * One row's month-by-month shape, drawn small.
 *
 * The scale is the row's own, so the chart says how this member's months
 * compare with each other and nothing at all about anybody else's (#134).
 */
const { values, kind } = defineProps<{
  values: readonly (number | null)[];
  kind: 'flow' | 'level';
}>();

const plot = computed(() => plotOf(values, kind, 0.8));
</script>

<template>
  <svg class="spark" :viewBox="`0 0 ${plot.width} ${plot.height}`" preserveAspectRatio="none" aria-hidden="true">
    <template v-if="kind === 'level'">
      <path v-if="plot.area" class="area" :d="plot.area" />
      <path v-if="plot.line" class="line" :d="plot.line" />
    </template>
    <rect
      v-for="bar in plot.bars"
      :key="bar.index"
      class="bar"
      :x="bar.x"
      :y="bar.y"
      :width="bar.width"
      :height="bar.height"
    />
    <line class="base" x1="0" :y1="plot.baseline" :x2="plot.width" :y2="plot.baseline" />
  </svg>
</template>

<style scoped>
.spark {
  display: block;
  width: 100%;
  height: 26px;
}

.bar {
  fill: var(--member-color, var(--k-accent));
}

.area {
  fill: var(--member-color, var(--k-accent));
  opacity: 0.22;
}

.line {
  fill: none;
  stroke: var(--member-color, var(--k-accent));
  stroke-width: 1.5px;
  vector-effect: non-scaling-stroke;
}

.base {
  stroke: var(--k-line-2);
  stroke-width: 1px;
  vector-effect: non-scaling-stroke;
}
</style>
