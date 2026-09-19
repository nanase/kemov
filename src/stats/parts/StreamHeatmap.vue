<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue';

import { memberColor } from '@/lib/memberColor';
import { DAY_NAMES } from '@/lib/timeFormat';
import { formatMinutes, slotLabel } from '../draw';
import { busiestCell, dayPeaks, heatGrid, heatPeak } from '../model';

/**
 * When this member is on air, over a week.
 *
 * A cell holds the minutes streamed in it, not the streams that began in it:
 * a four-hour stream fills the four hours it covers. The shades are the
 * member's own colour against their own busiest cell, so the map never says
 * anything about anyone else.
 *
 * Drawn on a canvas rather than as elements: the finest step is 10,080 cells,
 * which is that many nodes to lay out and repaint on every hover.
 */
const { spans, step, color } = defineProps<{
  spans: readonly number[];
  /** Minutes per cell: 60, 30, 10 or 1. */
  step: number;
  /** The member's own colour, or null for the sum, which uses the page accent. */
  color: string | null;
}>();

const canvas = useTemplateRef<HTMLCanvasElement>('canvas');
const hover = ref<{ day: number; slot: number } | null>(null);
let observer: ResizeObserver | undefined;
// The canvas holds colours rather than reading them from CSS, so it has to be
// told when the theme changes: by the button, which writes data-theme, or by
// the device while the theme follows it.
let themeObserver: MutationObserver | undefined;
const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');

const grid = computed(() => heatGrid(spans, step));
const peak = computed(() => heatPeak(grid.value));
const columns = computed(() => grid.value[0]?.length ?? 0);

const readout = computed(() => {
  const at = hover.value;

  if (at !== null) {
    return {
      lead: `${DAY_NAMES[at.day]} ${slotLabel(at.slot, step)}`,
      value: formatMinutes(grid.value[at.day]?.[at.slot] ?? 0),
    };
  }

  const busiest = busiestCell(grid.value);

  return {
    lead: `最も長い時間帯 ${DAY_NAMES[busiest.day]} ${slotLabel(busiest.slot, step)}`,
    value: formatMinutes(busiest.minutes),
  };
});

/**
 * The map in words, for a reader who cannot point at it.
 *
 * One line per day rather than one per cell: the shades are looked at to find
 * when someone is usually on air, and at the finest step the cells number
 * 10,080 - a list that long says the same thing in a form nobody can hold.
 * It follows the step, so a finer map is described more finely.
 */
const spoken = computed(() =>
  dayPeaks(grid.value).map((day) => ({
    name: DAY_NAMES[day.day] ?? '',
    text:
      day.total === 0 ? '配信なし' : `最も長い時間帯は ${slotLabel(day.slot, step)} で ${formatMinutes(day.minutes)}`,
  })),
);

function isDark(): boolean {
  return getComputedStyle(document.documentElement).colorScheme.includes('dark');
}

function draw() {
  const element = canvas.value;
  const box = element?.getBoundingClientRect();

  if (element == null || box === undefined || box.width === 0) return;

  const ratio = Math.min(2, window.devicePixelRatio || 1);

  element.width = Math.round(box.width * ratio);
  element.height = Math.round(box.height * ratio);

  const context = element.getContext('2d');

  if (context === null) return;

  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, box.width, box.height);

  const dark = isDark();
  const base = color ?? (dark ? '#4ecfb8' : '#0c6a5d');
  const rowHeight = box.height / 7;
  const columnWidth = box.width / columns.value;
  const gap = columnWidth > 6 ? 1 : 0;

  grid.value.forEach((row, day) =>
    row.forEach((minutes, slot) => {
      if (minutes <= 0) return;

      // The shade rises faster at the quiet end, so an hour that is used once
      // a month is still visible beside one used every week.
      const weight = Math.round((0.1 + 0.9 * Math.pow(minutes / peak.value, 0.75)) * 100) / 100;

      context.fillStyle = memberColor(base, dark, weight);
      context.fillRect(
        slot * columnWidth,
        day * rowHeight,
        Math.max(columnWidth - gap, 0.35),
        Math.max(rowHeight - 1, 1),
      );
    }),
  );

  // A mark every three hours, so a fine step does not become a field with no
  // landmarks in it.
  context.fillStyle = dark ? 'rgb(255 255 255 / 10%)' : 'rgb(14 31 28 / 10%)';

  for (let hour = 3; hour < 24; hour += 3) context.fillRect((hour / 24) * box.width, 0, 1, box.height);

  const at = hover.value;

  if (at === null) return;

  context.strokeStyle = dark ? 'rgb(255 255 255 / 85%)' : 'rgb(14 31 28 / 75%)';
  context.lineWidth = 1;
  context.strokeRect(
    Math.round(at.slot * columnWidth) - 0.5,
    Math.round(at.day * rowHeight) - 0.5,
    Math.max(columnWidth, 2) + 1,
    rowHeight + 1,
  );
}

