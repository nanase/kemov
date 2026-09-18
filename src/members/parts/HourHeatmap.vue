<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue';

import SegmentGroup from '@/parts/SegmentGroup.vue';
import { formatCount } from '@/lib/numberFormat';
import { HEATMAP_STEP_MINUTES } from '@/lib/heatmap';

import { columnLabel } from '../draw';
import { DAY_NAMES } from '@/lib/timeFormat';
import { busiestCell, heatCounts, heatLevel, HEAT_LEVELS, type MemberStream } from '../model';

/**
 * When this member is on air, over a week.
 *
 * A cell holds the number of streams that were running in it, and one stream
 * counts once however many cells it covers - so a finer resolution cuts the
 * week up differently without changing what any number means (#136). That is
 * the opposite end from `/stats/`, which adds up the minutes streamed in a
 * cell: that page answers how much of an hour is usually filled, and this one
 * answers how many streams are usually on.
 *
 * The shades are the page's own accent, never the member's colour: a shade
 * stands for an amount, and #136 keeps a member's colour for telling people
 * apart. Drawn on a canvas because the finest resolution is 10,080 cells.
 */
const { streams, step } = defineProps<{
  streams: readonly MemberStream[];
  /** Minutes per cell: 60, 30, 10 or 1. */
  step: number;
}>();

const emit = defineEmits<{ step: [minutes: number] }>();

/** How solid each shade is. The lightest is still a mark a reader can see. */
const ALPHA = [0, 0.18, 0.4, 0.68, 1];

/** The height of one weekday's row, which the labels beside it match. */
const ROW_HEIGHT = 24;

const canvas = useTemplateRef<HTMLCanvasElement>('canvas');
const columnChart = useTemplateRef<HTMLCanvasElement>('columnChart');
const cell = ref<{ weekday: number; column: number } | null>(null);
let observer: ResizeObserver | undefined;
let themeObserver: MutationObserver | undefined;
const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');

const heat = computed(() => heatCounts(streams, step));
const stepItems = HEATMAP_STEP_MINUTES.map((minutes) => ({
  id: String(minutes),
  label: minutes === 60 ? '1 時間' : `${minutes} 分`,
}));

const readout = computed(() => {
  const at = cell.value ?? busiestCell(heat.value);

  if (at === null) return null;

  const value = heat.value.cells[at.weekday * heat.value.columns + at.column] ?? 0;

  return {
    lead: `${DAY_NAMES[at.weekday]}曜 ${columnLabel(at.column, heat.value.stepMinutes)}`,
    value: `${formatCount(value)} 本`,
    weekday: `この曜日 ${formatCount(heat.value.byWeekday[at.weekday] ?? 0)} 本`,
    column: `この時間帯 ${formatCount(heat.value.byColumn[at.column] ?? 0)} 本`,
  };
});

const weekdays = computed(() =>
  DAY_NAMES.map((name, weekday) => ({
    name,
    weekend: weekday === 0 || weekday === 6,
    count: heat.value.byWeekday[weekday] ?? 0,
    width: heat.value.weekdayMax === 0 ? 0 : ((heat.value.byWeekday[weekday] ?? 0) / heat.value.weekdayMax) * 30,
  })),
);

/** The same map in words, for a reader who cannot point at it. */
const spoken = computed(() =>
  DAY_NAMES.map((name, weekday) => {
    const row = heat.value.cells.slice(weekday * heat.value.columns, (weekday + 1) * heat.value.columns);
    const peak = Math.max(0, ...row);

    return {
      name,
      text:
        peak === 0
          ? '配信なし'
          : `最も多い時間帯は ${columnLabel(row.indexOf(peak), heat.value.stepMinutes)} で ${formatCount(peak)} 本`,
    };
  }),
);

const ramp = computed(() =>
  Array.from({ length: HEAT_LEVELS }, (_, index) => ({
    level: index + 1,
    background: `color-mix(in srgb, var(--k-accent) ${Math.round((ALPHA[index + 1] ?? 1) * 100)}%, var(--k-sunken))`,
  })),
);

