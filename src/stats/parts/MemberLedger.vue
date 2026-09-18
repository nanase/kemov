<script setup lang="ts">
import { computed } from 'vue';

import { changeSign, formatChange, formatCount, memberColor } from '../draw';
import {
  deltaOf,
  metricDef,
  periodLabel,
  tableSeries,
  valueOf,
  type MetricId,
  type PeriodId,
  type Subject,
} from '../model';
import type { AnnouncementKind } from '../model';
import SparkLine from './SparkLine.vue';

/**
 * The eleven members and their sum, in the order the API sends them.
 *
 * That order is `display_order` and nothing on this page may change it: a
 * table that can be sorted is a table that ranks people (#134). For the same
 * reason every row's chart is scaled inside itself, and a member who has
 * finished is marked by a dotted rail rather than by being greyed out or
 * moved to the end.
 */
const { subjects, total, metric, period, selected, dark, states, minimal } = defineProps<{
  subjects: readonly Subject[];
  total: Subject;
  metric: MetricId;
  period: PeriodId;
  selected: string;
  dark: boolean;
  /** Which members are on air, starting soon, or starting later today. */
  states: ReadonlyMap<string, AnnouncementKind>;
  /** In minimal display the rows are numbers to read, not buttons to press. */
  minimal: boolean;
}>();

const emit = defineEmits<{ select: [id: string] }>();

const series = computed(() => tableSeries(metric));
const kind = computed(() => (series.value === 'subsLevel' ? 'level' : 'flow'));
const headings = computed(() => ({
  value: metricDef(metric).head,
  change: metric === 'chatCount' ? '' : periodLabel(period),
}));

function rowStyle(subject: Subject) {
  if (subject.color === null) return undefined;

  return {
    '--member-color': memberColor(subject.color, dark),
    '--member-pick': memberColor(subject.color, dark, dark ? 0.13 : 0.09),
  };
}

function press(id: string) {
  if (!minimal) emit('select', id);
}
</script>

<template>
  <div class="ledger">
    <table>
      <colgroup>
        <col />
        <col class="c-value" />
        <col class="c-change" />
        <col class="c-spark" />
      </colgroup>
      <thead>
        <tr>
          <th class="h-name" scope="col">配信者</th>
          <th scope="col">{{ headings.value }}</th>
          <th scope="col">{{ headings.change }}</th>
          <th class="h-spark" scope="col"></th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="subject in subjects"
          :key="subject.id"
          :style="rowStyle(subject)"
          :aria-selected="selected === subject.id"
          :tabindex="minimal ? undefined : 0"
          :role="minimal ? undefined : 'button'"
          @click="press(subject.id)"
          @keydown.enter.prevent="press(subject.id)"
          @keydown.space.prevent="press(subject.id)"
        >
          <td class="c-name">
            <span class="who" :class="{ ended: subject.ended }">
              <span class="rail" aria-hidden="true"></span>
              <img v-if="subject.avatar" :src="subject.avatar" alt="" width="20" height="20" decoding="async" />
              <span v-else class="no-avatar" aria-hidden="true"></span>
              <span class="name-wrap">
                <span class="name">{{ subject.name }}</span>
                <span
                  v-if="states.get(subject.id)"
                  class="state-dot"
                  :data-state="states.get(subject.id)"
                  :title="states.get(subject.id) === 'live' ? '配信中' : '本日開始予定'"
                ></span>
              </span>
            </span>
          </td>
          <td class="c-value n">{{ formatCount(valueOf(subject, metric)) }}</td>
          <td class="c-change n">
            <span class="change" :data-sign="changeSign(deltaOf(subject, metric, period)?.value)">
              {{ metric === 'chatCount' ? '' : formatChange(deltaOf(subject, metric, period)?.value) }}
            </span>
          </td>
          <td class="c-spark">
            <SparkLine :values="subject.months[series]" :kind="kind" />
            <span class="pick" aria-hidden="true"></span>
          </td>
        </tr>
      </tbody>
      <tfoot>
        <tr
          :aria-selected="selected === total.id"
          :tabindex="minimal ? undefined : 0"
          :role="minimal ? undefined : 'button'"
          @click="press(total.id)"
          @keydown.enter.prevent="press(total.id)"
          @keydown.space.prevent="press(total.id)"
        >
          <td class="c-name">
            <span class="who">
              <span class="rail" aria-hidden="true"></span>
              <span class="no-avatar" aria-hidden="true"></span>
              <span class="name total-name">{{ total.name }}</span>
            </span>
          </td>
          <td class="c-value n">{{ formatCount(valueOf(total, metric)) }}</td>
          <td class="c-change n">
            <span class="change" :data-sign="changeSign(deltaOf(total, metric, period)?.value)">
              {{ metric === 'chatCount' ? '' : formatChange(deltaOf(total, metric, period)?.value) }}
            </span>
          </td>
          <td class="c-spark">
            <SparkLine :values="total.months[series]" :kind="kind" />
            <span class="pick" aria-hidden="true"></span>
          </td>
        </tr>
      </tfoot>
    </table>
  </div>
</template>

<style scoped>
.ledger {
  min-height: 0;
  overflow: auto;
  border: 1px solid var(--k-line);
  border-radius: 8px;
  background: var(--k-surface);
  box-shadow: var(--k-shadow);
}

table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}

