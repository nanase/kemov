<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

import SiteShell from '@/shell/SiteShell.vue';
import UpdatedAt from '@/shell/UpdatedAt.vue';
import SegmentGroup from '@/parts/SegmentGroup.vue';
import { formatCount } from '@/lib/numberFormat';
import { memberInk } from '@/lib/memberColor';
import { memberPageTitle } from '@/lib/pageTitle';
import { freshnessOf } from '@/stats/model';
import { rankByMetric, type RankingPeriod } from '@/lib/ranking';
import { formatProperty, readProperty } from '@/type/video';

import { countClassLabel, formatLength } from './draw';
import {
  anchorOf,
  behaviorWindow,
  BEHAVIOR_PERIODS,
  cumulativeOf,
  distributionOf,
  DISTRIBUTION_BINS,
  highlightParts,
  jstDay,
  KINDS,
  matchesSearch,
  memberStreams,
  readQuery,
  searchTerms,
  shapeOf,
  streaksOf,
  windowTotals,
  WINDOW_DAYS,
  writeQuery,
  type BehaviorPeriodId,
  type ListPeriodId,
  type MonthlySeriesId,
  type PageState,
} from './model';
import DistributionPanel, { type EdgeEntry } from './parts/DistributionPanel.vue';
import GaugePanel from './parts/GaugePanel.vue';
import HourHeatmap from './parts/HourHeatmap.vue';
import IdentityPanel from './parts/IdentityPanel.vue';
import MonthPanel from './parts/MonthPanel.vue';
import ShapePanel from './parts/ShapePanel.vue';
import StreakPanel from './parts/StreakPanel.vue';
import VideoList, { type ListRow } from './parts/VideoList.vue';
import { useMembersData } from './useMembersData';
import type { VideoProperty } from '@/type/video';
import type { VideoType } from '@/type/api';

/**
 * けもV メンバー.
 *
 * One member at a time, and never two: #136 settled that nothing on this page
 * may put one member's figures beside another's, which is why the only thing
 * that names anybody else is the picker at the top - with no numbers on it
 * and in the order the API sends, which is `display_order`.
 *
 * The board above answers "how are they doing", the band below "how do they
 * stream". Both read the one response `GET /api/videos/table` returns, so
 * changing a period or a resolution is arithmetic rather than a request.
 */

const data = useMembersData();
const now = ref(Date.now());
const dark = ref(false);
const state = ref<PageState>(readQuery(window.location.search));
const memberId = ref(readMemberId());
let clock: ReturnType<typeof setInterval> | undefined;
let themeObserver: MutationObserver | undefined;
const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');

/** How often the age beside the stamp is written again. */
const TICK_MS = 30_000;

/** The channel id `/members/<id>` names, or null for `/members/` itself. */
function readMemberId(): string | null {
  const [, resource, id] = window.location.pathname.replace(/\/+$/, '').split('/');

  return resource === 'members' && id !== undefined && id !== '' ? id : null;
}

/**
 * The archive never arrived.
 *
 * The board, the list and the lower band are the same rows read three ways,
 * so drawing them without those rows puts "0 本" and "配信なし" on screen -
 * which says the member did nothing, where the truth is that nothing was
 * read. An archive that arrives empty is a different thing and draws
 * normally.
 */
const archiveMissing = computed(() => !data.loading.value && data.missing.value.table);

const channels = computed(() => data.channels.value);
const member = computed(
  () => channels.value.find((channel) => channel.channelId === memberId.value) ?? channels.value[0] ?? null,
);

/**
 * The address of the member being read, kept in step with the page.
 *
 * `/members/` with no id is not a page of its own (#137): it opens on the
 * first member and says so in the URL, so that what is on screen is always
 * something the reader can copy and send.
 */
function writeUrl(replace: boolean) {
  const current = member.value;

  if (current === null) return;

  const url = `/members/${current.channelId}${writeQuery(state.value)}`;

  if (url === `${window.location.pathname}${window.location.search}`) return;

  if (replace) window.history.replaceState(null, '', url);
  else window.history.pushState(null, '', url);
}

watch(state, () => writeUrl(true), { deep: true });
watch(member, (current) => {
  if (current !== null) writeUrl(memberId.value === null);
});

