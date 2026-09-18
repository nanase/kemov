<script setup lang="ts">
import { computed } from 'vue';

import { formatCount } from '@/lib/numberFormat';

import { bandLabel, eachWord, formatLength, formatPercent, formatRate, hourName, topWords, weekdayName } from '../draw';
import type { Shape } from '../model';

/**
 * Nine things about how this member streams, and nothing about anyone else.
 *
 * "よく始める時刻" is the busiest single hour and "よく配信する時間帯" the
 * busiest stretch of six: somebody with a morning peak inside an evening
 * stretch would look self-contradictory if both were squeezed into one cell
 * (#136). Where several hours or weekdays tie, the tie is what gets written.
 */
const { shape, name } = defineProps<{
  shape: Shape;
  /** Whose shape this is. The panel's heading carries the name (#136). */
  name: string;
}>();

const cells = computed(() => {
  const startHour = topWords(shape.startHour, hourName, '時台');
  const endHour = topWords(shape.endHour, hourName, '時台');
  const weekday = topWords(shape.weekday, weekdayName, '曜');

  return [
    {
      key: 'よく始める時刻',
      value: startHour.value,
      unit: startHour.unit,
      note: `${formatCount(shape.streams)} 本のうち ${eachWord(shape.startHour)}${formatCount(shape.startHour.max)} 本`,
    },
    {
      key: 'よく配信する時間帯',
      value: bandLabel(shape.bandFrom),
      unit: '',
      note: `この 6 時間に ${formatPercent(shape.bandCount, shape.streams)} %`,
    },
    {
      key: 'よく終わる時刻',
      value: endHour.value,
      unit: endHour.unit,
      note: `日またぎ ${formatPercent(shape.overnight, shape.streams)} %`,
    },
    {
      key: '配信時間の中央値',
      value: formatLength(shape.medianMinutes * 60),
      unit: '',
      note: `1〜2 時間が ${formatPercent(shape.oneToTwoHours, shape.streams)} %`,
    },
    {
      key: '長い配信',
      value: formatPercent(shape.longStreams, shape.streams),
      unit: '%',
      note: `3 時間以上が ${formatCount(shape.longStreams)} 本`,
    },
    {
      key: '配信の平均間隔',
      value: formatRate(shape.daysPerStream),
      unit: '日に 1 回',
      // The same division written the other way round, so that seven divided
      // by one is always the other (#136).
      note: `週 ${formatRate(shape.perWeek)} 回`,
    },
    {
      key: '配信が多い曜日',
      value: weekday.value,
      unit: weekday.unit,
      note: `${eachWord(shape.weekday)}${formatCount(shape.weekday.max)} 本 ・ 全体の ${formatPercent(shape.weekday.max, shape.streams)} %`,
    },
    {
      key: '配信した日',
      value: formatCount(shape.daysStreamed),
      unit: '日',
      note: `${formatCount(shape.spanDays)} 日のうち ${formatPercent(shape.daysStreamed, shape.spanDays)} %`,
    },
    {
      key: '配信した週',
      value: formatCount(shape.weeksStreamed),
      unit: '週',
      note: `${formatCount(shape.spanWeeks)} 週のうち ${formatPercent(shape.weeksStreamed, shape.spanWeeks)} %`,
    },
  ];
});
</script>

<template>
  <div class="mv-panel">
    <div class="mv-head">
      <b>{{ name }}のかたち</b>
    </div>
    <dl class="cells">
      <div v-for="cell in cells" :key="cell.key" class="cell">
        <dt>{{ cell.key }}</dt>
        <dd class="value mv-n">
          {{ cell.value }}<small v-if="cell.unit">{{ cell.unit }}</small>
        </dd>
        <dd class="note mv-n">{{ cell.note }}</dd>
      </div>
    </dl>
  </div>
</template>

<style scoped>
.cells {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1px;
  margin: 0;
  background: var(--k-line);
}

.cell {
  min-width: 0;
  padding: 7px 11px 8px;
  background: var(--k-surface);
}

.cell dt {
  overflow: hidden;
  color: var(--k-text-3);
  font-size: 10.5px;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cell dd {
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.value {
  font-size: 17px;
  font-weight: 600;
  line-height: 1.4;
}

.value small {
  margin-left: 2px;
  color: var(--k-text-3);
  font-size: 11px;
  font-weight: 400;
}

.note {
  color: var(--k-text-3);
  font-size: 10.5px;
  line-height: 1.35;
}

@container (max-width: 720px) {
  .cells {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
