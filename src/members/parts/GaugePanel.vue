<script setup lang="ts">
import { computed } from 'vue';

import SparkLine from '@/stats/parts/SparkLine.vue';
import { formatCount } from '@/stats/draw';

import { formatLength, formatRate } from '../draw';
import { GAUGES, gaugeChange, gaugeSeries, gaugeValue, type WindowTotals } from '../model';
import type { ChannelMonths } from '@/type/api';

/**
 * The last ninety days, six measures at a time.
 *
 * Every gauge is built the same way - the figure, how it compares with the
 * ninety days before it, the whole history as a thin line, and what the
 * previous ninety days actually were - so that no measure looks more
 * important than another. The comparison is never coloured: streaming less
 * this quarter is not a failure, and green and red would say it was (#136).
 */
const { current, previous, months, window } = defineProps<{
  current: WindowTotals;
  previous: WindowTotals;
  /** This member's own month-by-month series, or null while it is on its way. */
  months: ChannelMonths | null;
  /** Which days the two windows covered, written out. */
  window: string;
}>();

function write(id: (typeof GAUGES)[number]['id'], kind: string, value: number | null): string {
  if (value === null) return '—';
  if (kind === 'duration') return formatLength(value);
  if (kind === 'rate') return formatRate(value);

  return formatCount(value);
}

const gauges = computed(() =>
  GAUGES.map((gauge) => {
    const value = gaugeValue(gauge.id, current);
    const change = gaugeChange(value, gaugeValue(gauge.id, previous));

    return {
      id: gauge.id,
      label: gauge.label,
      unit: gauge.unit,
      value: write(gauge.id, gauge.kind, value),
      change: change === null ? '—' : change === 0 ? '±0%' : `${change > 0 ? '▲ +' : '▼ −'}${Math.abs(change)}%`,
      series: months === null ? [] : gaugeSeries(months, gauge.id),
      previous: write(gauge.id, gauge.kind, gaugeValue(gauge.id, previous)),
    };
  }),
);

const hasSeries = (series: readonly (number | null)[]) => series.some((value) => value !== null);
</script>

<template>
  <div class="mv-panel">
    <div class="mv-head">
      <b>90 日の動き</b>
      <span class="mv-n">{{ window }}</span>
    </div>
    <div class="mv-body">
      <div class="gauges">
        <div v-for="gauge in gauges" :key="gauge.id" class="gauge">
          <div class="key">
            <span class="name">{{ gauge.label }}</span>
            <span class="change mv-n">{{ gauge.change }}</span>
          </div>
          <div class="value mv-n">
            {{ gauge.value }}<small v-if="gauge.unit"> {{ gauge.unit }}</small>
          </div>
          <SparkLine v-if="hasSeries(gauge.series)" class="line" :values="gauge.series" kind="flow" />
          <div v-else class="none">記録がありません</div>
          <div class="previous mv-n">前の 90 日 {{ gauge.previous }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.gauges {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.gauge {
  min-width: 0;
  padding: 6px 9px 7px;
  border: 1px solid var(--k-line);
  border-radius: 6px;
  background: var(--k-sunken);
}

.key {
  display: flex;
  gap: 6px;
  align-items: baseline;
  color: var(--k-text-3);
  font-size: 10.5px;
}

.name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Never coloured by its direction: more or less activity is not better or
   worse, and a green rise would say otherwise (#136). */
.change {
  flex: none;
  margin-left: auto;
  color: var(--k-text-2);
  font-size: 10.5px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.value {
  overflow: hidden;
  font-size: 20px;
  font-weight: 600;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.value small {
  color: var(--k-text-3);
  font-size: 11px;
  font-weight: 400;
}

.line {
  display: block;
  width: 100%;
  height: 26px;
  color: var(--mv-bar);
}

.line :deep(.bar) {
  fill: var(--mv-bar);
}

/* The line's place is kept, so a gauge without a history is the same height
   as one with it and the row does not go ragged. */
.none {
  display: flex;
  align-items: flex-end;
  height: 26px;
  border-bottom: 1px dotted var(--k-line-2);
  color: var(--k-text-3);
  font-size: 10.5px;
}

.previous {
  overflow: hidden;
  color: var(--k-text-3);
  font-size: 10.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@container (max-width: 720px) {
  .gauges {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
