<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue';

import MemberAvatar from '@/parts/MemberAvatar.vue';

import {
  chartLane,
  chartLayout,
  chartTime,
  dragged,
  scrollForStrip,
  stripWindow,
  visibleMonths,
  ZOOMS,
  type ZoomId,
} from '../chart';
import { buildTrailMap, monthIndex } from '../map';
import TrailMap from './TrailMap.vue';
import { useDialogFocus } from '../useDialogFocus';
import type { AsideItem, EventItem, Filters } from '../model';
import type { VideoTableRow } from '@/lib/ranking';
import type { Channel } from '@/type/api';

/**
 * The trajectory, large.
 *
 * The same record as the rail's small chart, turned on its side so that every
 * member has a row with their name beside it. At the closer zooms the record
 * is longer than any screen, so the chart scrolls - and only the months on
 * screen are ever drawn, because a month-wide zoom over five years is a track
 * tens of thousands of pixels long.
 *
 * Pressing a station opens that record. Pressing anywhere else closes this
 * and takes the timeline to the month pressed, rather than simply vanishing:
 * a reader who is moved somewhere needs to see where they arrived.
 */
const { events, rows, channels, filters, soon, now, dark, reading } = defineProps<{
  events: readonly EventItem[];
  rows: readonly VideoTableRow[];
  channels: readonly Channel[];
  filters: Filters;
  soon: readonly AsideItem[];
  now: number;
  dark: boolean;
  /** The `YYYY-MM` the timeline is showing, so the chart can mark them. */
  reading: { from: string; to: string } | null;
}>();

const emit = defineEmits<{ close: []; month: [month: string]; member: [channelId: string]; open: [key: string] }>();

const card = useTemplateRef<HTMLDivElement>('card');
const scroller = useTemplateRef<HTMLDivElement>('scroller');
const strip = useTemplateRef<HTMLDivElement>('strip');
const zoom = ref<ZoomId>('all');
const scroll = ref(0);
const view = ref(900);
const available = ref(520);

