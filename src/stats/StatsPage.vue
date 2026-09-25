<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

import SiteShell from '@/shell/SiteShell.vue';
import UpdatedAt from '@/shell/UpdatedAt.vue';
import { milestonesByChannel } from '@/lib/milestones';
import { formatDate, formatDateTime } from '@/lib/timeFormat';

import {
  announcementsOf,
  freshnessOf,
  HEAT_STEPS,
  METRICS,
  PERIODS,
  SERIES,
  subjectOf,
  totalOf,
  TOTAL_ID,
  type AnnouncementKind,
  type HeatStep,
  type MetricId,
  type PeriodId,
  type SeriesId,
  type Subject,
  type SubjectSource,
} from './model';
import AnnouncementBand from './parts/AnnouncementBand.vue';
import MemberLedger from './parts/MemberLedger.vue';
import MemberRecord from './parts/MemberRecord.vue';
import SegmentGroup from '@/parts/SegmentGroup.vue';
import SubscriberNote from './parts/SubscriberNote.vue';
import TotalsGrid from './parts/TotalsGrid.vue';
import type { StreamRow } from './parts/RecentStreams.vue';
import { useStatsData } from './useStatsData';
import { useStoredChoice } from '@/lib/useStoredChoice';

/**
 * けもV 統計.
 *
 * The list on the left and one member's record on the right. Narrow enough
 * and the record covers the list rather than stacking under it, which is what
 * keeps the list one screen tall on a phone.
 *
 * What the page may not do is fixed by #134 and enforced in ./model.ts: no
 * ranking, no sorting, no scale shared between two members, and no member
 * dimmed for having finished.
 */

const data = useStatsData();
const now = ref(Date.now());
let clock: ReturnType<typeof setInterval> | undefined;

/** What the reader chose last time. Which member is open, and minimal display, are not kept. */
const metric = useStoredChoice<MetricId>(
  'kemov/stats/metric',
  METRICS.map((m) => m.id),
  'subscriberCount',
);
const period = useStoredChoice<PeriodId>(
  'kemov/stats/period',
  PERIODS.map((p) => p.id),
  'perDay',
);
const series = useStoredChoice<SeriesId>(
  'kemov/stats/series',
  SERIES.map((s) => s.id),
  'streams',
);
const step = useStoredChoice<HeatStep>(
  'kemov/stats/heatStep',
  HEAT_STEPS.map((s) => s.id),
  60,
);
const activeOnly = useStoredChoice<boolean>('kemov/stats/activeOnly', [false, true], false);

const selected = ref<string>(TOTAL_ID);
const sheetOpen = ref(false);
const minimal = ref(false);
const dark = ref(false);

const months = computed(() => data.months.value?.months ?? []);

const source = computed<SubjectSource>(() => ({
  channels: data.channels.value,
  months: data.months.value?.channels ?? [],
  total: data.months.value?.total ?? {
    streams: [],
    videos: [],
    shorts: [],
    streamSeconds: [],
    chatMessages: [],
    chatUniqueUsers: [],
    views: [],
  },
  spans: new Map((data.streams.value?.channels ?? []).map((c) => [c.channelId, c.spans])),
  milestones: milestonesByChannel(data.milestones.value),
}));

const everyMember = computed(() => !activeOnly.value);
const members = computed(() =>
  data.channels.value
    .filter((channel) => !activeOnly.value || channel.activityEndDate === null)
    .map((channel) => subjectOf(channel, source.value)),
);
const total = computed(() => totalOf(members.value, source.value, everyMember.value));
const byId = computed(() => new Map(members.value.map((member) => [member.id, member])));
const subject = computed<Subject>(() => byId.value.get(selected.value) ?? total.value);

const announcements = computed(() => announcementsOf(data.live.value, now.value));
const states = computed(
  () => new Map<string, AnnouncementKind>(announcements.value.map((row) => [row.channelId, row.kind])),
);

/** How old the counts are, which is what the three freshness steps are read from. */
const ageSeconds = computed(() =>
  data.countsFetchedAt.value === null ? null : Math.max(0, Math.round((now.value - data.countsFetchedAt.value) / 1000)),
);
const freshness = computed(() => (ageSeconds.value === null ? 'ok' : freshnessOf(ageSeconds.value)));
const alertDismissed = ref(false);
const alertShown = computed(() => freshness.value === 'bad' && !alertDismissed.value && data.failure.value === null);