/** The tab's own title, distinct from the page's visible one (#136: no name on screen). */
const tabTitle = computed(() => (member.value === null ? undefined : memberPageTitle(member.value.name)));

function pick(id: string) {
  memberId.value = id;
  // A member of one's own is a place, not a setting: going back should return
  // to the member the reader came from rather than to the last filter.
  writeUrl(false);
}

const rows = computed(() =>
  member.value === null ? [] : data.rows.value.filter((row) => row.channelId === member.value?.channelId),
);
const months = computed(
  () => data.months.value?.channels.find((entry) => entry.channelId === member.value?.channelId) ?? null,
);
const monthLabels = computed(() => data.months.value?.months ?? []);

const totals = computed(() => (member.value === null ? null : cumulativeOf(member.value, rows.value, now.value)));

/**
 * The page takes the colour of whoever is being read.
 *
 * The ring round the picture, the marks in every chart, the chosen button and
 * the heatmap are all this one member's colour rather than the site's green -
 * which is what a page about one person should look like. `memberInk` is the
 * darker band: several of these colours are too pale to carry a mark or a
 * word at the lighter one.
 */
const ink = computed(() => (member.value === null ? undefined : memberInk(member.value.color.key, dark.value)));
const pageColors = computed(() =>
  member.value === null
    ? undefined
    : {
        '--mv-key': ink.value,
        '--seg-on': ink.value,
        '--seg-on-soft': memberInk(member.value.color.key, dark.value, dark.value ? 0.22 : 0.14),
        '--seg-on-ink': 'var(--k-on-accent)',
      },
);

/** The two 90-day windows the gauges read, anchored to this member. */
const windows = computed(() => {
  if (member.value === null) return null;

  const anchor = anchorOf(member.value, now.value);
  const span = WINDOW_DAYS * 24 * 60 * 60 * 1000;

  return {
    anchor,
    current: windowTotals(rows.value, anchor - span, anchor),
    previous: windowTotals(rows.value, anchor - 2 * span, anchor - span),
    label: `${jstDay(anchor - span)} → ${jstDay(anchor - 1)}（前の 90 日 ${jstDay(anchor - 2 * span)} → ${jstDay(anchor - span - 1)}）`,
  };
});

/** Every stream of this member's, and the ones the lower band covers. */
const allStreams = computed(() => memberStreams(rows.value));
const behavior = computed(() => behaviorWindow(allStreams.value, state.value.behaviorPeriod, state.value.year));
const shape = computed(() => shapeOf(behavior.value.streams));
const streaks = computed(() => (shape.value === null ? [] : streaksOf(shape.value.days)));
const step = ref(60);

const behaviorRange = computed(() => {
  const streams = behavior.value.streams;

  if (streams.length === 0) return '配信 0 本';

  return `${jstDay(streams[0]!.startMs)} → ${jstDay(streams[streams.length - 1]!.startMs)} ・ 配信 ${formatCount(streams.length)} 本`;
});

const LIST_PERIOD_RANK: Record<ListPeriodId, RankingPeriod> = { all: 'all', '1y': 'p365', '90d': 'p90' };

/**
 * Where each of this member's videos stands among everybody's.
 *
 * The ranking is built over every member's rows and then narrowed to this
 * one: a rank worked out inside a single member would hand each of the eleven
 * a first place of their own, which is the comparison #136 rules out.
 */
const ranked = computed(() => {
  const period = LIST_PERIOD_RANK[state.value.listPeriod];
  const places = new Map(
    rankByMetric(data.rows.value, state.value.metric, state.value.type, period, new Date(now.value)).map((entry) => [
      entry.videoId,
      entry,
    ]),
  );

  return rows.value
    .flatMap((row) => {
      const place = places.get(row.videoId);
      const value = readProperty(row, state.value.metric);

      if (place === undefined || value === undefined) return [];

      return [{ row, value, rank: place.rank }];
    })
    .sort((a, b) => (state.value.order === 'desc' ? b.value - a.value : a.value - b.value));
});