const map = computed(() => buildTrailMap(events, rows, channels, filters, now, dark, soon));
const layout = computed(() =>
  chartLayout(view.value, map.value.lanes.length, map.value.months, zoom.value, available.value),
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

const seen = computed(() => visibleMonths(layout.value, scroll.value, map.value.months));
const x = (at: number) => chartTime(layout.value, at, map.value.months) - scroll.value;
const y = (lane: number) => chartLane(layout.value, lane);
const inView = (at: number) => at >= seen.value.from && at <= seen.value.to;

/** The runs, clipped to what is on screen so nothing off it is drawn. */
const spans = computed(() =>
  map.value.spans
    .filter((span) => span.to >= seen.value.from && span.from <= seen.value.to)
    .map((span) => ({
      ...span,
      x1: x(Math.max(span.from, seen.value.from)),
      x2: x(Math.min(span.to, seen.value.to)),
      endVisible: inView(span.to),
    })),
);

const dots = computed(() => map.value.dots.filter((dot) => inView(dot.at)));
const ties = computed(() => map.value.ties.filter((tie) => inView(tie.at)));
const bars = computed(() => map.value.bars.filter((bar) => bar.at + 1 >= seen.value.from && bar.at <= seen.value.to));

/** The years, and the months once they are far enough apart to be read. */
const perMonth = computed(() => layout.value.track / Math.max(1, map.value.months));
const ticks = computed(() => {
  const marks: { at: number; label: string; year: boolean }[] = [];

  for (const year of map.value.years) {
    if (inView(year.at)) marks.push({ at: year.at, label: String(year.year), year: true });
  }

  if (perMonth.value >= 34) {
    for (let index = Math.floor(seen.value.from); index <= Math.ceil(seen.value.to); index += 1) {
      const absolute = map.value.firstMonth + index;

      if (absolute % 12 === 0) continue;

      marks.push({ at: index, label: `${(absolute % 12) + 1}月`, year: false });
    }
  }

  return marks;
});

/**
 * The months on screen, in words.
 *
 * At the closest zoom a tick says "11月" and nothing else, which is not enough
 * to say which November. The heading carries the answer instead of crowding
 * every tick with a year.
 */
const shown = computed(() => {
  const name = (at: number) => {
    const absolute = map.value.firstMonth + Math.max(0, Math.min(map.value.months - 1, Math.floor(at)));

    return `${Math.floor(absolute / 12)}-${String((absolute % 12) + 1).padStart(2, '0')}`;
  };
  // The drawn range reaches a couple of months past the screen so that marks
  // at the edge are there before they are needed. What is *read* is the screen
  // itself, so this measures that rather than the drawing.
  const perMonth = layout.value.track / Math.max(1, map.value.months);
  const from = name(scroll.value / perMonth);
  const to = name((scroll.value + layout.value.view) / perMonth - 0.001);

  return from === to ? from : `${from} 〜 ${to}`;
});

const window = computed(() => stripWindow(layout.value, scroll.value));
const scrollable = computed(() => !narrow.value && layout.value.track > layout.value.view + 1);

/**
 * Where there is no room to lay the record out sideways.
 *
 * Below this the chart is turned the way the rail draws it - time down the
 * screen, the members across it - because a phone has height to spare and no
 * width at all. It shows the whole record at once, so there is nothing to
 * zoom or to drag: what a reader does here is press a month and be taken to
 * it (#140).
 */
const narrow = computed(() => view.value < 560);

/** The whole record, drawn once across the strip. */
const stripMarks = computed(() => {
  const scale = layout.value.view / Math.max(1, map.value.months);

  return {
    dots: map.value.dots.map((dot) => ({ at: dot.at * scale, large: dot.large })),
    now: map.value.now * scale,
    reading:
      read.value === null
        ? null
        : { from: read.value.from * scale, width: Math.max(2, (read.value.to - read.value.from) * scale) },
  };
});

function measure() {
  view.value = Math.max(320, card.value?.clientWidth ?? 900);
  available.value = Math.max(220, globalThis.innerHeight - 260);
}

function onScroll() {
  scroll.value = scroller.value?.scrollLeft ?? 0;
}

// Changing the zoom keeps the middle of the screen where it was, so the chart
// grows around what is being looked at rather than jumping to its start.
watch(zoom, (to, from) => {
  const middle =
    (scroll.value + layout.value.view / 2) /
    Math.max(1, chartLayout(view.value, map.value.lanes.length, map.value.months, from, available.value).track);

  void to;
  requestAnimationFrame(() => {
    const element = scroller.value;

    if (element === null) return;

    element.scrollLeft = Math.max(0, middle * layout.value.track - layout.value.view / 2);
  });
});

/** Dragging the strip's window, which keeps hold of the day it was grabbed by. */
let grab: { pointerId: number; offset: number } | null = null;

function stripAt(event: PointerEvent): number {
  return event.clientX - (strip.value?.getBoundingClientRect().left ?? 0);
}

function onStripDown(event: PointerEvent) {
  if (!scrollable.value) return;

  const at = stripAt(event);
  const inside = at >= window.value.from && at <= window.value.from + window.value.width;

  // Pressing outside the window puts it under the pointer first, then holds
  // it there: being able to grab it straight away is what it looks like.
  grab = { pointerId: event.pointerId, offset: inside ? at - window.value.from : window.value.width / 2 };
  strip.value?.setPointerCapture(event.pointerId);
  moveStrip(event);
}

function moveStrip(event: PointerEvent) {
  if (grab === null || event.pointerId !== grab.pointerId) return;

  const element = scroller.value;

  if (element !== null) element.scrollLeft = scrollForStrip(layout.value, stripAt(event), grab.offset);
}

function onStripUp(event: PointerEvent) {
  if (grab === null || event.pointerId !== grab.pointerId) return;

  if (strip.value?.hasPointerCapture(event.pointerId) === true) strip.value.releasePointerCapture(event.pointerId);
  grab = null;
}

/** Dragging the chart itself, and telling that from a press on a station. */
let pan: { pointerId: number; x: number; y: number; from: number; moved: boolean; type: string } | null = null;

/**
 * Whether the click now arriving is the tail of a drag.
 *
 * Kept apart from `pan`, which is gone by then: a pointerup ends the drag and
 * the click follows it, so asking "are we dragging" at click time always
 * answers no. Without this the chart moves under the finger and then, on
 * release, also opens whatever the finger came to rest on.
 */
let swallowClick = false;

function onChartDown(event: PointerEvent) {
  swallowClick = false;

  if (event.pointerType === 'mouse' && event.button !== 0) return;

  pan = {
    pointerId: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    from: scroller.value?.scrollLeft ?? 0,
    moved: false,
    type: event.pointerType,
  };
}

function onChartMove(event: PointerEvent) {
  if (pan === null || event.pointerId !== pan.pointerId) return;

  if (!pan.moved) {
    if (!dragged(pan, { x: event.clientX, y: event.clientY }, pan.type)) return;
    pan.moved = true;
    // Touch and pen scroll the container themselves; only a mouse needs this.
    if (pan.type === 'mouse') scroller.value?.setPointerCapture(event.pointerId);
  }

  if (pan.type !== 'mouse') return;

  const element = scroller.value;

  if (element !== null) element.scrollLeft = pan.from - (event.clientX - pan.x);
}

function onChartUp(event: PointerEvent) {
  if (pan === null || event.pointerId !== pan.pointerId) return;

  if (pan.moved) {
    swallowClick = true;

    if (scroller.value?.hasPointerCapture(event.pointerId) === true) {
      scroller.value.releasePointerCapture(event.pointerId);
    }
  }

  pan = null;
}

/**
 * Whether this click should be acted on, and it is asked once.
 *
 * A drag ends in exactly one click, so the flag is spent by whichever handler
 * reads it first - the station under the finger, or the chart behind it.
 */
function tapped(): boolean {
  if (!swallowClick) return true;

  swallowClick = false;

  return false;
}

/** The `YYYY-MM` a point along the track falls in. */
function monthAt(offset: number): string {
  const index = Math.floor(map.value.firstMonth + ((offset + scroll.value) / layout.value.track) * map.value.months);

  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}

function onChartClick(event: MouseEvent) {
  if (!tapped()) return;

  const box = scroller.value?.getBoundingClientRect();

  if (box === undefined) return;

  emit('month', monthAt(event.clientX - box.left));
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') emit('close');
}

useDialogFocus(card);

onMounted(() => {
  measure();
  globalThis.addEventListener('resize', measure);
  globalThis.addEventListener('keydown', onKeydown);
});

onBeforeUnmount(() => {
  globalThis.removeEventListener('resize', measure);
  globalThis.removeEventListener('keydown', onKeydown);
});
</script>

<template>
  <div class="scrim" @click.self="emit('close')">
    <div ref="card" class="card" role="dialog" aria-modal="true" aria-label="軌跡" tabindex="-1">
      <header class="head">
        <h2>軌跡</h2>
        <span v-if="!narrow" class="shown fp-n" aria-live="polite">{{ shown }}</span>

        <span v-if="!narrow" class="segments" role="group" aria-label="寄り方">
          <button
            v-for="step in ZOOMS"
            :key="step.id"
            type="button"
            :aria-pressed="zoom === step.id"
            @click="zoom = step.id"
          >
            {{ step.label }}
          </button>
        </span>

        <select
          class="picker"
          aria-label="年へ移動"
          @change="emit('month', `${($event.target as HTMLSelectElement).value}-01`)"
        >
          <option value="">年へ移動</option>
          <option v-for="year in map.years" :key="year.year" :value="String(year.year)">{{ year.year }}年</option>
        </select>

        <button type="button" class="close" aria-label="閉じる" @click="emit('close')">✕</button>
      </header>

      <!-- The whole record, small, with the part on screen as a window. -->
      <div
        v-if="scrollable"
        ref="strip"
        class="strip"
        @pointerdown="onStripDown"
        @pointermove="moveStrip"
        @pointerup="onStripUp"
        @pointercancel="onStripUp"
      >
        <svg :width="layout.view" height="30" :viewBox="`0 0 ${layout.view} 30`" role="presentation">
          <rect
            v-if="stripMarks.reading"
            class="reading"
            :x="stripMarks.reading.from"
            y="0"
            :width="stripMarks.reading.width"
            height="30"
          />
          <circle v-for="(dot, index) in stripMarks.dots" :key="index" :cx="dot.at" cy="15" :r="dot.large ? 2 : 1.2" />
          <line class="now" :x1="stripMarks.now" :x2="stripMarks.now" y1="0" y2="30" />
          <rect class="window" :x="window.from" y="0.5" :width="window.width" height="29" />
        </svg>
      </div>

      <!-- Turned on its side where there is no width: time runs down the
           screen and the members across it, which is how the rail draws the
           same record. The whole period is on screen, so there is nothing to
           zoom or to drag. -->
      <div v-if="narrow" class="upright">
        <TrailMap
          :events
          :rows
          :channels
          :filters
          :now
          :dark
          :reading
          :soon
          stations
          :available="520"
          @month="emit('month', $event)"
          @member="emit('member', $event)"
          @open="emit('open', $event)"
        />
      </div>

      <div v-else class="chart">
        <div
          v-if="layout.labels > 0"
          class="names"
          :style="{ width: `${layout.labels}px`, paddingTop: `${layout.axis}px` }"
        >
          <button
            v-for="lane in map.lanes"
            :key="lane.channel?.channelId ?? 'all'"
            type="button"
            class="name"
            :style="{ height: `${layout.laneHeight}px` }"
            :aria-pressed="lane.channel ? filters.members.has(lane.channel.channelId) : false"
            :disabled="!lane.channel"
            @click="lane.channel && emit('member', lane.channel.channelId)"
          >
            <MemberAvatar
              v-if="lane.channel"
              :src="lane.channel.thumbnailUrl"
              :name="lane.channel.name"
              :color="lane.channel.color.key"
              :size="Math.min(20, layout.laneHeight - 6)"
              :dark
            />
            <span v-else class="all">V</span>
            <span class="label">{{ lane.channel?.name ?? 'けもV 全体' }}</span>
          </button>
        </div>

        <div
          ref="scroller"
          class="scroller"
          tabindex="0"
          aria-label="軌跡図の本体"
          @scroll.passive="onScroll"
          @pointerdown="onChartDown"
          @pointermove="onChartMove"
          @pointerup="onChartUp"
          @pointercancel="onChartUp"
          @click="onChartClick"
        >
          <div class="track" :style="{ width: `${layout.track}px`, height: `${layout.height}px` }">
            <svg
              class="body"
              :width="layout.view"
              :height="layout.height"
              :viewBox="`0 0 ${layout.view} ${layout.height}`"
              role="img"
              aria-label="けもV とメンバーの軌跡"
            >
              <rect
                v-if="read"
                class="reading"
                :x="x(read.from)"
                y="0"
                :width="Math.max(2, x(read.to) - x(read.from))"
                :height="layout.height"
              />

              <g class="ticks">
                <template v-for="tick in ticks" :key="`${tick.label}${tick.at}`">
                  <line
                    :x1="x(tick.at)"
                    :x2="x(tick.at)"
                    :y1="tick.year ? 18 : 28"
                    :y2="layout.height"
                    :class="{ year: tick.year }"
                  />
                  <text :x="x(tick.at) + 3" :y="tick.year ? 14 : 24" :class="{ year: tick.year }" class="fp-n">
                    {{ tick.label }}
                  </text>
                </template>
              </g>

              <g class="volume">
                <rect
                  v-for="bar in bars"
                  :key="`v${bar.at}`"
                  :x="x(bar.at) + 0.5"
                  :y="layout.height - layout.volume * bar.amount"
                  :width="Math.max(1, perMonth - 1)"
                  :height="layout.volume * bar.amount"
                />
              </g>

              <g class="spans">
                <template v-for="span in spans" :key="`s${span.lane}`">
                  <line
                    :x1="span.x1"
                    :x2="span.x2"
                    :y1="y(span.lane)"
                    :y2="y(span.lane)"
                    :stroke="span.color === '' ? 'var(--k-text-2)' : span.color"
                    stroke-width="2.2"
                    stroke-linecap="round"
                  />
                  <line
                    v-if="span.ended && span.endVisible"
                    :x1="span.x2"
                    :x2="span.x2"
                    :y1="y(span.lane) - 5"
                    :y2="y(span.lane) + 5"
                    :stroke="span.color === '' ? 'var(--k-text-2)' : span.color"
                    stroke-width="2.2"
                  />
                </template>
              </g>

              <g class="ties">
                <line
                  v-for="(tie, index) in ties"
                  :key="`t${index}`"
                  :x1="x(tie.at)"
                  :x2="x(tie.at)"
                  :y1="y(tie.from)"
                  :y2="y(tie.to)"
                />
              </g>

              <g class="dots">
                <circle
                  v-for="(dot, index) in dots"
                  :key="`d${index}`"
                  :cx="x(dot.at)"
                  :cy="y(dot.lane)"
                  :r="dot.large ? 4.2 : 2.8"
                  :fill="dot.future ? 'var(--k-surface)' : dot.color === '' ? 'var(--k-text-2)' : dot.color"
                  :stroke="dot.large || dot.future ? (dot.color === '' ? 'var(--k-text-2)' : dot.color) : 'none'"
                  :stroke-width="dot.large ? 1.4 : 1"
                  :stroke-dasharray="dot.recurring ? '2 2' : undefined"
                  :class="{ station: dot.key !== undefined }"
                  :tabindex="dot.key !== undefined ? 0 : undefined"
                  :role="dot.key !== undefined ? 'button' : undefined"
                  :aria-label="dot.key !== undefined ? 'この記録を開く' : undefined"
                  @click.stop="dot.key !== undefined && tapped() && emit('open', dot.key)"
                  @keydown.enter.space.stop.prevent="dot.key !== undefined && emit('open', dot.key)"
                />
              </g>

              <line class="now" :x1="x(map.now)" :x2="x(map.now)" y1="18" :y2="layout.height" stroke-width="1.8" />
            </svg>
          </div>
        </div>
      </div>

      <ul class="legend">
        <li><i class="mark event"></i>できごと</li>
        <li><i class="mark tie"></i>かかわり</li>
        <li><i class="mark round"></i>めぐる日</li>
        <li><i class="mark end"></i>活動の終わり</li>
        <li><i class="mark read"></i>年表で読んでいるところ</li>
        <li><i class="mark at-now"></i>いま</li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.scrim {
  display: grid;
  position: fixed;
  z-index: 40;
  inset: 0;
  place-items: start center;
  padding: 48px 12px 12px;
  overflow: auto;
  background: rgb(8 14 13 / 50%);
}

.card {
  display: flex;
  flex-direction: column;
  width: min(1180px, 100%);
  max-height: calc(100vh - 60px);
  overflow: hidden;
  border: 1px solid var(--k-line);
  border-radius: 8px;
  background: var(--k-surface);
  box-shadow: 0 24px 60px -24px rgb(0 0 0 / 55%);
}

.head {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 10px;
  align-items: center;
  padding: 7px 10px 7px 14px;
  border-bottom: 1px solid var(--k-line);
  background: var(--k-surface-2);
}

.head h2 {
  margin: 0 4px 0 0;
  font-size: 14px;
  font-weight: 700;
  white-space: nowrap;
}

.shown {
  color: var(--k-text-3);
  font-size: 12px;
  white-space: nowrap;
}

.close {
  width: 30px;
  height: 30px;
  margin-left: auto;
  border: 1px solid var(--k-line-2);
  border-radius: 6px;
  background: var(--k-surface);
  color: var(--k-text-2);
  font: inherit;
  cursor: pointer;
}

.close:hover {
  background: var(--k-sunken);
}

.segments {
  display: inline-flex;
  overflow: hidden;
  border: 1px solid var(--k-line);
  border-radius: 6px;
  background: var(--k-surface);
}

.segments button {
  height: 28px;
  padding: 0 11px;
  border: 0;
  background: none;
  color: var(--k-text-2);
  font: inherit;
  font-size: 12.5px;
  white-space: nowrap;
  cursor: pointer;
}

.segments button + button {
  border-left: 1px solid var(--k-line);
}

.segments button[aria-pressed='true'] {
  background: var(--k-accent);
  color: var(--k-on-accent);
  font-weight: 600;
}

.picker {
  height: 30px;
  padding: 0 8px;
  border: 1px solid var(--k-line);
  border-radius: 6px;
  background: var(--k-surface);
  color: var(--k-text);
  font: inherit;
  font-size: 12.5px;
  cursor: pointer;
}

.strip {
  padding: 6px 14px 0;
  touch-action: none;
  cursor: grab;
}

.strip:active {
  cursor: grabbing;
}

.strip svg {
  display: block;
  width: 100%;
}

.strip circle {
  fill: var(--k-line-2);
}

/* The window over the part on screen. Outlined rather than filled, so the
   marks under it stay readable. */
.window {
  fill: color-mix(in srgb, var(--k-accent) 12%, transparent);
  stroke: var(--k-accent);
  stroke-width: 1;
}

.reading {
  fill: color-mix(in srgb, var(--k-accent) 14%, transparent);
}

.now {
  stroke: var(--k-accent);
}

.chart {
  display: flex;
  min-height: 0;
  overflow: hidden;
}

.upright {
  min-height: 0;
  padding: 10px 14px 4px;
  overflow: auto;
}

.names {
  flex: none;
  border-right: 1px solid var(--k-line);
}

.name {
  display: flex;
  gap: 7px;
  align-items: center;
  width: 100%;
  padding: 0 8px 0 14px;
  border: 0;
  background: none;
  color: var(--k-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.name:disabled {
  cursor: default;
}

.name[aria-pressed='true'] {
  background: var(--k-accent-soft);
}

.name .label {
  overflow: hidden;
  font-size: 12px;
  line-height: 1.2;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.all {
  display: inline-grid;
  flex: none;
  place-items: center;
  width: 20px;
  height: 20px;
  border: 1.5px solid var(--k-text-3);
  border-radius: 50%;
  color: var(--k-text-2);
  font-size: 9px;
  font-weight: 700;
}

.scroller {
  flex: 1;
  min-width: 0;
  overflow: auto hidden;
  overscroll-behavior-x: contain;
}

.track {
  position: relative;
}

/* Only the months on screen are drawn: the track behind this is what the
   scrollbar measures. */
.body {
  display: block;
  position: sticky;
  left: 0;
  user-select: none;
}

.ticks line {
  stroke: var(--k-line);
  stroke-width: 1;
}

.ticks line.year {
  stroke: var(--k-line-2);
}

.ticks text {
  fill: var(--k-text-3);
  font-size: 10px;
}

.ticks text.year {
  fill: var(--k-text-2);
  font-size: 12px;
  font-weight: 700;
}

.volume rect {
  fill: var(--k-line-2);
}

.ties line {
  stroke: var(--k-line-2);
  stroke-width: 1;
}

.station {
  cursor: pointer;
}

.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 14px;
  margin: 0;
  padding: 6px 14px 8px;
  border-top: 1px solid var(--k-line);
  color: var(--k-text-3);
  font-size: 11px;
  list-style: none;
}

.legend li {
  display: inline-flex;
  gap: 5px;
  align-items: center;
  white-space: nowrap;
}

.mark {
  display: inline-block;
  flex: none;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--k-text-2);
}

.mark.tie {
  width: 2px;
  height: 11px;
  border-radius: 0;
  background: var(--k-line-2);
}

.mark.round {
  border: 1px dashed var(--k-text-2);
  background: var(--k-surface);
}

.mark.end {
  width: 2px;
  height: 11px;
  border-radius: 0;
  background: var(--k-text-2);
}

.mark.read {
  width: 14px;
  height: 9px;
  border-radius: 2px;
  background: color-mix(in srgb, var(--k-accent) 30%, transparent);
}

.mark.at-now {
  width: 2px;
  height: 11px;
  border-radius: 0;
  background: var(--k-accent);
}

@media (prefers-reduced-motion: reduce) {
  .scroller {
    scroll-behavior: auto;
  }
}
</style>