col.c-value {
  width: 84px;
}

col.c-change {
  width: 70px;
}

col.c-spark {
  width: 36%;
}

thead th {
  position: sticky;
  top: 0;
  z-index: 2;
  padding: 7px 6px;
  border-bottom: 1px solid var(--k-line-2);
  background: var(--k-surface-2);
  color: var(--k-text-3);
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-align: right;
  white-space: nowrap;
}

thead th.h-name {
  padding-left: 10px;
  text-align: left;
}

thead th.h-spark {
  text-align: left;
}

tbody td,
tfoot td {
  padding: 4px 6px;
  border-bottom: 1px solid var(--k-line);
  font-size: 12.5px;
  vertical-align: middle;
}

tbody tr:last-child td {
  border-bottom: 0;
}

tbody tr[role='button'],
tfoot tr[role='button'] {
  cursor: pointer;
}

tbody tr[role='button']:hover td {
  background: var(--k-surface-2);
}

tbody tr[aria-selected='true'] td {
  background: var(--member-pick, var(--k-surface-2));
}

tbody tr[aria-selected='true'] .name {
  color: var(--member-color);
  font-weight: 600;
}

td.c-name {
  padding-left: 0;
}

.who {
  display: grid;
  grid-template-columns: 3px 20px minmax(0, 1fr);
  align-items: center;
  gap: 7px;
  min-height: 26px;
}

.rail {
  width: 3px;
  height: 22px;
  border-radius: 0 2px 2px 0;
  background: var(--member-color, var(--k-accent));
}

/* A member who has finished is told apart by the dotted rail alone: not by
   colour, not by weight, and not by where they sit in the list (#134). */
.who.ended .rail {
  height: 24px;
  border-right: 3px dotted var(--member-color, var(--k-accent));
  background: none;
}

.who img,
.no-avatar {
  width: 20px;
  height: 20px;
  border-radius: 50%;
}

.who img {
  transition: transform 0.22s ease;
}

.name-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  transition: transform 0.22s ease;
}

tbody tr[role='button']:hover .who img {
  transform: scale(1.45);
}

tbody tr[role='button']:hover .name-wrap {
  transform: translateX(6px);
}

.name {
  overflow: hidden;
  font-size: 12.5px;
  font-weight: 500;
  line-height: 1.25;
  text-overflow: ellipsis;
  overflow-wrap: anywhere;
}

.state-dot {
  flex: none;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: currentcolor;
}

.state-dot[data-state='live'] {
  position: relative;
  color: var(--k-live);
}

.state-dot[data-state='live']::after {
  content: '';
  position: absolute;
  inset: -4px;
  border: 1px solid currentcolor;
  border-radius: 50%;
  opacity: 0.35;
  animation: ledger-breath 3.6s ease-in-out infinite;
}

.state-dot[data-state='soon'] {
  color: var(--k-accent);
}

.state-dot[data-state='today'] {
  color: var(--k-line-2);
}

@keyframes ledger-breath {
  0%,
  100% {
    opacity: 0.35;
    transform: scale(0.8);
  }

  55% {
    opacity: 0;
    transform: scale(1.6);
  }
}

td.c-value,
td.c-change {
  text-align: right;
  white-space: nowrap;
}

td.c-value {
  font-size: 13px;
}

.change[data-sign='pos'] {
  color: var(--k-ok);
}

.change[data-sign='neg'] {
  color: var(--k-warn);
}

.change[data-sign='zero'] {
  color: var(--k-line-2);
}

td.c-spark {
  position: relative;
  padding-right: 20px;
}

.pick {
  display: none;
}

tr[aria-selected='true'] .pick {
  display: block;
  position: absolute;
  top: 2px;
  right: 0;
  bottom: 2px;
  width: 3px;
  border-radius: 2px 0 0 2px;
  background: var(--member-color, var(--k-accent));
}

tfoot td {
  position: sticky;
  bottom: 0;
  z-index: 2;
  border-top: 2px solid var(--k-line-2);
  border-bottom: 0;
  background: var(--k-surface-2);
  font-weight: 600;
}

tfoot tr[aria-selected='true'] td {
  background: var(--k-accent-soft);
}

.total-name {
  font-weight: 700;
  letter-spacing: 0.06em;
}

@container (max-width: 1120px) {
  col.c-value {
    width: 76px;
  }

  col.c-change {
    width: 62px;
  }
}

@container (max-width: 560px) {
  col.c-value {
    width: 66px;
  }

  col.c-change {
    width: 58px;
  }

  col.c-spark {
    width: 26%;
  }
}

@container (max-width: 430px) {
  thead th,
  tbody td,
  tfoot td {
    padding: 4px;
  }

  col.c-value {
    width: 62px;
  }

  col.c-change {
    width: 52px;
  }

  .who {
    grid-template-columns: 3px 18px minmax(0, 1fr);
    gap: 5px;
  }

  .who img,
  .no-avatar {
    width: 18px;
    height: 18px;
  }

  .name {
    font-size: 11.5px;
  }

  td.c-value {
    font-size: 12px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .who img,
  .name-wrap {
    transition: none;
  }

  tbody tr[role='button']:hover .who img,
  tbody tr[role='button']:hover .name-wrap {
    transform: none;
  }

  .state-dot[data-state='live']::after {
    animation: none;
  }
}
</style>