const terms = computed(() => searchTerms(state.value.q));
const listRows = computed<ListRow[]>(() =>
  ranked.value
    .filter((entry) => matchesSearch(entry.row.title, terms.value))
    .map((entry) => ({
      videoId: entry.row.videoId,
      rank: entry.rank,
      title: highlightParts(entry.row.title, terms.value),
      plainTitle: entry.row.title,
      published: jstDay(new Date(entry.row.publishedAt).getTime()),
      kind: KINDS.find((kind) => kind.id === entry.row.type)?.label ?? '—',
      length: entry.row.durationSeconds === null ? '' : formatLength(entry.row.durationSeconds),
      value: formatProperty(state.value.metric, entry.value),
    })),
);

/** The four distributions, each with the one stream at its end named. */
const distributions = computed(() => {
  const streams = behavior.value.streams;
  const edge = (kind: string, stream: (typeof streams)[number] | undefined, value: string): EdgeEntry[] =>
    stream === undefined
      ? []
      : [
          {
            kind,
            videoId: stream.row.videoId,
            title: stream.row.title,
            published: jstDay(stream.startMs),
            value,
          },
        ];

  const longest = streams.reduce<(typeof streams)[number] | undefined>(
    (best, stream) => (best === undefined || stream.minutes > best.minutes ? stream : best),
    undefined,
  );
  const shortest = streams.reduce<(typeof streams)[number] | undefined>(
    (best, stream) => (best === undefined || stream.minutes < best.minutes ? stream : best),
    undefined,
  );

  const counted = (title: string, read: (stream: (typeof streams)[number]) => number | null, unit: string) => {
    const values = streams.flatMap((stream) => {
      const value = read(stream);

      return value === null ? [] : [value];
    });
    const top = streams.reduce<(typeof streams)[number] | undefined>(
      (best, stream) =>
        read(stream) !== null && (best === undefined || (read(stream) ?? 0) > (read(best) ?? 0)) ? stream : best,
      undefined,
    );
    const distribution = distributionOf(values);

    return {
      title,
      note: distribution === null ? '' : `${formatCount(distribution.step)} ごと`,
      distribution,
      axis:
        distribution === null
          ? []
          : ['0', formatCount(distribution.step * 6), `${formatCount(distribution.step * 12)}〜`],
      classLabel: (index: number) => countClassLabel(index, distribution?.step ?? 1, DISTRIBUTION_BINS),
      entries: edge('いちばん多い配信', top, `${unit} ${formatCount(read(top ?? streams[0]!) ?? 0)}`),
    };
  };

  const lengths = distributionOf(
    streams.map((stream) => stream.minutes),
    30,
  );

  return [
    {
      title: '配信時間の分布',
      note: '30 分ごと',
      distribution: lengths,
      axis: ['0', '3 時間', '6 時間〜'],
      classLabel: (index: number) =>
        index === DISTRIBUTION_BINS - 1
          ? '6 時間以上'
          : `${formatLength(index * 1800)}–${formatLength((index + 1) * 1800)}`,
      entries: [
        ...edge('いちばん長い配信', longest, `配信時間 ${formatLength((longest?.minutes ?? 0) * 60)}`),
        // One stream in the window is both the longest and the shortest, and
        // saying so twice would read as two streams.
        ...(shortest !== undefined && shortest !== longest
          ? edge('いちばん短い配信', shortest, `配信時間 ${formatLength(shortest.minutes * 60)}`)
          : []),
      ],
    },
    counted('再生数の分布', (stream) => stream.row.viewCount, '再生数'),
    counted('チャット数の分布', (stream) => stream.row.chatMessageCount, 'チャット数'),
    counted('チャットユーザ数の分布', (stream) => stream.row.chatUniqueUserCount, 'チャットユーザ数'),
  ];
});

const ageSeconds = computed(() =>
  data.countsFetchedAt.value === null ? null : Math.max(0, Math.round((now.value - data.countsFetchedAt.value) / 1000)),
);
const freshness = computed(() => (ageSeconds.value === null ? 'ok' : freshnessOf(ageSeconds.value)));
const updatedState = computed(() => {
  if (data.failure.value !== null && data.countsFetchedAt.value === null) return 'error' as const;

  return data.loading.value ? ('loading' as const) : ('ok' as const);
});

const behaviorItems = BEHAVIOR_PERIODS.filter((period) => period.id !== 'year').map((period) => ({
  id: period.id,
  label: period.label,
}));

