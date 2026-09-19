<script setup lang="ts">
import { formatCount } from '@/lib/numberFormat';
import { changeSign, formatChange } from '../draw';
import { deltaOf, METRICS, periodLabel, valueOf, type PeriodId, type Subject } from '../model';

/**
 * The four numbers for everybody at once.
 *
 * They sit above the list rather than inside the record panel, so that they
 * stay on screen whichever member is open - and so that minimal display,
 * which closes the panel, still has them.
 */
const { total, period } = defineProps<{
  total: Subject;
  period: PeriodId;
}>();
</script>

<template>
  <div class="totals">
    <div v-for="metric in METRICS" :key="metric.id">
      <span class="key">{{ metric.head }}</span>
      <span class="value n">{{ formatCount(valueOf(total, metric.id)) }}</span>
      <span class="change n" :data-sign="changeSign(deltaOf(total, metric.id, period)?.value)">
        <template v-if="deltaOf(total, metric.id, period)">
          {{ periodLabel(period) }} {{ formatChange(deltaOf(total, metric.id, period)?.value) }}
        </template>
      </span>
    </div>
  </div>
</template>

<style scoped>
.totals {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1px;
  overflow: hidden;
  border: 1px solid var(--k-line);
  border-radius: 8px;
  background: var(--k-line);
}

.totals > div {
  display: grid;
  gap: 1px;
  padding: 7px 10px;
  background: var(--k-surface);
}

.key {
  color: var(--k-text-3);
  font-size: 10.5px;
  letter-spacing: 0.06em;
}

.value {
  font-size: 15px;
  font-weight: 500;
}

.change {
  min-height: 16px;
  font-size: 11px;
}

.change[data-sign='pos'] {
  color: var(--k-ok);
}

.change[data-sign='neg'] {
  color: var(--k-warn);
}

.change[data-sign='zero'] {
  color: var(--k-line-2);
}

@container (max-width: 560px) {
  .totals {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
