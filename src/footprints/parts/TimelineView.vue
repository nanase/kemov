<script setup lang="ts">
import { computed } from 'vue';

import MemberAvatar from '@/parts/MemberAvatar.vue';
import { formatCount } from '@/lib/numberFormat';

import { formatDate, formatDayOfMonth, formatMonthDay, formatTime, formatWeekday } from '../draw';
import { jstDay, jstParts, yearFaces, type Filters, type Timeline, type TimelineItem } from '../model';
import EventCard from './EventCard.vue';
import StreamBundle from './StreamBundle.vue';
import type { Channel } from '@/type/api';

/**
 * The road itself: years, the months inside them, and the rows inside those.
 *
 * The axis is the trail. Every row carries a footprint tile behind its node,
 * filled for the days already walked and dotted for the ones still to come,
 * so that the column reads as one path rather than as a list with a rule down
 * the side. The month's heading sticks inside that column while the month is
 * on screen, level with the date beside it.
 */
const { timeline, channels, filters, open, now, dark, flashed } = defineProps<{
  timeline: Timeline;
  channels: readonly Channel[];
  filters: Filters;
  /** The runs of streams the reader has opened. */
  open: ReadonlySet<string>;
  now: number;
  dark: boolean;
  /** The `YYYY-MM` a reader has just been sent to, lit for a moment. */
  flashed: string | null;
}>();

const emit = defineEmits<{ toggle: [key: string]; open: [key: string] }>();

const byId = computed(() => new Map(channels.map((channel) => [channel.channelId, channel])));
const descending = computed(() => filters.order === 'desc');

/** The first year the road has, which is what "N 年目" counts from. */
const firstYear = computed(() =>
  timeline.years.reduce((earliest, year) => Math.min(earliest, year.year), Number.POSITIVE_INFINITY),
);

const years = computed(() => {
  const list = timeline.years.map((year) => ({
    ...year,
    faces: yearFaces(channels, year.year, now),
    months: year.months.map((month) => ({
      ...month,
      rows: rowsOf(month.items),
    })),
  }));

  if (!descending.value) return list;

  return [...list].reverse().map((year) => ({
    ...year,
    months: [...year.months].reverse().map((month) => ({ ...month, rows: [...month.rows].reverse() })),
  }));
});

/** One row of the timeline, with what the date column says about it. */
function rowsOf(items: readonly TimelineItem[]) {
  let previousDay: string | null = null;

  return items.map((item) => {
    const day = item.kind === 'bundle' ? spansOneDay(item) : item.kind === 'event' ? eventDay(item) : null;
    const repeat = day !== null && day === previousDay;

    previousDay = day;

    return { item, repeat, future: item.kind !== 'now' && item.at > now };
  });
}

function eventDay(item: Extract<TimelineItem, { kind: 'event' }>): string | null {
  return item.event.datePrecision === 'day' ? jstDay(item.at) : null;
}

function spansOneDay(item: Extract<TimelineItem, { kind: 'bundle' }>): string | null {
  const first = jstDay(item.at);

  return first === jstDay(item.endAt) ? first : null;
}

/** What the date column says for a run: one day, or the days it ran between. */
function bundleDate(item: Extract<TimelineItem, { kind: 'bundle' }>) {
  const from = descending.value ? item.endAt : item.at;
  const to = descending.value ? item.at : item.endAt;
  const sameDay = jstDay(item.at) === jstDay(item.endAt);
  const toText = jstParts(from).month === jstParts(to).month ? formatDayOfMonth(to) : formatMonthDay(to);

  return { from, to, sameDay, toText };
}

function membersOf(channelIds: readonly string[]): Channel[] {
  return channelIds.flatMap((id) => {
    const channel = byId.value.get(id);

    return channel === undefined ? [] : [channel];
  });
}
</script>