function pickBehavior(id: string) {
  state.value = { ...state.value, behaviorPeriod: id as BehaviorPeriodId };
}

function pickYear(value: string) {
  state.value =
    value === ''
      ? { ...state.value, behaviorPeriod: 'all' }
      : { ...state.value, behaviorPeriod: 'year', year: Number(value) };
}

function readTheme() {
  dark.value = getComputedStyle(document.documentElement).colorScheme.includes('dark');
}

onMounted(async () => {
  readTheme();
  systemTheme.addEventListener('change', readTheme);
  themeObserver = new MutationObserver(readTheme);
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  window.addEventListener('popstate', onPopState);
  clock = setInterval(() => {
    now.value = Date.now();
  }, TICK_MS);

  await data.start();
});

function onPopState() {
  memberId.value = readMemberId();
  state.value = readQuery(window.location.search);
}

onBeforeUnmount(() => {
  data.stop();
  clearInterval(clock);
  themeObserver?.disconnect();
  systemTheme.removeEventListener('change', readTheme);
  window.removeEventListener('popstate', onPopState);
});
</script>

<template>
  <SiteShell page="members" title="けもV メンバー" :tab-title="tabTitle">
    <template #title-aside>
      <span v-if="member" class="picker">
        <span class="dot" :style="{ background: ink }" aria-hidden="true"></span>
        <!-- Names only: a figure beside each would be eleven members compared
             in one control, which is what #136 rules out. -->
        <select
          :value="member.channelId"
          aria-label="メンバー"
          @change="pick(($event.target as HTMLSelectElement).value)"
        >
          <option v-for="channel in channels" :key="channel.channelId" :value="channel.channelId">
            {{ channel.name }}
          </option>
        </select>
      </span>
      <span class="stamp" :data-freshness="updatedState === 'ok' ? freshness : undefined">
        <UpdatedAt :at="data.countsFetchedAt.value" :state="updatedState" />
      </span>
    </template>

    <div class="mv-page" :style="pageColors">
      <p v-if="data.loading.value || member === null || archiveMissing" class="mv-panel failed">
        <template v-if="data.loading.value">読み込んでいます</template>
        <template v-else-if="member === null">
          メンバーの情報を取得できませんでした<br />しばらく時間をおいてから再度お試しください
        </template>
        <template v-else>
          配信・動画の記録を取得できませんでした<br />しばらく時間をおいてから再度お試しください
        </template>
      </p>

      <template v-else>
        <div class="board">
          <div class="left">
            <IdentityPanel v-if="totals" :channel="member" :totals :dark />
            <GaugePanel
              v-if="windows"
              :current="windows.current"
              :previous="windows.previous"
              :months
              :missing="data.missing.value.months"
              :window="windows.label"
            />
            <MonthPanel
              :months="monthLabels"
              :row="months"
              :missing="data.missing.value.months"
              :series="state.monthly"
              @series="state = { ...state, monthly: $event as MonthlySeriesId }"
            />
          </div>
          <VideoList
            :rows="listRows"
            :kind="state.type"
            :period="state.listPeriod"
            :metric="state.metric"
            :order="state.order"
            :query="state.q"
            :total="ranked.length"
            :shown="listRows.length"
            @kind="state = { ...state, type: $event as VideoType }"
            @period="state = { ...state, listPeriod: $event as ListPeriodId }"
            @metric="state = { ...state, metric: $event as VideoProperty }"
            @order="state = { ...state, order: $event }"
            @query="state = { ...state, q: $event }"
          />
        </div>

        <div class="band">
          <h3>ふるまい</h3>
          <SegmentGroup
            :items="behaviorItems"
            :value="state.behaviorPeriod"
            label="ふるまいの期間"
            @pick="pickBehavior"
          />
          <select
            class="year"
            :value="state.behaviorPeriod === 'year' && state.year !== null ? String(state.year) : ''"
            :data-on="state.behaviorPeriod === 'year' ? '1' : undefined"
            aria-label="年"
            @change="pickYear(($event.target as HTMLSelectElement).value)"
          >
            <option value="">年を選ぶ</option>
            <option v-for="year in behavior.years" :key="year" :value="String(year)">{{ year }} 年</option>
          </select>
          <span class="mv-grow"></span>
          <!-- Which days the panels below resolved to, always on show: a
               window anchored to the member is not the one the reader may
               have in mind (#136). -->
          <span class="range mv-n">{{ behaviorRange }}</span>
        </div>

        <p v-if="shape === null" class="mv-panel mv-empty">この期間の配信がありません</p>
        <div v-else class="lower">
          <HourHeatmap class="wide" :streams="behavior.streams" :step @step="step = $event" />
          <ShapePanel class="span3" :shape :name="member.name" />
          <StreakPanel :streaks />
          <DistributionPanel
            v-for="distribution in distributions"
            :key="distribution.title"
            :title="distribution.title"
            :note="distribution.note"
            :distribution="distribution.distribution"
            :axis="distribution.axis"
            :entries="distribution.entries"
            :class-label="distribution.classLabel"
          />
        </div>
      </template>
    </div>

    <template #notes>
      <li>数値の反映に数日かかることがあります</li>
      <li>このサイトは非公式のファンサイトです</li>
    </template>
  </SiteShell>
</template>

<style scoped>
.picker {
  display: inline-flex;
  gap: 7px;
  align-items: center;
  min-width: 0;
}

/* The member's own colour, telling them apart and saying nothing else (#136). */
.picker .dot {
  flex: none;
  width: 9px;
  height: 9px;
  border-radius: 50%;
}

.picker select {
  max-width: 100%;
  padding: 3px 6px 4px;
  border: 1px solid var(--k-line-2);
  border-radius: 5px;
  background: var(--k-surface);
  color: var(--k-text);
  font: inherit;
  font-size: 12.5px;
  font-weight: 600;
}

/* The board is one screen tall at 1280px: everything that answers "how are
   they doing" without scrolling, and only the list scrolls inside it. */
.board {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 456px;
  gap: 10px;
  height: 724px;
}

.board > * {
  min-width: 0;
  min-height: 0;
}

.left {
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  gap: 8px;
  min-width: 0;
  min-height: 0;
}

.left > * {
  min-width: 0;
  min-height: 0;
}

.band {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 12px;
  align-items: center;
  margin-top: 8px;
  padding-top: 12px;
  border-top: 1px solid var(--k-line);
}

.band h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  line-height: 1.3;
}

