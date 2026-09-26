<script setup lang="ts">
import { computed, ref, watch } from 'vue';

import MilestoneTrail from '@/parts/MilestoneTrail.vue';
import SegmentGroup from '@/parts/SegmentGroup.vue';
import { memberAccent, memberColor } from '@/lib/memberColor';
import { MILESTONE_HEADING, type MilestoneStatus } from '@/lib/milestones';
import { DASH, formatCount } from '@/lib/numberFormat';

import { formatLength } from '../draw';
import { isMilestoneTab, MONTHLY_TABS, monthlySeries, type MonthlyTabId } from '../model';
import type { ChannelMonths, SubscriberMilestone } from '@/type/api';

/**
 * Month by month, one measure at a time.
 *
 * The bars are scaled against this member's own largest month and nothing
 * else (#136). A line at each turn of the year is the only gridline: the
 * months either side of one are a year apart, and without the mark a reader
 * counts twelve bars to find out.
 *
 * The last tab is the member's subscriber milestones (#225), which are not a
 * month series: it draws the same points and card as the statistics page, on
 * the same month axis, and says so in its heading.
 */
const { months, row, series, missing, milestones, milestoneStatus, now, today, name, color, dark } = defineProps<{
  /** Every month the site knows, as `YYYY-MM`, oldest first. */
  months: readonly string[];
  /** This member's series, or null while they are on their way. */
  row: ChannelMonths | null;
  series: MonthlyTabId;
  /** True when the monthly record was asked for and never arrived. */
  missing: boolean;
  /** This member's published milestones, oldest first. */
  milestones: readonly SubscriberMilestone[];
  milestoneStatus: MilestoneStatus;
  /** Today's count from the API, or null when it was not read. */
  now: number | null;
  /** Today in JST, `YYYY-MM-DD`. */
  today: string;
  name: string;
  /** The member's colour, as the API sends it. */
  color: string | null;
  dark: boolean;
}>();

const emit = defineEmits<{ series: [id: MonthlyTabId] }>();

const onMilestones = computed(() => isMilestoneTab(series));
const monthSeries = computed(() => (isMilestoneTab(series) ? null : series));

const trailColors = computed(() =>
  color === null
    ? undefined
    : { '--member-color': memberColor(color, dark), '--member-accent': memberAccent(color, dark) },
);

/**
 * Without the month axis there is nowhere to put a milestone, so the trail
 * draws the empty frame it draws while loading rather than every point at
 * the left edge.
 */
const trailStatus = computed<MilestoneStatus>(() =>
  milestoneStatus === 'ready' && months.length === 0 ? 'loading' : milestoneStatus,
);

const pointed = ref<number | null>(null);
const chosen = ref<number | null>(null);

const values = computed(() =>
  row === null || monthSeries.value === null ? [] : monthlySeries(row, monthSeries.value),
);
const peak = computed(() => Math.max(1, ...values.value.map((value) => value ?? 0)));

/**
 * The month the readout opens on: the newest one with something in it.
 *
 * Not simply the newest month the site knows about. For a member who has
 * finished, that is a month of zeros years after their last stream, and the
 * panel would open by saying they did nothing.
 */
const newest = computed(() => {
  for (let index = values.value.length - 1; index >= 0; index -= 1) {
    if ((values.value[index] ?? 0) > 0) return index;
  }

  for (let index = values.value.length - 1; index >= 0; index -= 1) {
    if (values.value[index] !== null) return index;
  }

  return null;
});

const at = computed(() => pointed.value ?? chosen.value ?? newest.value);

const bars = computed(() =>
  months.map((month, index) => ({
    month,
    index,
    value: values.value[index] ?? null,
    height: ((values.value[index] ?? 0) / peak.value) * 100,
    // The first month of a year carries the gridline, and its label.
    year: index === 0 || month.slice(0, 4) !== months[index - 1]?.slice(0, 4) ? month.slice(0, 4) : null,
  })),
);

const readout = computed(() => {
  const index = at.value;

  if (index === null || row === null) return null;

  const streams = row.streams[index] ?? null;
  const videos = row.videos[index] ?? null;
  const shorts = row.shorts[index] ?? null;

  // A total only where all three are known. One of them missing makes the sum
  // a lower bound, and a lower bound written as a total reads as a quiet
  // month rather than as a gap in the record.
  const total = streams === null || videos === null || shorts === null ? null : streams + videos + shorts;
  const part = (value: number | null) => (value === null ? DASH : formatCount(value));

  return {
    month: months[index] ?? '',
    total: `${total === null ? DASH : formatCount(total)} 本（配信 ${part(streams)} ・ 動画 ${part(videos)} ・ ショート ${part(shorts)}）`,
    duration: formatLength(row.streamSeconds[index] ?? null),
    chat: formatCount(row.chatMessages[index] ?? null),
    chatUsers: formatCount(row.chatUniqueUsers[index] ?? null),
    views: formatCount(row.views[index] ?? null),
  };
});