<template>
  <div class="timeline">
    <section v-for="year in years" :key="year.year" class="year" :data-year="year.year">
      <header class="year-head">
        <div class="axis"><span class="year-node" aria-hidden="true"></span></div>
        <div class="year-about">
          <h2 class="fp-n">{{ year.year }}</h2>
          <span class="year-sum fp-n">
            けもV {{ year.year - firstYear + 1 }} 年目<template v-if="year.events > 0">
              ・できごと {{ formatCount(year.events) }} 件</template
            ><template v-if="year.streams > 0">
              ・{{ filters.streams === 'key' ? '重要な配信' : '配信・動画' }}
              {{ formatCount(year.streams) }} 本</template
            >
          </span>
          <span v-if="year.faces.length > 0" class="year-faces">
            <span class="faces-label">顔ぶれ</span>
            <MemberAvatar
              v-for="face in year.faces"
              :key="face.channelId"
              :src="face.thumbnailUrl"
              :name="face.name"
              :color="face.color.key"
              :size="20"
              :dark
            />
          </span>
        </div>
      </header>

      <section v-for="month in year.months" :key="month.month" class="month" :data-month="month.month">
        <div class="month-label" aria-hidden="true">
          <div class="month-label-in" :class="{ flashed: month.month === flashed }">
            <span class="month-year fp-n">{{ month.year }}</span>
            <span class="month-of fp-n">{{ month.monthOfYear }}<small>月</small></span>
          </div>
        </div>

        <div class="rows">
          <div
            v-for="row in month.rows"
            :key="row.item.key"
            class="row"
            :class="{
              event: row.item.kind === 'event',
              large: row.item.kind === 'event' && row.item.event.emphasized,
              bundle: row.item.kind === 'bundle',
              now: row.item.kind === 'now',
              future: row.future,
            }"
          >
            <div class="axis"><span class="node" aria-hidden="true"></span></div>

            <div class="date fp-n">
              <div class="date-in">
                <template v-if="row.item.kind === 'now'">
                  <b>いま</b>
                </template>
                <template v-else-if="row.item.kind === 'bundle'">
                  <template v-if="!bundleDate(row.item).sameDay">
                    <b>{{ formatDayOfMonth(bundleDate(row.item).from) }}</b>
                    <span>({{ formatWeekday(bundleDate(row.item).from) }})</span>
                    <span>〜{{ bundleDate(row.item).toText }}</span>
                  </template>
                  <template v-else-if="!row.repeat">
                    <b>{{ formatDayOfMonth(row.item.at) }}</b>
                    <span>({{ formatWeekday(row.item.at) }})</span>
                  </template>
                </template>
                <template v-else-if="row.item.event.datePrecision === 'month'">
                  <b>{{ jstParts(row.item.at).month }}月</b>
                  <span>日は不明</span>
                </template>
                <template v-else-if="row.item.event.datePrecision === 'year'">
                  <b>{{ jstParts(row.item.at).year }}年</b>
                  <span>月日は不明</span>
                </template>
                <template v-else>
                  <template v-if="!row.repeat">
                    <b>{{ formatDayOfMonth(row.item.at) }}</b>
                    <span>({{ formatWeekday(row.item.at) }})</span>
                  </template>
                  <span v-if="row.item.timed">{{ formatTime(row.item.at) }}</span>
                </template>
              </div>
            </div>

            <EventCard
              v-if="row.item.kind === 'event'"
              :item="row.item"
              :members="membersOf(row.item.event.channelIds)"
              :dark
              @open="emit('open', $event)"
            />
            <StreamBundle
              v-else-if="row.item.kind === 'bundle'"
              :item="row.item"
              :channels="byId"
              :open="open.has(row.item.key)"
              :dark
              @toggle="emit('toggle', $event)"
              @open="emit('open', $event)"
            />
            <div v-else class="now-bar">
              <span class="now-tag"
                ><time class="fp-n">{{ formatDate(now) }} {{ formatTime(now) }}</time></span
              >
            </div>
          </div>
        </div>
      </section>
    </section>
  </div>
</template>

<style scoped>
.timeline {
  position: relative;
  min-width: 0;
}

.year-head {
  display: grid;
  grid-template-columns: var(--fp-axis) minmax(0, 1fr);
  column-gap: 10px;
  align-items: center;
  padding: 30px 0 12px;
}

.year:first-child .year-head {
  padding-top: 0;
}

.year-node {
  display: block;
  position: absolute;
  top: 50%;
  left: 50%;
  width: 18px;
  height: 18px;
  margin: -9px 0 0 -9px;
  border: 3px solid var(--k-text-2);
  border-radius: 50%;
  box-shadow: 0 0 0 3px var(--k-bg);
  background: var(--k-bg);
}

.year-about {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 14px;
  align-items: baseline;
  min-width: 0;
}

.year-about h2 {
  margin: 0;
  font-size: 30px;
  font-weight: 700;
  line-height: 1.1;
}

.year-sum {
  color: var(--k-text-3);
  font-size: 12px;
}

.year-faces {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 3px;
  align-items: center;
  align-self: baseline;
}

.faces-label {
  margin-right: 3px;
  color: var(--k-text-3);
  font-size: 12px;
  font-weight: 600;
}

.month {
  position: relative;
}

/* The month's heading rides inside the trail rather than above it, so the
   road is not cut in two every month. */
.month-label {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  z-index: 3;
  width: var(--fp-axis);
  pointer-events: none;
}

/* The month a reader has just been sent to, lit long enough to be found. */
.month-label-in.flashed {
  animation: month-flash 1.6s ease-out 1;
}