function onMove(event: PointerEvent) {
  const box = canvas.value?.getBoundingClientRect();

  if (box === undefined || columns.value === 0) return;

  const slot = Math.min(
    columns.value - 1,
    Math.max(0, Math.floor(((event.clientX - box.left) / box.width) * columns.value)),
  );
  const day = Math.min(6, Math.max(0, Math.floor(((event.clientY - box.top) / box.height) * 7)));

  if (hover.value?.day === day && hover.value?.slot === slot) return;

  hover.value = { day, slot };
}

watch([grid, hover], draw);

onMounted(() => {
  draw();
  systemTheme.addEventListener('change', draw);
  themeObserver = new MutationObserver(draw);
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  if (canvas.value === null) return;

  observer = new ResizeObserver(draw);
  observer.observe(canvas.value);
});

onBeforeUnmount(() => {
  observer?.disconnect();
  themeObserver?.disconnect();
  systemTheme.removeEventListener('change', draw);
});
</script>

<template>
  <div class="heatmap">
    <div class="map">
      <div class="days">
        <span v-for="day in DAY_NAMES" :key="day">{{ day }}</span>
      </div>
      <canvas ref="canvas" class="canvas" @pointermove="onMove" @pointerleave="hover = null"></canvas>
    </div>
    <div class="map hours">
      <span></span>
      <div class="ticks">
        <span
          v-for="hour in [0, 3, 6, 9, 12, 15, 18, 21]"
          :key="hour"
          class="n"
          :style="{ left: `${(hour / 24) * 100}%` }"
          :data-edge="hour === 0 ? 'left' : undefined"
          >{{ hour }}</span
        >
      </div>
    </div>
    <p class="readout n">
      {{ readout.lead }} <b>{{ readout.value }}</b>
    </p>
    <ul class="reader-only">
      <li v-for="day in spoken" :key="day.name">{{ day.name }}曜日 {{ day.text }}</li>
    </ul>
  </div>
</template>

<style scoped>
.heatmap {
  display: grid;
  gap: 6px;
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

.map {
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr);
  gap: 6px;
}

.days {
  display: grid;
  grid-template-rows: repeat(7, 1fr);
  color: var(--k-text-3);
  font-size: 10px;
  text-align: right;
}

.days span {
  align-self: center;
  line-height: 1;
}

.canvas {
  display: block;
  width: 100%;
  height: 126px;
  border-radius: 2px;
  background: var(--k-track);
  touch-action: pan-y;
}

.ticks {
  position: relative;
  height: 13px;
}

.ticks span {
  position: absolute;
  top: 0;
  transform: translateX(-50%);
  color: var(--k-text-3);
  font-size: 9.5px;
}

.ticks span[data-edge='left'] {
  transform: none;
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

@container (max-width: 560px) {
  .map {
    grid-template-columns: 16px minmax(0, 1fr);
    gap: 4px;
  }

  .days {
    font-size: 9px;
  }

  .ticks span {
    font-size: 9px;
  }
}
</style>