const updatedState = computed(() => {
  if (data.failure.value !== null && data.countsFetchedAt.value === null) return 'error' as const;

  return data.loading.value ? ('loading' as const) : ('ok' as const);
});

/** How long the numbers have been on screen without a new reading, in words. */
const staleFor = computed(() => {
  const seconds = ageSeconds.value ?? 0;

  return seconds < 3600 ? `${Math.round(seconds / 60)} 分` : `${Math.round(seconds / 3600)} 時間`;
});

const heading = computed(() => {
  const s = subject.value;
  const today = formatDate(now.value);

  if (s.members !== undefined) return `${s.activityStartDate} → ${today} ・ ${s.members.length} 人`;

  return `${s.activityStartDate} → ${s.activityEndDate ?? today}`;
});

/** The record's list: what has not started yet, then the streams that have. */
const streamRows = computed<StreamRow[]>(() => {
  const s = subject.value;
  const owners = s.members ?? [s];
  const coming = announcements.value.flatMap<StreamRow>((row) => {
    const owner = owners.find((member) => member.id === row.channelId);

    if (owner === undefined) return [];

    return [
      {
        key: `coming-${row.videoId}`,
        title: row.title,
        upcoming: { kind: row.kind === 'live' ? 'live' : row.kind, time: row.time },
        videoId: row.videoId,
        startedAt: '',
        durationSeconds: null,
        viewCount: null,
        chatMessageCount: null,
        owner,
      },
    ];
  });

  const recent = (data.streams.value?.channels ?? [])
    .flatMap((channel) => {
      const owner = owners.find((member) => member.id === channel.channelId);

      return owner === undefined ? [] : channel.recent.map((stream) => ({ stream, owner }));
    })
    .sort((a, b) => b.stream.actualStartTime.valueOf() - a.stream.actualStartTime.valueOf())
    // One member's own five, or ten across the sum, which is enough for the
    // list to be worth scrolling without becoming the page.
    .slice(0, s.members === undefined ? 5 : 10)
    .map(({ stream, owner }) => ({
      key: stream.videoId,
      title: stream.title,
      videoId: stream.videoId,
      startedAt: formatDateTime(stream.actualStartTime.valueOf()).slice(0, 16),
      durationSeconds: stream.durationSeconds,
      viewCount: stream.viewCount,
      chatMessageCount: stream.chatMessageCount,
      owner,
    }));

  // What is on air already appears in the list as the stream it is, so only
  // the ones that have not started are added on top.
  return [...coming.filter((row) => row.upcoming?.kind !== 'live'), ...recent];
});

const metricItems = METRICS.map((m) => ({ id: m.id, label: m.label }));
const periodItems = PERIODS.map((p) => ({ id: p.id, label: p.label }));

function select(id: string) {
  selected.value = id;
  sheetOpen.value = true;
}

/**
 * Minimal display closes the navigation as well as the announcements and the
 * record (#134). The navigation belongs to the shell above this page, so the
 * page marks the document and the style block below reaches it from there.
 * The mark is removed as the page closes, so it cannot outlive it.
 *
 * The record is closed with it: under 900px an open record hides the list, and
 * minimal display takes the record away, which would leave nothing on screen.
 */
watch(minimal, (on) => {
  if (on) {
    sheetOpen.value = false;
    document.documentElement.dataset.statsMinimal = '1';
  } else {
    delete document.documentElement.dataset.statsMinimal;
  }
});

function readTheme() {
  dark.value = getComputedStyle(document.documentElement).colorScheme.includes('dark');
}

const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
let themeObserver: MutationObserver | undefined;

onMounted(async () => {
  readTheme();
  systemTheme.addEventListener('change', readTheme);
  themeObserver = new MutationObserver(readTheme);
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  clock = setInterval(() => {
    now.value = Date.now();
  }, 30_000);

  await data.start();
});

onBeforeUnmount(() => {
  data.stop();
  clearInterval(clock);
  themeObserver?.disconnect();
  systemTheme.removeEventListener('change', readTheme);
  delete document.documentElement.dataset.statsMinimal;
});
</script>