const axis = [0, 3, 6, 9, 12, 15, 18, 21, 24];

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function draw() {
  const element = canvas.value;
  const box = element?.getBoundingClientRect();

  if (element == null || box === undefined || box.width === 0) return;

  const ratio = Math.min(2, window.devicePixelRatio || 1);
  const width = box.width;
  const height = ROW_HEIGHT * 7;

  element.width = Math.round(width * ratio);
  element.height = Math.round(height * ratio);

  const context = element.getContext('2d');

  if (context === null) return;

  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);
  context.fillStyle = cssVar('--k-sunken');
  context.fillRect(0, 0, width, height);

  const accent = cssVar('--k-accent');
  const { cells, columns, max } = heat.value;
  const cellWidth = width / columns;

  context.fillStyle = accent;

  for (let weekday = 0; weekday < 7; weekday += 1) {
    if (cellWidth >= 3) {
      for (let column = 0; column < columns; column += 1) {
        const level = heatLevel(cells[weekday * columns + column] ?? 0, max);

        if (level === 0) continue;

        context.globalAlpha = ALPHA[level] ?? 1;
        context.fillRect(
          Math.round(column * cellWidth) + 0.5,
          weekday * ROW_HEIGHT + 1,
          Math.max(1, Math.round(cellWidth) - 1.5),
          ROW_HEIGHT - 2,
        );
      }

      continue;
    }

    // Finer than a pixel: take the busiest cell each pixel covers. Averaging
    // them instead would wash the thin streaks out of a one-minute map.
    for (let x = 0; x < width; x += 1) {
      const from = Math.floor((x / width) * columns);
      const to = Math.max(from + 1, Math.ceil(((x + 1) / width) * columns));
      let peak = 0;

      for (let column = from; column < to && column < columns; column += 1) {
        peak = Math.max(peak, cells[weekday * columns + column] ?? 0);
      }

      const level = heatLevel(peak, max);

      if (level === 0) continue;

      context.globalAlpha = ALPHA[level] ?? 1;
      context.fillRect(x, weekday * ROW_HEIGHT + 1, 1, ROW_HEIGHT - 2);
    }
  }

  context.globalAlpha = 1;
  context.strokeStyle = cssVar('--k-line');
  context.lineWidth = 1;

  for (let hour = 3; hour < 24; hour += 3) {
    const x = Math.round((hour / 24) * width) + 0.5;

    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.stroke();
  }

  const at = cell.value;

  if (at === null) return;

  context.strokeStyle = cssVar('--k-text');
  context.lineWidth = 1.5;
  context.strokeRect(
    Math.round(at.column * cellWidth) + 0.25,
    at.weekday * ROW_HEIGHT + 0.75,
    Math.max(2, cellWidth),
    ROW_HEIGHT - 1.5,
  );
}

function drawColumns() {
  const element = columnChart.value;
  const box = element?.parentElement?.getBoundingClientRect();

  if (element == null || box === undefined || box.width === 0) return;

  const ratio = Math.min(2, window.devicePixelRatio || 1);
  const width = box.width;
  const height = 30;

  element.width = Math.round(width * ratio);
  element.height = Math.round(height * ratio);

  const context = element.getContext('2d');

  if (context === null) return;

  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);

  const { byColumn, columnMax, columns } = heat.value;
  const cellWidth = width / columns;

  context.fillStyle = cssVar('--k-accent');
  context.globalAlpha = 0.62;

  byColumn.forEach((value, column) => {
    if (value === 0) return;

    const barHeight = Math.max(1, (value / Math.max(1, columnMax)) * (height - 2));

    context.fillRect(
      column * cellWidth,
      height - barHeight,
      Math.max(0.6, cellWidth - (cellWidth >= 3 ? 1 : 0)),
      barHeight,
    );
  });

  context.globalAlpha = 1;
  context.strokeStyle = cssVar('--k-line');
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(0, height - 0.5);
  context.lineTo(width, height - 0.5);
  context.stroke();
}

function redraw() {
  draw();
  drawColumns();
}

function cellAt(event: PointerEvent): { weekday: number; column: number } | null {
  const box = canvas.value?.getBoundingClientRect();

  if (box === undefined || box.width === 0) return null;

  const x = event.clientX - box.left;
  const y = event.clientY - box.top;

  if (x < 0 || y < 0 || x > box.width || y > box.height) return null;

  return {
    weekday: Math.min(6, Math.max(0, Math.floor(y / ROW_HEIGHT))),
    column: Math.min(heat.value.columns - 1, Math.max(0, Math.floor((x / box.width) * heat.value.columns))),
  };
}

function move(weekdayStep: number, columnStep: number) {
  const from = cell.value ?? busiestCell(heat.value);

  if (from === null) return;

  cell.value = {
    weekday: Math.min(6, Math.max(0, from.weekday + weekdayStep)),
    column: Math.min(heat.value.columns - 1, Math.max(0, from.column + columnStep)),
  };
}

watch([() => streams, () => step], () => {
  cell.value = null;
});
watch(heat, redraw, { flush: 'post' });
watch(cell, draw);

onMounted(() => {
  redraw();
  systemTheme.addEventListener('change', redraw);
  themeObserver = new MutationObserver(redraw);
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  if (canvas.value === null) return;

  observer = new ResizeObserver(redraw);
  observer.observe(canvas.value);
});

