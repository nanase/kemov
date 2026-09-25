<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef } from 'vue';

import { memberColor } from '@/lib/memberColor';
import { chartSummary, monthlyEstimates } from '@/lib/milestones';
import { axisMarks } from '../draw';
import type { Subject } from '../model';
import type { MilestoneStatus } from '../useStatsData';
import MilestoneBars from './MilestoneBars.vue';

/**
 * Every member's subscriber count month by month, one row each, for the sum
 * (#225).
 *
 * Milestones fall on each member's own dates, so they cannot be added up,
 * and one count axis for everyone would be a chart for comparing them
 * (#134). Each row is scaled to its own member instead, on the month axis
 * the other tabs use.
 */
const { members, months, status, dark, today } = defineProps<{
  members: readonly Subject[];
  months: readonly string[];
  status: MilestoneStatus;
  dark: boolean;
  /** Today in JST, `YYYY-MM-DD`. */
  today: string;
}>();

const axis = useTemplateRef<HTMLElement>('axis');
const axisWidth = ref(320);
let observer: ResizeObserver | undefined;

const marks = computed(() => axisMarks(months, axisWidth.value));

const rows = computed(() =>
  members.map((member) => ({
    member,
    style: member.color === null ? undefined : { '--member-color': memberColor(member.color, dark) },
    summary: chartSummary(member.name, member.milestones),
    estimates: monthlyEstimates(
      member.milestones,
      months,
      member.counts.subscriberCount,
      today,
      member.activityEndDate,
    ),
  })),
);

/** Whether any row has months after an activity ended, which the key then explains. */
const anyAfterEnd = computed(() => rows.value.some((row) => row.estimates.some((e) => e?.afterEnd)));

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
  <div class="milestone-rows">
    <p v-if="status === 'failed'" class="failed">
      節目の記録を取得できませんでした。しばらく時間をおいてから再度お試しください
    </p>
    <template v-else>
      <div class="row head" aria-hidden="true">
        <span></span>
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
      <div v-for="row in rows" :key="row.member.id" class="row" :style="row.style">
        <span class="who">
          <span class="swatch" aria-hidden="true"></span>
          <span class="name">{{ row.member.name }}</span>
        </span>
        <MilestoneBars v-if="row.summary" :estimates="row.estimates" role="img" :aria-label="row.summary" />
        <span v-else-if="status === 'ready'" class="empty">節目の記録はまだありません</span>
        <span v-else aria-hidden="true"></span>
      </div>
      <p class="key">
        <span><i class="mark" data-recorded aria-hidden="true"></i>節目のある月・今月</span>
        <span><i class="mark" aria-hidden="true"></i>補間した月</span>
        <span v-if="anyAfterEnd"><i class="mark" data-after-end aria-hidden="true"></i>活動終了後の月</span>
      </p>
    </template>
  </div>
</template>

<style scoped>
.milestone-rows {
  display: grid;
}

.failed {
  margin: 0;
  padding: 10px 12px;
  border: 1px solid var(--k-warn);
  border-radius: 6px;
  color: var(--k-warn);
  font-size: 12.5px;
}

.row {
  display: grid;
  grid-template-columns: 118px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  min-height: 40px;
  border-bottom: 1px solid var(--k-line);
}

.row.head {
  min-height: 0;
  padding-bottom: 2px;
}

.milestone-rows > .row:last-of-type {
  border-bottom: 0;
}

.who {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.swatch {
  flex: none;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--member-color, var(--k-accent));
}

.name {
  overflow: hidden;
  font-size: 11.5px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.empty {
  color: var(--k-text-3);
  font-size: 11px;
}

.axis {
  position: relative;
  height: 15px;
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

.key {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 14px;
  margin: 0;
  padding-top: 8px;
  color: var(--k-text-2);
  font-size: 11px;
}

.key span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

/* The same fills the bars use, in the page's own colour: every row has a
   colour of its own, and the key is about the fill, not the member. */
.mark {
  width: 9px;
  height: 11px;
  background: color-mix(in srgb, var(--k-text-2) 32%, transparent);
}

.mark[data-recorded] {
  background: var(--k-text-2);
}

.mark[data-after-end] {
  background: repeating-linear-gradient(135deg, var(--k-text-2) 0 2px, transparent 2px 4px);
}

@container (max-width: 560px) {
  .row {
    grid-template-columns: 84px minmax(0, 1fr);
  }
}
</style>