<template>
  <SiteShell page="stats" title="けもV 統計">
    <template #title-aside>
      <span class="stamp-wrap" :data-freshness="updatedState === 'ok' ? freshness : undefined">
        <UpdatedAt :at="data.countsFetchedAt.value" :state="updatedState" />
        <div v-if="alertShown" class="alert" role="status">
          <button type="button" class="alert-close" aria-label="閉じる" @click="alertDismissed = true">×</button>
          <b>最新の数値を取得できません</b>
          <span>表示は {{ staleFor }}前の数値です</span>
        </div>
      </span>
      <SubscriberNote :subjects="members" />
      <button
        type="button"
        class="minimal-toggle"
        :aria-pressed="minimal"
        :aria-label="minimal ? '通常表示' : 'ミニマル表示'"
        :title="minimal ? '通常表示' : 'ミニマル表示'"
        @click="minimal = !minimal"
      >
        <svg v-if="!minimal" viewBox="0 0 16 16" aria-hidden="true">
          <g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
            <path d="M2.6 6.6h4v-4" />
            <path d="M2.2 2.2l4.4 4.4" />
            <path d="M13.4 9.4h-4v4" />
            <path d="M13.8 13.8l-4.4-4.4" />
          </g>
        </svg>
        <svg v-else viewBox="0 0 16 16" aria-hidden="true">
          <g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
            <path d="M6.4 2.2h-4.2v4.2" />
            <path d="M2.2 2.2l4.4 4.4" />
            <path d="M9.6 13.8h4.2v-4.2" />
            <path d="M13.8 13.8l-4.4-4.4" />
          </g>
        </svg>
      </button>
    </template>

    <div class="stats" :class="{ minimal, 'sheet-open': sheetOpen }">
      <AnnouncementBand v-if="!minimal" :announcements="announcements" :members="byId" :dark="dark" @select="select" />

      <div class="controls">
        <div class="control">
          <span class="caption">指標</span>
          <SegmentGroup :items="metricItems" :value="metric" label="指標" @pick="metric = $event as MetricId" />
        </div>
        <div class="control">
          <span class="caption">期間</span>
          <SegmentGroup :items="periodItems" :value="period" label="期間" @pick="period = $event as PeriodId" />
        </div>
        <label class="active-only">
          <input v-model="activeOnly" type="checkbox" />
          活動中のメンバーだけ表示
        </label>
      </div>

      <div class="spread">
        <div class="left">
          <div class="left-inner">
            <TotalsGrid :total="total" :period="period" />
            <MemberLedger
              :subjects="members"
              :total="total"
              :metric="metric"
              :period="period"
              :selected="selected"
              :dark="dark"
              :states="states"
              :minimal="minimal"
              :months="months"
              @select="select"
            />
          </div>
        </div>

        <MemberRecord
          v-if="!minimal"
          :subject="subject"
          :metric="metric"
          :period="period"
          :series="series"
          :step="step"
          :months="months"
          :dark="dark"
          :state="states.get(subject.id)"
          :streams="streamRows"
          :heading="heading"
          :milestone-status="data.milestoneStatus.value"
          :today="formatDate(now)"
          @metric="metric = $event"
          @series="series = $event"
          @step="step = $event"
          @close="sheetOpen = false"
        />
      </div>

      <p v-if="data.failure.value && data.countsFetchedAt.value === null" class="failed">
        数値を取得できませんでした。しばらく時間をおいてから再度お試しください
      </p>
    </div>

    <template #notes>
      <li>およそ 10 分ごとに自動で更新されます。数値は減少することがあります</li>
      <li>総再生数と配信・動画数は配信終了後から反映されます</li>
      <li>このサイトは非公式のファンサイトです</li>
    </template>
  </SiteShell>
</template>

<style scoped>
.stats {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 12px;
}

/* Everything here sits in a grid, and a grid item is as wide as its content
   unless it is told otherwise. The announcements are a row that scrolls
   sideways, so without this the page itself grows instead. */
.stats > * {
  min-width: 0;
}

.stamp-wrap {
  display: inline-flex;
  position: relative;
  align-items: center;
}

/* The three freshness steps (#134). The shell's badge knows how old the
   numbers are but not what this page counts as late, so the steps are
   coloured from here. Colour is never the only sign: the relative time is
   there to read, and the third step opens the bubble below. */