@keyframes month-flash {
  0%,
  35% {
    box-shadow: 0 0 0 3px var(--k-accent);
  }

  100% {
    box-shadow: 0 0 0 3px var(--k-bg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .month-label-in.flashed {
    animation: none;
    box-shadow: 0 0 0 3px var(--k-accent);
  }
}

.month-label-in {
  display: flex;
  position: sticky;
  top: calc(var(--shell-nav-height, 44px) + 10px);
  flex-direction: column;
  align-items: center;
  margin: 17px 3px 0;
  padding: 3px 0 4px;
  border-radius: 6px;
  box-shadow: 0 0 0 3px var(--k-bg);
  background: var(--k-bg);
  line-height: 1.15;
}

.month-year {
  color: var(--k-text-3);
  font-size: 10.5px;
}

.month-of {
  font-size: 20px;
  font-weight: 700;
}

.month-of small {
  margin-left: 1px;
  font-size: 11.5px;
  font-weight: 600;
}

.rows {
  min-width: 0;
  padding: 6px 0 8px;
}

.row {
  display: grid;
  position: relative;
  grid-template-columns: var(--fp-axis) var(--fp-date) minmax(0, 1fr);
  padding: 5px 0;
}

.row.large {
  padding: 12px 0;
}

/* The trail: one tile of footprints per row, in the axis column. */
.axis {
  position: relative;
  background-image: var(--fp-trail-past);
  background-position: center top;
  background-repeat: repeat-y;
  background-size: 28px 50px;
}

.row.future .axis,
.year:has(.row.future) .year-head .axis {
  background-image: var(--fp-trail-future);
}

.node {
  display: block;
  position: absolute;
  top: 12px;
  left: 50%;
  width: var(--fp-node);
  height: var(--fp-node);
  margin-left: calc(var(--fp-node) / -2);
  border-radius: 50%;
  box-shadow: 0 0 0 5px var(--k-bg);
  background: var(--k-accent);
}

/* The same size for every kind, told apart by what is drawn inside it (#140). */
.row.event .node {
  background: var(--k-accent)
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='18' height='18' viewBox='0 0 18 18'%3E%3Cpath d='M2.9 7.1 15.1 3.2v11.6L2.9 10.9Z' fill='%23fff' stroke='%23fff' stroke-width='1.5' stroke-linejoin='round'/%3E%3Cpath d='M5.6 10.6 6.5 15.2h2.2L7.8 11.6' fill='%23fff' stroke='%23fff' stroke-width='1.2' stroke-linejoin='round'/%3E%3C/svg%3E")
    center / 18px 18px no-repeat;
}

.row.bundle .node {
  background: var(--k-text-3)
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='18' height='18' viewBox='0 0 18 18'%3E%3Cpath d='M6 3.4 14.6 9 6 14.6Z' fill='%23fff' stroke='%23fff' stroke-width='1.6' stroke-linejoin='round'/%3E%3C/svg%3E")
    center / 15px 15px no-repeat;
}

.row.now .node {
  top: 50%;
  margin-top: calc(var(--fp-node) / -2);
  background: var(--k-accent)
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='18' height='18' viewBox='0 0 18 18'%3E%3Cpath d='M5.4 2V16' fill='none' stroke='%23fff' stroke-width='2' stroke-linecap='round'/%3E%3Cpath d='M6.8 2.8 15.6 6 6.8 9.2Z' fill='%23fff' stroke='%23fff' stroke-width='1.4' stroke-linejoin='round'/%3E%3C/svg%3E")
    center / 18px 18px no-repeat;
}

/* What has not happened yet is hollow, with a dashed edge. */
.row.future .node {
  border: 2px dashed var(--k-accent);
  background-color: var(--k-bg);
}

.date {
  min-width: 0;
  padding: 9px 10px 0 0;
  color: var(--k-text-2);
  line-height: 1.3;
  text-align: right;
}

.date-in {
  position: sticky;
  top: calc(var(--shell-nav-height, 44px) + 10px);
}

.date b {
  display: block;
  color: var(--k-text);
  font-size: 14px;
  font-weight: 600;
}

.row.large .date {
  padding-top: 14px;
}

.row.large .date b {
  font-size: 17px;
  font-weight: 700;
}

.row.now .date b {
  color: var(--k-accent);
}

.date span {
  display: block;
  color: var(--k-text-3);
  font-size: 11.5px;
  white-space: nowrap;
}

.now-bar {
  display: flex;
  gap: 10px;
  align-items: center;
  min-width: 0;
}

.now-bar::after {
  content: '';
  flex: 1;
  border-top: 2px solid var(--k-accent);
}

.now-tag {
  display: inline-flex;
  gap: 8px;
  align-items: center;
  height: 26px;
  padding: 0 10px;
  border-radius: 999px;
  background: var(--k-accent);
  color: var(--k-on-accent);
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}

.now-tag time {
  font-weight: 500;
}

@container (max-width: 1040px) {
  .row {
    grid-template-columns: var(--fp-axis) var(--fp-date) minmax(0, 1fr);
  }
}

@container (max-width: 620px) {
  .year-about h2 {
    font-size: 25px;
  }

  .month-year {
    font-size: 9.5px;
  }

  .month-of {
    font-size: 16px;
  }

  .month-of small {
    font-size: 10px;
  }

  .date {
    padding-right: 6px;
  }

  .date b,
  .row.large .date b {
    font-size: 12.5px;
  }

  .date span {
    font-size: 10.5px;
  }
}
</style>
