<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef } from 'vue';

import { axisMarks, DASH, formatCount, monthLabel, plotOf } from '../draw';
import type { SeriesDef } from '../model';

/**
 * The record panel's month-by-month chart.
 *
 * Pointing at it reads out one month rather than opening a tooltip, so the
 * same words are there for a reader who cannot hover: the readout above the
 * chart says the newest month until the pointer says otherwise.
 */
const { values, months, series } = defineProps<{
  values: readonly (number | null)[];
  months: readonly string[];
  series: SeriesDef;
}>();

const chart = useTemplateRef<SVGSVGElement>('chart');
const axis = useTemplateRef<HTMLElement>('axis');
const hover = ref(-1);
const axisWidth = ref(320);
let observer: ResizeObserver | undefined;

const plot = computed(() => plotOf(values, series.kind));
const marks = computed(() => axisMarks(months, axisWidth.value));

/** The last month that has a value, which is what the readout falls back to. */
const newest = computed(() => {
  for (let i = values.length - 1; i >= 0; i -= 1) if (values[i] !== null) return i;

  return -1;
});

const readAt = computed(() => (hover.value >= 0 && values[hover.value] !== null ? hover.value : newest.value));

const readout = computed(() => {
  const at = readAt.value;

  if (at < 0) return null;

  return { month: monthLabel(months[at] ?? ''), value: formatCount(values[at], series.decimals ?? 0) };
});

/**
 * The same numbers as a table, for a reader who cannot point at the chart.
 *
 * The chart reads one month out at a time under the pointer, which leaves a
 * keyboard or a screen reader with the newest month and nothing else. The
 * table is the whole series, one row per month, and it is the months already
 * on the chart rather than a second request.
 */
const caption = computed(() => `${series.label}の月ごとの値`);
const table = computed(() =>
  months.map((month, index) => {
    const value = values[index] ?? null;

    return {
      month: monthLabel(month),
      value: value === null ? '記録なし' : `${formatCount(value, series.decimals ?? 0)} ${series.unit}`,
    };
  }),
);

const scaleLabels = computed(() => {
  const decimals = series.decimals ?? 0;

  return [plot.value.top, (plot.value.top + plot.value.bottom) / 2, plot.value.bottom].map((v) =>
    formatCount(v, decimals),
  );
});

function onMove(event: PointerEvent) {
  const box = chart.value?.getBoundingClientRect();

  if (box === undefined || values.length === 0) return;

  const at = Math.floor(((event.clientX - box.left) / box.width) * values.length);

  hover.value = Math.min(values.length - 1, Math.max(0, at));
}

onMounted(() => {
  if (axis.value === null) return;

  axisWidth.value = axis.value.clientWidth || axisWidth.value;
  observer = new ResizeObserver(() => {
    axisWidth.value = axis.value?.clientWidth || axisWidth.value;
  });
  observer.observe(axis.value);
});

onBeforeUnmount(() => observer?.disconnect());
</script>

<template>
  <div class="month-chart">
    <p class="readout n">
      <template v-if="readout"
        >{{ readout.month }} <b>{{ readout.value }}</b> {{ series.unit }}</template
      >
      <template v-else>{{ DASH }}</template>
    </p>
    <div class="plot">
      <div class="scale n">
        <span v-for="(label, i) in scaleLabels" :key="i">{{ label }}</span>
      </div>
      <svg
        ref="chart"
        class="chart"
        :viewBox="`0 0 ${plot.width} ${plot.height}`"
        preserveAspectRatio="none"
        role="img"
        :aria-label="`${series.label}の月ごとの推移`"
        @pointermove="onMove"
        @pointerleave="hover = -1"
      >
        <line v-for="y in [25, 50, 75]" :key="y" class="grid" x1="0" :y1="y" :x2="plot.width" :y2="y" />
        <template v-if="series.kind === 'level'">
          <path v-if="plot.area" class="area" :d="plot.area" />
          <path v-if="plot.line" class="line" :d="plot.line" />
        </template>
        <rect
          v-for="bar in plot.bars"
          :key="bar.index"
          class="bar"
          :class="{ pointed: bar.index === readAt }"
          :x="bar.x"
          :y="bar.y"
          :width="bar.width"
          :height="bar.height"
        />
        <line class="base" x1="0" :y1="plot.baseline" :x2="plot.width" :y2="plot.baseline" />
      </svg>
    </div>
    <div class="reader-only">
      <table>
        <caption>
          {{
            caption
          }}
        </caption>
        <tbody>
          <tr v-for="row in table" :key="row.month">
            <th scope="row">{{ row.month }}</th>
            <td>{{ row.value }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <div ref="axis" class="axis">
      <span
        v-for="mark in marks"
        :key="mark.label"
        :style="{ left: `${mark.left}%` }"
        :data-edge="mark.edge"
        class="n"
        >{{ mark.label }}</span
      >
    </div>
  </div>
</template>

<style scoped>
.month-chart {
  display: grid;
  gap: 6px;
}

/* Read out but never drawn: the chart above is the same numbers for everyone
   who can see it, so showing the table as well would be the page said twice. */
.reader-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

.readout {
  margin: 0;
  color: var(--k-text-2);
  font-size: 12px;
  text-align: right;
}

.readout b {
  font-weight: 600;
}

.plot {
  display: grid;
  grid-template-columns: 52px minmax(0, 1fr);
  gap: 6px;
}

.scale {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  justify-content: space-between;
  padding-bottom: 1px;
  color: var(--k-text-3);
  font-size: 10.5px;
}

.chart {
  display: block;
  width: 100%;
  height: 232px;
  border-bottom: 1px solid var(--k-line-2);
  border-left: 1px solid var(--k-line-2);
  border-radius: 2px 2px 0 0;
  background: var(--k-sunken);
  touch-action: pan-y;
}

.grid {
  stroke: var(--k-line);
  stroke-width: 1px;
  vector-effect: non-scaling-stroke;
}

.bar {
  fill: var(--member-color, var(--k-accent));
}

.bar.pointed {
  fill: var(--member-accent, var(--k-accent));
}

.area {
  fill: var(--member-color, var(--k-accent));
  opacity: 0.2;
}

.line {
  fill: none;
  stroke: var(--member-color, var(--k-accent));
  stroke-width: 2px;
  vector-effect: non-scaling-stroke;
}

.base {
  stroke: var(--k-line-2);
  stroke-width: 1px;
  vector-effect: non-scaling-stroke;
}

.axis {
  position: relative;
  height: 15px;
  margin-left: 58px;
  overflow: hidden;
}

.axis span {
  position: absolute;
  top: 0;
  transform: translateX(-50%);
  color: var(--k-text-3);
  font-size: 10.5px;
  white-space: nowrap;
}

.axis span[data-edge='left'] {
  transform: none;
}

.axis span[data-edge='right'] {
  transform: translateX(-100%);
}

@container (max-width: 620px) {
  .chart {
    height: 214px;
  }
}

@container (max-width: 560px) {
  .plot {
    grid-template-columns: 44px minmax(0, 1fr);
  }

  .axis {
    margin-left: 50px;
  }
}

@container (max-width: 430px) {
  .chart {
    height: 200px;
  }
}
</style>