const seriesItems = MONTHLY_TABS.map((entry) => ({ id: entry.id, label: entry.label }));

function label(index: number): string {
  const value = values.value[index] ?? null;
  const written =
    value === null ? '記録がありません' : series === 'hours' ? formatLength(value * 3600) : formatCount(value);

  return `${months[index]} ${written}`;
}

function move(step: number) {
  const from = at.value ?? 0;

  chosen.value = Math.min(months.length - 1, Math.max(0, from + step));
}

watch(
  () => row,
  () => {
    chosen.value = null;
    pointed.value = null;
  },
);
</script>

<template>
  <div class="mv-panel">
    <div class="mv-head">
      <b>{{ onMilestones ? MILESTONE_HEADING : '月ごと' }}</b>
      <!-- Views are collected by the month a video went up, not by the month
           they were watched in, and the two are easy to confuse (#136). -->
      <span v-if="series === 'views'">その月に公開した動画・配信の累計</span>
      <span v-else-if="onMilestones">月ごとの値ではありません</span>
      <span class="mv-grow"></span>
      <SegmentGroup
        :items="seriesItems"
        :value="series"
        label="月ごとの指標"
        @pick="emit('series', $event as MonthlyTabId)"
      />
    </div>
    <p v-if="missing" class="mv-empty">月ごとの記録を取得できませんでした</p>

    <div v-else-if="onMilestones" class="trail" :style="trailColors">
      <MilestoneTrail
        :key="name"
        :milestones="milestones"
        :months="months"
        :now="now"
        :today="today"
        :status="trailStatus"
        :name="name"
      />
    </div>

    <template v-else>
      <div class="mv-read mv-n">
        <template v-if="readout">
          <b>{{ readout.month }}</b>
          <span>{{ readout.total }}</span>
          <span>配信時間 {{ readout.duration }}</span>
          <span>チャット {{ readout.chat }}</span>
          <span>チャットユーザ {{ readout.chatUsers }}</span>
          <span>再生 {{ readout.views }}</span>
        </template>
      </div>
      <div class="chart">
        <div class="bars" @mouseleave="pointed = null">
          <button
            v-for="bar in bars"
            :key="bar.month"
            type="button"
            :class="{ year: bar.year !== null }"
            :tabindex="bar.index === at ? 0 : -1"
            :aria-current="bar.index === at ? 'true' : undefined"
            :aria-label="label(bar.index)"
            @mouseover="pointed = bar.index"
            @focus="chosen = bar.index"
            @click="chosen = bar.index"
            @keydown.left.prevent="move(-1)"
            @keydown.right.prevent="move(1)"
          >
            <i :style="{ height: `${bar.height.toFixed(2)}%` }"></i>
            <u v-if="bar.year">{{ bar.year }}</u>
          </button>
        </div>
        <div class="axis"></div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.trail {
  padding: 10px 12px 12px;
}

.chart {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
  padding: 10px 12px 4px;
}

.bars {
  display: flex;
  position: relative;
  flex: 1 1 auto;
  gap: 2px;
  align-items: flex-end;
  min-height: 0;
}

.bars::before {
  content: '';
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  height: 1px;
  background: var(--k-line);
}

.bars button {
  display: flex;
  position: relative;
  flex: 1 1 0;
  align-items: flex-end;
  min-width: 0;
  max-width: 56px;
  height: 100%;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 2px;
  background: none;
  cursor: pointer;
}

/* The turn of the year, drawn behind the bars. */
.bars button.year::before {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: -1px;
  width: 1px;
  background: var(--k-line-2);
  opacity: 0.7;
}

.bars button i {
  display: block;
  position: relative;
  width: 100%;
  min-height: 2px;
  border-radius: 1px 1px 0 0;
  background: var(--mv-bar);
}

.bars button:hover i,
.bars button[aria-current='true'] i {
  background: var(--mv-key);
}

.bars button u {
  position: absolute;
  top: 100%;
  left: 0;
  margin-top: 3px;
  color: var(--k-text-3);
  font-size: 10.5px;
  line-height: 1.2;
  text-decoration: none;
  white-space: nowrap;
  pointer-events: none;
}

.axis {
  flex: none;
  height: 18px;
}

/* In the two-column board the panel is what is left of a screen-tall column,
   and the chart is shorter than the trail's own height, which would push its
   legend out of the panel. */
@container (min-width: 1121px) {
  .trail :deep(.area) {
    height: 184px;
  }
}

@container (max-width: 1120px) {
  .chart {
    height: 232px;
  }
}

@container (max-width: 720px) {
  .chart {
    height: 196px;
  }
}
</style>
