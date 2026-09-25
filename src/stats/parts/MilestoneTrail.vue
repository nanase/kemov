<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef } from 'vue';

import { axisFraction, cardPlacement, chartSummary, countLabel, countScale } from '@/lib/milestones';
import { useMilestoneCard } from '@/lib/useMilestoneCard';
import MilestoneCard from '@/parts/MilestoneCard.vue';
import type { SubscriberMilestone } from '@/type/api';
import { axisMarks } from '../draw';
import type { MilestoneStatus } from '../useStatsData';
import MilestoneLegend from './MilestoneLegend.vue';
import MilestonePoint from './MilestonePoint.vue';

/**
 * One member's subscriber milestones, on the month axis the other tabs use
 * (#225).
 *
 * Up the side is the member's own count, from zero; nothing else is on the
 * scale (#134). The points are joined by a dotted line, which says only
 * that they came in this order: the months in between are not recorded, and
 * a solid line would draw a climb nobody measured. A member who has
 * finished is drawn exactly the same way.
 *
 * The ring at the right is today's count from the API. It is not a
 * milestone, is never stored, and opens no card.
 */
const { milestones, months, now, today, status, name } = defineProps<{
  milestones: readonly SubscriberMilestone[];
  months: readonly string[];
  /** Today's count, or null when it was not read. */
  now: number | null;
  /** Today in JST, `YYYY-MM-DD`. */
  today: string;
  status: MilestoneStatus;
  name: string;
}>();

const { openId, cardId, toggle, close } = useMilestoneCard();

const axis = useTemplateRef<HTMLElement>('axis');
const axisWidth = ref(320);
let observer: ResizeObserver | undefined;

const marks = computed(() => axisMarks(months, axisWidth.value));

const scale = computed(() =>
  countScale(Math.max(now ?? 0, ...milestones.map((milestone) => milestone.subscriberCount))),
);

const height = (count: number) => 1 - count / scale.value.top;

const points = computed(() =>
  milestones.map((milestone) => ({
    milestone,
    x: axisFraction(milestone.reachedDate, months),
    y: height(milestone.subscriberCount),
  })),
);

const nowPoint = computed(() =>
  now === null || milestones.length === 0 ? null : { x: axisFraction(today, months), y: height(now) },
);

/** The dotted line, in the 0-100 box the SVG is drawn in. */
const line = computed(() => {
  const all = [...points.value, ...(nowPoint.value === null ? [] : [nowPoint.value])];

  return all.length < 2 ? '' : all.map((p) => `${(p.x * 100).toFixed(3)},${(p.y * 100).toFixed(3)}`).join(' ');
});

const summary = computed(() => chartSummary(name, milestones));
const opened = computed(() => points.value.find((p) => p.milestone.milestoneId === openId.value) ?? null);

const at = (x: number, y: number) => ({ left: `${x * 100}%`, top: `${y * 100}%` });

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
  <div class="milestone-trail">
    <p v-if="status === 'failed'" class="failed">
      節目の記録を取得できませんでした。しばらく時間をおいてから再度お試しください
    </p>
    <p v-else-if="status === 'ready' && milestones.length === 0" class="empty">節目の記録はまだありません</p>
    <div v-else class="plot">
      <div class="scale n" aria-hidden="true">
        <template v-if="status === 'ready'">
          <span v-for="tick in scale.ticks" :key="tick" :style="{ top: `${height(tick) * 100}%` }">{{
            countLabel(tick)
          }}</span>
        </template>
      </div>
      <div class="area" :role="summary ? 'group' : undefined" :aria-label="summary ?? undefined">
        <svg class="lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <template v-if="status === 'ready'">
            <line
              v-for="tick in scale.ticks.slice(1)"
              :key="tick"
              class="grid"
              x1="0"
              :y1="height(tick) * 100"
              x2="100"
              :y2="height(tick) * 100"
            />
          </template>
          <polyline v-if="line" class="link" :points="line" />
        </svg>
        <template v-for="point in points" :key="point.milestone.milestoneId">
          <span class="label n" :style="at(point.x, point.y)" aria-hidden="true">{{
            countLabel(point.milestone.subscriberCount)
          }}</span>
          <MilestonePoint
            :milestone="point.milestone"
            :expanded="openId === point.milestone.milestoneId"
            :controls="cardId(point.milestone.milestoneId)"
            :style="at(point.x, point.y)"
            @press="toggle(point.milestone.milestoneId, $event)"
          />
        </template>
        <span v-if="nowPoint" class="now" :style="at(nowPoint.x, nowPoint.y)" aria-hidden="true">
          <span class="now-label">いま</span>
        </span>
        <MilestoneCard
          v-if="opened"
          :id="cardId(opened.milestone.milestoneId)"
          :milestone="opened.milestone"
          :style="cardPlacement(opened.x, opened.y)"
          @close="close(true)"
        />
      </div>
    </div>
    <div v-show="status !== 'failed' && !(status === 'ready' && milestones.length === 0)" ref="axis" class="axis">
      <span
        v-for="mark in marks"
        :key="mark.label"
        :style="{ left: `${mark.left}%` }"
        :data-edge="mark.edge"
        class="n"
        >{{ mark.label }}</span
      >
    </div>
    <MilestoneLegend v-if="milestones.length > 0" :now="nowPoint !== null" />
  </div>
</template>

<style scoped>
.milestone-trail {
  display: grid;
  gap: 6px;
}

.failed {
  margin: 0;
  padding: 10px 12px;
  border: 1px solid var(--k-warn);
  border-radius: 6px;
  color: var(--k-warn);
  font-size: 12.5px;
}

.empty {
  margin: 0;
  padding: 18px 12px;
  border-radius: 6px;
  background: var(--k-sunken);
  color: var(--k-text-3);
  font-size: 12px;
  text-align: center;
}

.plot {
  display: grid;
  grid-template-columns: 52px minmax(0, 1fr);
  gap: 6px;
}

.scale {
  position: relative;
  color: var(--k-text-3);
  font-size: 10.5px;
}

.scale span {
  position: absolute;
  right: 0;
  transform: translateY(-50%);
  white-space: nowrap;
}

.area {
  position: relative;
  height: 232px;
  border-bottom: 1px solid var(--k-line-2);
  border-left: 1px solid var(--k-line-2);
  border-radius: 2px 2px 0 0;
  background: var(--k-sunken);
}

.lines {
  display: block;
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
}

.grid {
  stroke: var(--k-line);
  stroke-width: 1px;
  vector-effect: non-scaling-stroke;
}

.link {
  fill: none;
  stroke: var(--member-color, var(--k-accent));
  stroke-width: 1.6px;
  stroke-dasharray: 3 4;
  stroke-linecap: round;
  vector-effect: non-scaling-stroke;
}

.label {
  position: absolute;
  z-index: 1;
  color: var(--k-text-2);
  font-size: 10.5px;
  line-height: 1;
  white-space: nowrap;
  transform: translate(-50%, -19px);
  pointer-events: none;
}

.now {
  box-sizing: border-box;
  position: absolute;
  width: 12px;
  height: 12px;
  border: 1.5px solid var(--k-text);
  border-radius: 50%;
  background: var(--k-surface);
  transform: translate(-50%, -50%);
}

/* Above and to the left of the ring: the ring sits at today, against the
   chart's right edge, and there is no room on the other side. */
.now-label {
  position: absolute;
  right: 4px;
  bottom: 12px;
  color: var(--k-text);
  font-size: 10.5px;
  line-height: 1;
  white-space: nowrap;
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
  .area {
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
  .area {
    height: 200px;
  }
}
</style>
