<script setup lang="ts">
import { computed } from 'vue';

import { changeSign, formatChange, formatCount, memberAccent, memberColor } from '../draw';
import {
  deltaOf,
  HEAT_STEPS,
  knownId,
  METRICS,
  periodLabel,
  seriesDef,
  SERIES,
  valueOf,
  type AnnouncementKind,
  type HeatStep,
  type MetricId,
  type PeriodId,
  type SeriesId,
  type Subject,
} from '../model';
import MemberAvatar from './MemberAvatar.vue';
import MonthChart from './MonthChart.vue';
import RecentStreams, { type StreamRow } from './RecentStreams.vue';
import SegmentGroup from './SegmentGroup.vue';
import StreamHeatmap from './StreamHeatmap.vue';

/**
 * One member's own page, beside the list.
 *
 * Everything in it is about that member: their four numbers, their months,
 * the week they keep, and their last few streams. Nothing here is drawn
 * against anybody else (#134), which is why the record can be opened for the
 * sum without changing what any of it means.
 */
const { subject, metric, period, series, step, months, dark, state, streams, heading } = defineProps<{
  subject: Subject;
  metric: MetricId;
  period: PeriodId;
  series: SeriesId;
  /** Minutes per heatmap cell. */
  step: HeatStep;
  months: readonly string[];
  dark: boolean;
  /** Whether this member is on air or due to start, when they are. */
  state: AnnouncementKind | undefined;
  streams: readonly StreamRow[];
  /** What the panel says at its top; the sum says how many members it covers. */
  heading: string;
}>();

const emit = defineEmits<{ metric: [id: MetricId]; series: [id: SeriesId]; step: [minutes: HeatStep]; close: [] }>();

// The same list the page checks the kept choice against, as the buttons need
// it: one row of ids, written the way a segment group reads them.
const STEPS = HEAT_STEPS.map(({ id, label }) => ({ id: String(id), label }));

const colors = computed(() =>
  subject.color === null
    ? { '--member-color': 'var(--k-accent)', '--member-accent': dark ? '#9df0e0' : '#064b42' }
    : { '--member-color': memberColor(subject.color, dark), '--member-accent': memberAccent(subject.color, dark) },
);

const figures = computed(() =>
  METRICS.map((m) => ({
    id: m.id,
    key: m.head,
    value: formatCount(valueOf(subject, m.id)),
    change: deltaOf(subject, m.id, period)?.value ?? null,
    hasChange: deltaOf(subject, m.id, period) !== null,
  })),
);

const chosenSeries = computed(() => seriesDef(series));
const seriesItems = SERIES.map((s) => ({
  id: s.id,
  label: s.label,
  title: s.id === 'views' ? 'その月に出した動画が、今までに集めた再生数' : undefined,
}));
</script>

<template>
  <section class="record" :style="colors" :class="{ ended: subject.ended }">
    <div class="back">
      <span class="rail" :class="{ ended: subject.ended }" aria-hidden="true"></span>
      <MemberAvatar
        v-if="subject.members === undefined"
        :src="subject.avatar"
        :name="subject.name"
        :color="subject.color"
        :size="22"
        :dark="dark"
      />
      <span class="back-name">{{ subject.name }}</span>
      <button type="button" class="close" aria-label="一覧へ戻る" @click="emit('close')">×</button>
    </div>

    <header class="head">
      <div class="portrait">
        <div v-if="subject.members" class="stack">
          <MemberAvatar
            v-for="member in subject.members"
            :key="member.id"
            :src="member.avatar"
            :name="member.name"
            :color="member.color"
            :size="20"
            :dark="dark"
          />
        </div>
        <MemberAvatar
          v-else
          :src="subject.avatar"
          :name="subject.name"
          :color="subject.color"
          :size="46"
          :dark="dark"
        />
      </div>
      <div class="titles">
        <h2 class="name">
          <a v-if="subject.members === undefined" :href="`/members/${subject.id}`">{{ subject.name }}</a>
          <template v-else>{{ subject.name }}</template>
        </h2>
        <p class="span n">{{ heading }}</p>
      </div>
      <span v-if="state" class="mark" :data-kind="state">
        {{ state === 'live' ? 'LIVE' : state === 'soon' ? 'まもなく開始' : '本日開始予定' }}
      </span>
    </header>

    <div class="figures">
      <button
        v-for="figure in figures"
        :key="figure.id"
        type="button"
        class="figure"
        :aria-pressed="figure.id === metric"
        @click="emit('metric', figure.id)"
      >
        <span class="key">{{ figure.key }}</span>
        <span class="value n">{{ figure.value }}</span>
        <span class="change n" :data-sign="changeSign(figure.change)">
          <template v-if="figure.hasChange">{{ periodLabel(period) }} {{ formatChange(figure.change) }}</template>
        </span>
      </button>
    </div>

    <div class="block">
      <div class="block-head">
        <div class="lead">
          <h3>記録</h3>
          <SegmentGroup :items="seriesItems" :value="series" label="記録" @pick="emit('series', $event as SeriesId)" />
        </div>
        <span v-if="chosenSeries.note" class="note">{{ chosenSeries.note }}</span>
      </div>
      <MonthChart :values="subject.months[series]" :months="months" :series="chosenSeries" />
    </div>

    <div class="block">
      <div class="block-head">
        <div class="lead">
          <h3>配信時刻ヒートマップ</h3>
          <SegmentGroup
            :items="STEPS"
            :value="String(step)"
            label="刻み"
            @pick="emit('step', knownId(HEAT_STEPS, Number($event), 60))"
          />
        </div>
      </div>
      <StreamHeatmap :spans="subject.spans" :step="step" :color="subject.color" />
    </div>

    <div class="block">
      <div class="block-head">
        <h3>最近の配信</h3>
      </div>
      <RecentStreams :rows="streams" :show-owner="subject.members !== undefined" :dark="dark" />
    </div>
  </section>