.range {
  color: var(--k-text-3);
  font-size: 11px;
  white-space: nowrap;
}

.year {
  padding: 2px 6px 3px;
  border: 1px solid var(--k-line-2);
  border-radius: 999px;
  background: var(--k-surface);
  color: var(--k-text-2);
  font: inherit;
  font-size: 11px;
  line-height: 1.4;
  cursor: pointer;
}

.year[data-on='1'] {
  border-color: var(--mv-key);
  background: var(--mv-key);
  color: var(--k-on-accent);
  font-weight: 600;
}

.lower {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  align-items: stretch;
}

.lower > * {
  min-width: 0;
}

.wide {
  grid-column: 1 / -1;
}

.span3 {
  grid-column: span 3;
}

.failed {
  margin: 0;
  padding: 40px 14px;
  color: var(--k-text-3);
  font-size: 12.5px;
  text-align: center;
}

.stamp {
  display: inline-flex;
  align-items: center;
}

/* The same three freshness steps the statistics page reads (#134): the
   shell's badge knows how old the numbers are, not what counts as late. The
   colour is never the only sign - the relative time is there to read. */
.stamp[data-freshness='warn'] :deep(.updated-at .dot),
.stamp[data-freshness='warn'] :deep(.updated-at .age) {
  color: var(--k-caution);
}

.stamp[data-freshness='warn'] :deep(.updated-at .dot) {
  background: var(--k-caution);
}

.stamp[data-freshness='bad'] :deep(.updated-at .dot),
.stamp[data-freshness='bad'] :deep(.updated-at .age) {
  color: var(--k-warn);
}

.stamp[data-freshness='bad'] :deep(.updated-at .dot) {
  background: var(--k-warn);
}

@container (max-width: 1120px) {
  .board {
    grid-template-columns: minmax(0, 1fr);
    height: auto;
  }

  .left {
    grid-template-rows: auto auto auto;
  }

  .lower {
    grid-template-columns: minmax(0, 1fr);
  }

  .wide,
  .span3 {
    grid-column: auto;
  }
}
</style>
