<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef } from 'vue';

import MemberAvatar from '@/parts/MemberAvatar.vue';

import { buildTrailMap, monthIndex, trailLayout, trailX, trailY } from '../map';
import type { AsideItem, EventItem, Filters } from '../model';
import type { VideoTableRow } from '@/lib/ranking';
import type { Channel } from '@/type/api';

/**
 * The trajectory, small, beside the timeline.
 *
 * The whole record at a glance: one lane per member and one for けもV, the
 * days that happened as points on them, and how busy each month was in the
 * band on the right. Pressing a month moves the timeline to it.
 *
 * SVG rather than a canvas: there are a few hundred marks here, not the ten
 * thousand the member page's heatmap draws, and a mark that can be pressed
 * and named is worth more than the drawing speed.
 */
const { events, rows, channels, filters, now, dark, reading, soon, stations, available } = defineProps<{
  events: readonly EventItem[];
  rows: readonly VideoTableRow[];
  channels: readonly Channel[];
  filters: Filters;
  now: number;
  dark: boolean;
  /** The `YYYY-MM` the timeline is showing, marked as a band. */
  reading: { from: string; to: string } | null;
  /** The days that come round, drawn only where there is room to tell them
   * apart from the rest. */
  soon?: readonly AsideItem[];
  /** Whether a mark can be pressed to open the record behind it. */
  stations?: boolean;
  /** How tall the chart may be. Measured from the window when not given. */
  available?: number;
}>();

const emit = defineEmits<{ month: [month: string]; member: [channelId: string]; open: [key: string] }>();

const box = useTemplateRef<HTMLDivElement>('box');
const width = ref(0);
const room = ref(520);
let observer: ResizeObserver | undefined;

const map = computed(() => buildTrailMap(events, rows, channels, filters, now, dark, soon ?? []));
const layout = computed(() =>
  trailLayout(
    Math.max(160, width.value),
    room.value,
    map.value.lanes.length,
    map.value.months,
    filters.order === 'desc',
  ),
);

/** Where the timeline's own view falls on this chart's axis. */
const read = computed(() => {
  if (reading === null) return null;

  const at = (month: string) => {
    const [year, index] = month.split('-').map(Number) as [number, number];

    return monthIndex(year, index) - map.value.firstMonth;
  };

  return { from: at(reading.from), to: at(reading.to) + 1 };
});

const y = (at: number) => trailY(layout.value, at, map.value.months);
const x = (lane: number) => trailX(layout.value, lane);

/** How thick a line is drawn, which the lane width decides. */
const stroke = computed(() => (layout.value.laneWidth >= 14 ? 2.2 : layout.value.laneWidth >= 10 ? 1.6 : 1.2));
const dotScale = computed(() => (layout.value.laneWidth >= 14 ? 1 : layout.value.laneWidth >= 10 ? 0.8 : 0.65));

/** The `YYYY-MM` each month band stands for, for pressing one. */
const monthBands = computed(() =>
  Array.from({ length: map.value.months }, (_, index) => {
    const absolute = map.value.firstMonth + index;
    const month = `${Math.floor(absolute / 12)}-${String((absolute % 12) + 1).padStart(2, '0')}`;
    const from = y(index);
    const to = y(index + 1);

    return { month, top: Math.min(from, to), height: Math.abs(to - from) };
  }),
);

/** Where each face sits above its lane. */
const heads = computed(() =>
  map.value.lanes.map((lane, index) => ({
    lane,
    left: x(index) - layout.value.avatar / 2,
    top: layout.value.staggered && index % 2 === 1 ? layout.value.avatar + 3 : 0,
  })),
);

function measure() {
  width.value = box.value?.clientWidth ?? 0;
  room.value = available ?? Math.max(240, window.innerHeight - 300);
}

onMounted(() => {
  measure();
  observer = new ResizeObserver(measure);
  if (box.value !== null) observer.observe(box.value);
  window.addEventListener('resize', measure);
});

onBeforeUnmount(() => {
  observer?.disconnect();
  window.removeEventListener('resize', measure);
});
</script>