</template>

<style scoped>
.record {
  display: grid;
  align-content: start;
  overflow: hidden;
  border: 1px solid var(--k-line);
  border-top: 3px solid var(--member-color);
  border-radius: 8px;
  background: var(--k-surface);
  box-shadow: var(--k-shadow);
}

/* The panel is topped by the member's own colour; a member who has finished
   gets the same colour, dotted. Nothing here fades them out (#134). */
.record.ended {
  border-top-style: dotted;
}

.back {
  display: none;
  align-items: center;
  gap: 8px;
  padding: 7px 10px 7px 12px;
  border-bottom: 1px solid var(--k-line);
  background: var(--k-surface-2);
}

.back .rail {
  width: 3px;
  height: 20px;
  border-radius: 2px;
  background: var(--member-color);
}

.back .rail.ended {
  border-right: 3px dotted var(--member-color);
  background: none;
}

.back :deep(.avatar) {
  width: 22px;
  height: 22px;
}

.back-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  font-size: 12.5px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.close {
  width: 26px;
  height: 26px;
  border: 0;
  border-radius: 50%;
  background: none;
  color: var(--k-text-3);
  font: inherit;
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
}

.close:hover {
  background: var(--k-surface);
  color: var(--k-text);
}

.head {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
}

.portrait :deep(.avatar) {
  width: 46px;
  height: 46px;
}

.stack {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  max-width: 92px;
}

.stack :deep(.avatar) {
  width: 20px;
  height: 20px;
}

.name {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  line-height: 1.2;
  overflow-wrap: anywhere;
}

.name a {
  color: inherit;
  text-decoration: none;
}

.name a:hover {
  color: var(--member-color);
  text-decoration: underline;
}

.span {
  margin: 0;
  color: var(--k-text-3);
  font-size: 11.5px;
}

.mark {
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.04em;
  white-space: nowrap;
}

.mark[data-kind='live'] {
  background: var(--k-live);
  color: #fff;
}

.mark[data-kind='soon'] {
  box-shadow: inset 0 0 0 1px var(--k-accent);
  background: var(--k-accent-soft);
  color: var(--k-accent);
}

.mark[data-kind='today'] {
  box-shadow: inset 0 0 0 1px var(--k-line-2);
  background: var(--k-surface-2);
  color: var(--k-text-2);
}

.figures {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1px;
  border-top: 1px solid var(--k-line);
  border-bottom: 1px solid var(--k-line);
  background: var(--k-line);
}

.figure {
  display: grid;
  gap: 1px;
  align-content: start;
  width: 100%;
  padding: 8px 10px 9px;
  border: 0;
  border-top: 2px solid transparent;
  background: var(--k-surface);
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.figure:hover {
  background: var(--k-surface-2);
}

.figure[aria-pressed='true'] {
  border-top-color: var(--k-accent);
  background: var(--k-surface-2);
}

.figure .key {
  color: var(--k-text-3);
  font-size: 10.5px;
  letter-spacing: 0.06em;
}

.figure .value {
  font-size: 17px;
  font-weight: 500;
  line-height: 1.25;
}

.figure .change {
  font-size: 11.5px;
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

.block {
  display: grid;
  gap: 8px;
  padding: 12px 14px 14px;
  border-top: 1px solid var(--k-line);
}

.block-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px 12px;
}

.block-head h3 {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.08em;
}

.lead {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.note {
  padding: 1px 5px;
  border: 1px solid var(--k-line);
  border-radius: 999px;
  color: var(--k-text-3);
  font-size: 10px;
  white-space: nowrap;
}

@container (max-width: 1120px) {
  .figures {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@container (max-width: 900px) {
  .figures {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .back {
    display: flex;
    position: sticky;
    top: 0;
    z-index: 3;
  }
}

@container (max-width: 620px) {
  .figures {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@container (max-width: 430px) {
  .portrait :deep(.avatar) {
    width: 38px;
    height: 38px;
  }

  .name {
    font-size: 16px;
  }
}
</style>