.stamp-wrap[data-freshness='warn'] :deep(.updated-at .dot),
.stamp-wrap[data-freshness='warn'] :deep(.updated-at .age) {
  color: var(--k-caution);
}

.stamp-wrap[data-freshness='warn'] :deep(.updated-at .dot) {
  background: var(--k-caution);
}

.stamp-wrap[data-freshness='bad'] :deep(.updated-at .dot),
.stamp-wrap[data-freshness='bad'] :deep(.updated-at .age) {
  color: var(--k-warn);
}

.stamp-wrap[data-freshness='bad'] :deep(.updated-at .dot) {
  background: var(--k-warn);
}

/* Old numbers speak from the badge they belong to rather than from a strip
   of their own: a panel across the page would push the table down every time
   collection is late. */
.alert {
  display: grid;
  position: absolute;
  z-index: 30;
  top: calc(100% + 8px);
  right: 0;
  gap: 2px;
  width: max-content;
  max-width: min(340px, 78cqw);
  padding: 9px 30px 10px 12px;
  border: 1px solid var(--k-warn);
  border-radius: 6px;
  background: var(--k-surface);
  box-shadow: var(--k-shadow);
}

.alert::before {
  content: '';
  position: absolute;
  top: -5px;
  right: 34px;
  width: 8px;
  height: 8px;
  border-top: 1px solid var(--k-warn);
  border-left: 1px solid var(--k-warn);
  background: var(--k-surface);
  transform: rotate(45deg);
}

.alert b {
  color: var(--k-warn);
  font-size: 12.5px;
}

.alert span {
  color: var(--k-text-2);
  font-size: 11.5px;
}

.alert-close {
  position: absolute;
  top: 4px;
  right: 5px;
  width: 20px;
  height: 20px;
  border: 0;
  border-radius: 50%;
  background: none;
  color: var(--k-text-3);
  font: inherit;
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
}

.alert-close:hover {
  background: var(--k-surface-2);
  color: var(--k-text);
}

.minimal-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: 0;
  border-radius: 5px;
  background: none;
  color: var(--k-text-3);
  cursor: pointer;
}

.minimal-toggle:hover,
.minimal-toggle[aria-pressed='true'] {
  background: var(--k-accent-soft);
  color: var(--k-accent);
}

.minimal-toggle svg {
  width: 15px;
  height: 15px;
}

.controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 14px;
}

.control {
  display: inline-flex;
  align-items: center;
  gap: 7px;
}

.caption {
  color: var(--k-text-3);
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.12em;
}

.active-only {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
  color: var(--k-text-2);
  font-size: 12px;
  cursor: pointer;
}

.active-only input {
  width: 14px;
  height: 14px;
  margin: 0;
  accent-color: var(--k-accent);
}

.spread {
  display: grid;
  grid-template-columns: minmax(340px, 0.9fr) minmax(400px, 1fr);
  gap: 14px;
}

.left {
  display: grid;
  gap: 12px;
  align-content: start;
}

/* The table and its notes are stuck to the top together. Left outside, the
   notes would slide under the table that stayed. */
.left-inner {
  display: grid;
  position: sticky;
  top: 56px;
  gap: 12px;
  align-content: start;
  max-height: calc(100vh - 68px);
}

.failed {
  margin: 0;
  padding: 10px 12px;
  border: 1px solid var(--k-warn);
  border-radius: 6px;
  color: var(--k-warn);
  font-size: 12.5px;
}

.minimal .spread {
  grid-template-columns: minmax(0, 1fr);
}

.minimal .left-inner {
  position: static;
  max-height: none;
}

@container (max-width: 1120px) {
  .spread {
    grid-template-columns: minmax(300px, 0.82fr) minmax(360px, 1fr);
    gap: 10px;
  }
}

/* Under 900px the record covers the list instead of sitting beside it. */
@container (max-width: 900px) {
  .spread {
    grid-template-columns: minmax(0, 1fr);
  }

  .left-inner {
    position: static;
    max-height: none;
  }

  .sheet-open .left {
    display: none;
  }

  .stats:not(.sheet-open) :deep(.record) {
    display: none;
  }
}
</style>

<!-- Not scoped: the navigation minimal display closes belongs to the shell,
     which is this page's parent rather than part of it. -->
<style>
html[data-stats-minimal] .site-nav {
  display: none;
}
</style>