<template>
  <div ref="box" class="map" :style="{ height: `${layout.height}px` }">
    <svg
      v-if="width > 0"
      :width="layout.width"
      :height="layout.height"
      :viewBox="`0 0 ${layout.width} ${layout.height}`"
      role="img"
      aria-label="けもV とメンバーの軌跡"
    >
      <!-- Where the timeline is, so the two say the same thing about where
           the reader is on the road. -->
      <rect
        v-if="read"
        class="reading"
        :x="layout.c0 - 4"
        :y="Math.min(y(read.from), y(read.to))"
        :width="layout.cLen + 8"
        :height="Math.max(2, Math.abs(y(read.to) - y(read.from)))"
      />

      <!-- The years, as a rule across the lanes with the year beside it. -->
      <g class="years">
        <line
          v-for="year in map.years.filter((entry) => entry.rule)"
          :key="`r${year.year}`"
          :x1="layout.c0"
          :x2="layout.c0 + layout.cLen"
          :y1="y(year.at)"
          :y2="y(year.at)"
        />
        <text v-for="year in map.years" :key="`t${year.year}`" x="0" :y="y(year.at) + 9" class="fp-n">
          {{ year.year }}
        </text>
      </g>

      <!-- How busy each month was, everybody together. -->
      <g class="volume">
        <rect
          v-for="bar in map.bars"
          :key="`v${bar.at}`"
          :x="layout.volC"
          :y="Math.min(y(bar.at), y(bar.at + 1)) + 0.5"
          :width="Math.max(1, layout.volLen * bar.amount)"
          :height="Math.max(0.5, Math.abs(y(bar.at + 1) - y(bar.at)) - 1)"
        />
      </g>

      <!-- One run per lane. A run that ended gets a bar across it, never a
           lighter line: the line stops, the member is not dimmed (#140). -->
      <g class="spans">
        <template v-for="span in map.spans" :key="`s${span.lane}`">
          <line
            :x1="x(span.lane)"
            :x2="x(span.lane)"
            :y1="y(span.from)"
            :y2="y(span.to)"
            :stroke="span.color === '' ? 'var(--k-text-2)' : span.color"
            :stroke-width="stroke"
            stroke-linecap="round"
          />
          <line
            v-if="span.ended"
            :x1="x(span.lane) - Math.min(4, layout.laneWidth * 0.4)"
            :x2="x(span.lane) + Math.min(4, layout.laneWidth * 0.4)"
            :y1="y(span.to)"
            :y2="y(span.to)"
            :stroke="span.color === '' ? 'var(--k-text-2)' : span.color"
            :stroke-width="stroke"
          />
        </template>
      </g>

      <!-- An event involving several members joins their lanes. -->
      <g class="ties">
        <line
          v-for="(tie, index) in map.ties"
          :key="`t${index}`"
          :x1="x(tie.from)"
          :x2="x(tie.to)"
          :y1="y(tie.at)"
          :y2="y(tie.at)"
        />
      </g>

      <g class="dots">
        <circle
          v-for="(dot, index) in map.dots"
          :key="`d${index}`"
          :cx="x(dot.lane)"
          :cy="y(dot.at)"
          :r="(dot.large ? 3.4 : 2.1) * dotScale"
          :fill="dot.future ? 'var(--k-surface)' : dot.color === '' ? 'var(--k-text-2)' : dot.color"
          :stroke="dot.large || dot.future ? (dot.color === '' ? 'var(--k-text-2)' : dot.color) : 'none'"
          :stroke-width="dot.large ? 1.2 : 1"
          :stroke-dasharray="dot.recurring ? '2 2' : undefined"
          :class="{ station: stations === true && dot.key !== undefined }"
          @click="stations === true && dot.key !== undefined && emit('open', dot.key)"
        />
      </g>

      <line
        class="now"
        :x1="layout.c0"
        :x2="layout.c0 + layout.cLen"
        :y1="y(map.now)"
        :y2="y(map.now)"
        stroke-width="1.6"
      />

      <!-- Pressing a month sends the timeline there. -->
      <rect
        v-for="band in monthBands"
        :key="band.month"
        class="hit"
        x="0"
        :y="band.top"
        :width="layout.width"
        :height="band.height"
        fill="transparent"
        @click="emit('month', band.month)"
      />
    </svg>

    <span
      v-for="head in heads"
      :key="head.lane.channel?.channelId ?? 'all'"
      class="head"
      :style="{ left: `${head.left}px`, top: `${head.top}px` }"
    >
      <button
        v-if="head.lane.channel"
        type="button"
        :aria-label="head.lane.channel.name"
        :aria-pressed="filters.members.has(head.lane.channel.channelId)"
        @click="emit('member', head.lane.channel.channelId)"
      >
        <MemberAvatar
          :src="head.lane.channel.thumbnailUrl"
          :name="head.lane.channel.name"
          :color="head.lane.channel.color.key"
          :size="layout.avatar"
          :dark
        />
      </button>
      <span
        v-else
        class="all"
        :style="{ width: `${layout.avatar}px`, height: `${layout.avatar}px` }"
        aria-label="けもV 全体"
        >V</span
      >
    </span>
  </div>
</template>

<style scoped>
.map {
  position: relative;
}

svg {
  display: block;
  width: 100%;
  overflow: visible;
}

.reading {
  fill: color-mix(in srgb, var(--k-accent) 14%, transparent);
}

.years line {
  stroke: var(--k-track);
  stroke-width: 1;
}

.years text {
  fill: var(--k-text-3);
  font-size: 10px;
}

.volume rect {
  fill: var(--k-line-2);
}

.ties line {
  stroke: var(--k-line-2);
  stroke-width: 0.7;
}

/* Today, which is where the walked road stops. */
.now {
  stroke: var(--k-accent);
}

.hit {
  cursor: pointer;
}

.station {
  cursor: pointer;
}

.head {
  position: absolute;
  display: flex;
}

.head button {
  display: flex;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: none;
  cursor: pointer;
}

.head button[aria-pressed='true'] {
  box-shadow:
    0 0 0 2px var(--k-surface),
    0 0 0 4px var(--k-accent);
}

.all {
  display: inline-grid;
  place-items: center;
  border: 1.5px solid var(--k-text-3);
  border-radius: 50%;
  background: var(--k-surface);
  color: var(--k-text-2);
  font-size: 7px;
  font-weight: 700;
}
</style>