onBeforeUnmount(() => {
  observer?.disconnect();
  themeObserver?.disconnect();
  systemTheme.removeEventListener('change', redraw);
});
</script>

<template>
  <div class="mv-panel">
    <div class="mv-head">
      <b>配信時間帯のヒートマップ</b>
      <span class="mv-grow"></span>
      <span>解像度</span>
      <SegmentGroup :items="stepItems" :value="String(step)" label="解像度" @pick="emit('step', Number($event))" />
    </div>
    <div class="mv-read mv-n">
      <template v-if="readout">
        <b>{{ readout.lead }}</b>
        <span>{{ readout.value }}</span>
        <span>{{ readout.weekday }}</span>
        <span>{{ readout.column }}</span>
      </template>
    </div>
    <div class="map">
      <div class="grid">
        <div class="days">
          <span v-for="day in weekdays" :key="day.name" :class="{ weekend: day.weekend }">{{ day.name }}</span>
        </div>
        <div class="plot">
          <canvas
            ref="canvas"
            class="canvas"
            tabindex="0"
            role="img"
            aria-label="曜日と時刻ごとの配信本数"
            @pointermove="cell = cellAt($event)"
            @pointerleave="cell = null"
            @keydown.left.prevent="move(0, -1)"
            @keydown.right.prevent="move(0, 1)"
            @keydown.up.prevent="move(-1, 0)"
            @keydown.down.prevent="move(1, 0)"
          ></canvas>
          <canvas ref="columnChart" class="columns" aria-hidden="true"></canvas>
          <div class="axis">
            <u v-for="hour in axis" :key="hour" :style="{ left: `${(hour / 24) * 100}%` }">{{ hour }}</u>
          </div>
        </div>
        <div class="totals">
          <span v-for="day in weekdays" :key="day.name">
            <i :style="{ width: `${day.width.toFixed(1)}px` }"></i>
            <b class="mv-n">{{ formatCount(day.count) }}</b>
          </span>
        </div>
      </div>
      <p class="legend">
        <span class="mv-grow"></span>
        <span>少ない</span>
        <span class="ramp">
          <i v-for="shade in ramp" :key="shade.level" :style="{ background: shade.background }"></i>
        </span>
        <span
          >多い（<span class="mv-n">{{ formatCount(heat.max) }}</span> 本）</span
        >
      </p>
      <ul class="reader-only">
        <li v-for="day in spoken" :key="day.name">{{ day.name }}曜日 {{ day.text }}</li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.map {
  min-width: 0;
  padding: 10px 12px 8px;
}

.grid {
  display: grid;
  grid-template-columns: 22px minmax(0, 1fr) 62px;
  gap: 0 7px;
  align-items: start;
}

.days {
  display: grid;
  grid-auto-rows: 24px;
}

.days span {
  color: var(--k-text-3);
  font-size: 10.5px;
  line-height: 24px;
  text-align: right;
}

.days span.weekend {
  color: var(--k-text-2);
  font-weight: 600;
}

.plot {
  min-width: 0;
}

.canvas {
  display: block;
  width: 100%;
  height: 168px;
  border-radius: 2px;
  cursor: crosshair;
}

.columns {
  display: block;
  width: 100%;
  height: 30px;
  margin-top: 4px;
}

.axis {
  position: relative;
  height: 14px;
  margin-top: 1px;
}

.axis u {
  position: absolute;
  top: 0;
  color: var(--k-text-3);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
  text-decoration: none;
  white-space: nowrap;
  transform: translateX(-50%);
}

.totals {
  display: grid;
  grid-auto-rows: 24px;
  align-content: start;
}

.totals span {
  display: flex;
  gap: 5px;
  align-items: center;
  height: 24px;
  color: var(--k-text-3);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}

.totals i {
  display: block;
  flex: none;
  min-width: 1px;
  height: 6px;
  border-radius: 1px;
  background: var(--mv-bar);
}

.totals b {
  font-weight: 500;
  white-space: nowrap;
}

.legend {
  display: flex;
  gap: 8px;
  align-items: center;
  margin: 8px 0 0;
  padding-top: 7px;
  border-top: 1px dashed var(--k-line);
  color: var(--k-text-3);
  font-size: 10.5px;
}

.ramp {
  display: flex;
  gap: 2px;
}

.ramp i {
  display: block;
  width: 16px;
  height: 9px;
  border: 1px solid var(--k-line);
  border-radius: 1px;
}

/* Read out but never drawn: the map above says the same thing to everyone who
   can see it, so putting the words on the page would be saying it twice. */
.reader-only {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: 0;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  list-style: none;
}

@container (max-width: 720px) {
  .grid {
    grid-template-columns: 20px minmax(0, 1fr);
  }

  .totals {
    display: none;
  }
}
</style>
