<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef } from 'vue';

import { memberAccent, memberColor } from '@/lib/memberColor';
import { axisFraction, cardPlacement, chartSummary, countLabel, labelSides } from '@/lib/milestones';
import { useMilestoneCard } from '@/lib/useMilestoneCard';
import MilestoneCard from '@/parts/MilestoneCard.vue';
import { axisMarks } from '../draw';
import type { Subject } from '../model';
import type { MilestoneStatus } from '../useStatsData';
import MilestoneLegend from './MilestoneLegend.vue';
import MilestonePoint from './MilestonePoint.vue';

/**
 * Every member's subscriber milestones, one row each, for the sum (#225).
 *
 * Milestones fall on each member's own dates, so they cannot be added up,
 * and putting every member on one count axis would be a chart for comparing
 * them (#134). Each row is a line of time only: when a milestone came, and
 * the count written beside it, with nothing measured against anybody else.
 */
const { members, months, status, dark } = defineProps<{
  members: readonly Subject[];
  months: readonly string[];
  status: MilestoneStatus;
  dark: boolean;
}>();

const { openId, cardId, toggle, close } = useMilestoneCard();

const axis = useTemplateRef<HTMLElement>('axis');
const axisWidth = ref(320);
let observer: ResizeObserver | undefined;

const marks = computed(() => axisMarks(months, axisWidth.value));

/** How far apart two labels must be, as a share of the row, to both sit above. */
const labelGap = computed(() => 30 / Math.max(axisWidth.value, 1));

const rows = computed(() =>
  members.map((member) => {
    const xs = member.milestones.map((milestone) => axisFraction(milestone.reachedDate, months));
    const sides = labelSides(xs, labelGap.value);

    return {
      member,
      style:
        member.color === null
          ? undefined
          : { '--member-color': memberColor(member.color, dark), '--member-accent': memberAccent(member.color, dark) },
      summary: chartSummary(member.name, member.milestones),
      points: member.milestones.map((milestone, i) => ({ milestone, x: xs[i]!, side: sides[i]! })),
    };
  }),
);

const opened = computed(() => {
  for (const row of rows.value) {
    const point = row.points.find((p) => p.milestone.milestoneId === openId.value);

    if (point !== undefined) return { row, point };
  }

  return null;
});

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
        <div v-if="row.points.length > 0" class="strip" role="group" :aria-label="row.summary ?? undefined">
          <span class="rule" aria-hidden="true"></span>
          <template v-for="point in row.points" :key="point.milestone.milestoneId">
            <span class="label n" :data-side="point.side" :style="{ left: `${point.x * 100}%` }" aria-hidden="true">{{
              countLabel(point.milestone.subscriberCount)
            }}</span>
            <MilestonePoint
              :milestone="point.milestone"
              :expanded="openId === point.milestone.milestoneId"
              :controls="cardId(point.milestone.milestoneId)"
              :style="{ left: `${point.x * 100}%`, top: '50%' }"
              @press="toggle(point.milestone.milestoneId, $event)"
            />
          </template>
          <MilestoneCard
            v-if="opened && opened.row === row"
            :id="cardId(opened.point.milestone.milestoneId)"
            :milestone="opened.point.milestone"
            :name="row.member.name"
            :style="cardPlacement(opened.point.x, null)"
            @close="close(true)"
          />
        </div>
        <span v-else-if="status === 'ready'" class="empty">節目の記録はまだありません</span>
        <span v-else class="strip" aria-hidden="true"><span class="rule"></span></span>
      </div>
      <MilestoneLegend :now="false" />
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

.strip {
  position: relative;
  height: 40px;
  margin-inline: 4px;
}

.rule {
  position: absolute;
  top: 50%;
  right: 0;
  left: 0;
  height: 2px;
  border-radius: 1px;
  background: var(--k-line);
  transform: translateY(-50%);
}

.label {
  position: absolute;
  color: var(--k-text-2);
  font-size: 10px;
  line-height: 1;
  white-space: nowrap;
  transform: translateX(-50%);
  pointer-events: none;
}

.label[data-side='above'] {
  top: 3px;
}

.label[data-side='below'] {
  bottom: 3px;
}

.empty {
  color: var(--k-text-3);
  font-size: 11px;
}

.axis {
  position: relative;
  height: 15px;
  margin-inline: 4px;
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

.milestone-rows > :deep(.milestone-legend) {
  padding-top: 8px;
}

@container (max-width: 560px) {
  .row {
    grid-template-columns: 84px minmax(0, 1fr);
  }
}
</style>
