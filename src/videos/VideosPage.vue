<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue';
import { withCommas } from '@nanase/alnilam/number';

import SiteShell from '@/shell/SiteShell.vue';
import UpdatedAt from '@/shell/UpdatedAt.vue';
import type { VideoType } from '@/type/api';
import type { VideoProperty } from '@/type/video';
import type { RankingPeriod } from '@/lib/ranking';

import {
  filterUniverse,
  funnelSteps,
  lengthBandOf,
  NO_FILTERS,
  nonEmptyAlternatives,
  PAGE_SIZE,
  PERIOD_CHIPS,
  scopeName,
  searchTokens,
  shownCountOf,
  universeOf,
  yearsIn,
  type Filters,
} from './model';
import { queryToState, stateToQuery } from './query';
import { freshnessOf } from './freshness';
import { useVideosData } from './useVideosData';
import EmptyRanking, { type Suggestion } from './parts/EmptyRanking.vue';
import FilterPanel from './parts/FilterPanel.vue';
import VideoLightbox from './parts/VideoLightbox.vue';
import VideoList from './parts/VideoList.vue';
import VideoRecordPanel from './parts/VideoRecordPanel.vue';

/**
 * けもV 配信・動画 (#135).
 *
 * The condition panel at the top, a list on the left and one video's record
 * on the right - narrow enough and the record covers the list rather than
 * stacking under it. Species and period alone decide the ranking; title,
 * length and channel only ever hide a row out of it (#135's central rule,
 * enforced in ./model.ts rather than here).
 */

const PATH_PREFIX = '/videos/';

function videoIdFromPath(pathname: string): string | null {
  if (!pathname.startsWith(PATH_PREFIX)) return null;
  const rest = pathname.slice(PATH_PREFIX.length).replace(/\/+$/, '');

  return rest === '' ? null : decodeURIComponent(rest);
}

const params = new URLSearchParams(window.location.search);
const fromQuery = queryToState(params);

const metric = ref<VideoProperty>(fromQuery.metric);
const kind = ref<VideoType>(fromQuery.kind);
const period = ref<RankingPeriod>(fromQuery.period);
const filters = ref<Filters>(fromQuery.filters);
const shown = ref<number>(PAGE_SIZE);
/** Null until a row is pressed - #137's decision that opening `/videos/` selects nothing by default. */
const selectedId = ref<string | null>(videoIdFromPath(window.location.pathname));
const lightboxOpen = ref(false);
const sheetOpen = ref(false);
const dark = ref(false);
const now = ref(Date.now());
let clock: ReturnType<typeof setInterval> | undefined;

const data = useVideosData();

const channelsById = computed(() => new Map(data.channels.value.map((c) => [c.channelId, c])));
const years = computed(() => yearsIn(data.rows.value));
const candidatePeriods = computed(() => [...PERIOD_CHIPS, ...years.value.map((y) => y.period)]);

const universe = computed(() =>
  universeOf(data.rows.value, metric.value, kind.value, period.value, new Date(now.value)),
);
const view = computed(() => filterUniverse(universe.value, filters.value));
const tokens = computed(() => searchTokens(filters.value.query));

const shownCount = computed(() => shownCountOf(view.value.rows.length, shown.value));
const shownEntries = computed(() => view.value.rows.slice(0, shownCount.value));
const remainingCount = computed(() => view.value.rows.length - shownCount.value);

const selectedRow = computed(() => {
  if (selectedId.value === null) return null;

  return data.rows.value.find((row) => row.videoId === selectedId.value) ?? null;
});
const selectedChannel = computed(() =>
  selectedRow.value ? channelsById.value.get(selectedRow.value.channelId) : undefined,
);
const selectedInView = computed(() => shownEntries.value.some((e) => e.row.videoId === selectedId.value));
const selectedFiltered = computed(
  () =>
    selectedId.value !== null &&
    universe.value.byId.has(selectedId.value) &&
    !view.value.rows.some((e) => e.row.videoId === selectedId.value),
);

const pinned = computed(() => {
  if (selectedId.value === null || selectedInView.value || !selectedRow.value) return null;

  return { rank: universe.value.byId.get(selectedId.value)?.rank ?? null, title: selectedRow.value.title };
});

type Phase = 'loading' | 'fail' | 'noUniverse' | 'funnel' | 'normal';

const phase = computed<Phase>(() => {
  if (data.loading.value) return 'loading';
  if (data.failure.value !== null && data.channelsFetchedAt.value === null && data.tableFetchedAt.value === null) {
    return 'fail';
  }
  if (universe.value.total === 0) return 'noUniverse';
  if (view.value.rows.length === 0) return 'funnel';

  return 'normal';
});

const funnelStepsComputed = computed(() =>
  phase.value === 'funnel'
    ? funnelSteps(data.rows.value, metric.value, kind.value, period.value, filters.value, universe.value, view.value)
    : [],
);

const suggestions = computed<Suggestion[]>(() => {
  if (phase.value !== 'funnel') return [];

  const tries: Suggestion[] = [];

  if (filters.value.query !== '') {
    tries.push({
      key: 'query',
      label: `タイトル「${filters.value.query}」を外す`,
      count: filterUniverse(universe.value, { ...filters.value, query: '' }).rows.length,
    });
  }
  if (filters.value.lengthBandId !== 'any') {
    tries.push({
      key: 'length',
      label: `長さ「${lengthBandOf(filters.value.lengthBandId).name}」を外す`,
      count: filterUniverse(universe.value, { ...filters.value, lengthBandId: 'any' }).rows.length,
    });
  }
  if (filters.value.channelIds.size > 0) {
    tries.push({
      key: 'channel',
      label: '配信者の絞り込みを外す',
      count: filterUniverse(universe.value, { ...filters.value, channelIds: new Set() }).rows.length,
    });
  }

  const best = tries
    .filter((t) => t.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  best.push({ key: 'resetAll', label: '条件をすべて消す', count: universe.value.total });

  return best;
});

const alternatives = computed(() =>
  phase.value === 'noUniverse'
    ? nonEmptyAlternatives(
        data.rows.value,
        metric.value,
        kind.value,
        period.value,
        candidatePeriods.value,
        new Date(now.value),
      )
    : [],
);

const countSentence = computed(() => {
  const scope = scopeName(kind.value, period.value);

  if (phase.value === 'noUniverse') return `${scope} 0 本`;
  if (phase.value === 'funnel' || phase.value !== 'normal') return `${scope} ${withCommas(universe.value.total)} 本`;

  const active =
    filters.value.query !== '' || filters.value.lengthBandId !== 'any' || filters.value.channelIds.size > 0;
  const parts = [`${scope} ${withCommas(universe.value.total)} 本`];

  if (active) parts.push(`→ 絞り込んだ ${withCommas(view.value.rows.length)} 本`);
  parts.push(`のうち ${withCommas(shownCount.value)} 本を表示`);

  return parts.join(' ');
});

const freshness = computed(() => {
  const at = data.channelsFetchedAt.value;

  if (at === null) return 'ok' as const;

  return freshnessOf(Math.max(0, Math.round((now.value - at) / 1000)));
});
const updatedState = computed(() => {
  if (data.failure.value !== null && data.channelsFetchedAt.value === null) return 'error' as const;

  return data.loading.value ? ('loading' as const) : ('ok' as const);
});

function resetPage() {
  shown.value = PAGE_SIZE;
}

function selectVideo(videoId: string) {
  selectedId.value = videoId;
  if (narrow.value) sheetOpen.value = true;
}

function onMetric(next: VideoProperty) {
  metric.value = next;
  resetPage();
}
function onKind(next: string) {
  kind.value = next as VideoType;
  resetPage();
}
function onPeriod(next: RankingPeriod) {
  period.value = next;
  resetPage();
}
function onQuery(next: string) {
  filters.value = { ...filters.value, query: next };
  resetPage();
}
function onLengthBand(next: string) {
  filters.value = { ...filters.value, lengthBandId: next };
  resetPage();
}
function onToggleChannel(channelId: string) {
  const next = new Set(filters.value.channelIds);

  if (next.has(channelId)) next.delete(channelId);
  else next.add(channelId);
  filters.value = { ...filters.value, channelIds: next };
  resetPage();
}
function onResetFilters() {
  filters.value = NO_FILTERS;
  resetPage();
}
function onDropSuggestion(key: Suggestion['key']) {
  if (key === 'query') filters.value = { ...filters.value, query: '' };
  else if (key === 'length') filters.value = { ...filters.value, lengthBandId: 'any' };
  else if (key === 'channel') filters.value = { ...filters.value, channelIds: new Set() };
  else filters.value = NO_FILTERS;
  resetPage();
}
function onPickAlternative(pick: { kind: VideoType; period: RankingPeriod }) {
  kind.value = pick.kind;
  period.value = pick.period;
  resetPage();
}
function onMore() {
  shown.value += PAGE_SIZE;
}
function closeRecord() {
  sheetOpen.value = false;
}

/** #135's own width steps: 860px folds the record behind the list, 1000px switches to a taller list. */
const root = useTemplateRef<HTMLElement>('root');
const narrow = ref(false);
const wide = ref(true);

function measure(width: number) {
  narrow.value = width <= 860;
  wide.value = width > 1000;
  if (!narrow.value) sheetOpen.value = false;
}

let resizeObserver: ResizeObserver | undefined;

function readTheme() {
  dark.value = getComputedStyle(document.documentElement).colorScheme.includes('dark');
}

const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
let themeObserver: MutationObserver | undefined;

/**
 * The URL always reflects the current state, in place: `replaceState` rather
 * than `pushState`, so every chip press does not add its own stop to the
 * back button's history. The path names the selected video, the query names
 * everything else (../query.ts), and both are written together so neither
 * ever lags the other by a frame.
 */
watch(
  [metric, kind, period, filters, selectedId],
  () => {
    const query = stateToQuery({
      metric: metric.value,
      kind: kind.value,
      period: period.value,
      filters: filters.value,
    });
    const path = selectedId.value === null ? PATH_PREFIX : `${PATH_PREFIX}${encodeURIComponent(selectedId.value)}`;
    const search = query.toString();
    const url = search === '' ? path : `${path}?${search}`;

    if (url !== window.location.pathname + window.location.search) {
      window.history.replaceState(window.history.state as unknown, '', url);
    }
  },
  { deep: true },
);

onMounted(async () => {
  readTheme();
  systemTheme.addEventListener('change', readTheme);
  themeObserver = new MutationObserver(readTheme);
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  clock = setInterval(() => {
    now.value = Date.now();
  }, 30_000);

  if (root.value && typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver((entries) => measure(entries[0]!.contentRect.width));
    resizeObserver.observe(root.value);
    measure(root.value.getBoundingClientRect().width);
  }

  await data.start();
});

onBeforeUnmount(() => {
  data.stop();
  clearInterval(clock);
  resizeObserver?.disconnect();
  themeObserver?.disconnect();
  systemTheme.removeEventListener('change', readTheme);
});
</script>

<template>
  <SiteShell page="videos" title="けもV 配信・動画">
    <template #title-aside>
      <span class="stamp-wrap" :data-freshness="updatedState === 'ok' ? freshness : undefined">
        <UpdatedAt :at="data.channelsFetchedAt.value" :state="updatedState" />
      </span>
    </template>

    <div ref="root" class="videos">
      <FilterPanel
        :metric
        :kind
        :period
        :filters
        :channels="data.channels.value"
        :years
        :dark
        @metric="onMetric"
        @kind="onKind"
        @period="onPeriod"
        @query="onQuery"
        @length-band="onLengthBand"
        @toggle-channel="onToggleChannel"
        @reset-filters="onResetFilters"
      />

      <div class="spread" :data-open="sheetOpen ? '1' : '0'">
        <div class="leaf left">
          <div class="leafhead">
            <span class="count">{{ countSentence }}</span>
          </div>
          <div class="scroll">
            <EmptyRanking
              v-if="phase !== 'normal'"
              :state="phase"
              :alternatives
              :steps="funnelStepsComputed"
              :suggestions
              @pick-alternative="onPickAlternative"
              @drop="onDropSuggestion"
            />
            <VideoList
              v-else
              :entries="shownEntries"
              :remaining-count="remainingCount"
              :metric
              :top="universe.top"
              :channels-by-id="channelsById"
              :selected-id="selectedId"
              :tokens
              :wide
              :pinned
              :dark
              @select="selectVideo"
              @more="onMore"
            />
          </div>
        </div>

        <div class="leaf right" aria-label="選んだ 1 本の記録">
          <div class="leafhead">
            <span class="tag">記録</span>
            <span class="count">{{ selectedRow ? `${scopeName(kind, period)}のうちの順位` : '' }}</span>
            <button type="button" class="closerec" @click="closeRecord">閉じる</button>
          </div>
          <div class="scroll">
            <VideoRecordPanel
              :video="selectedRow"
              :channel="selectedChannel"
              :metric
              :kind
              :period
              :rows="data.rows.value"
              :now="new Date(now)"
              :hidden="selectedFiltered"
              :dark
              @metric="onMetric"
              @open-lightbox="lightboxOpen = true"
            />
          </div>
        </div>
      </div>

      <VideoLightbox
        v-if="lightboxOpen && selectedRow"
        :video-id="selectedRow.videoId"
        :title="selectedRow.title"
        @close="lightboxOpen = false"
      />

      <p v-if="data.failure.value && data.channelsFetchedAt.value === null" class="failed">
        配信・動画情報を取得できませんでした。しばらく時間をおいてから再度お試しください
      </p>
    </div>

    <template #notes>
      <li>指標を計算できる動画のみ表示しています</li>
      <li>このサイトは非公式のファンサイトです</li>
    </template>
  </SiteShell>
</template>

<style scoped>
.videos {
  display: grid;
  gap: 10px;
}

.stamp-wrap {
  display: inline-flex;
  align-items: center;
}

/* The three freshness steps (see ./freshness.ts). The badge itself only
   knows how old the numbers are, not what this page counts as late, so the
   steps are coloured from here - the same rule /stats/ follows for its own
   badge. */
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

.spread {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 380px;
  gap: 10px;
  position: relative;
}

.leaf {
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: var(--k-surface);
  border: 1px solid var(--k-line);
  border-radius: 8px;
  box-shadow: var(--k-shadow);
  overflow: hidden;
}

.leafhead {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 6px 12px;
  border-bottom: 1px solid var(--k-line);
  background: var(--k-surface-2);
}

.leafhead .tag {
  color: var(--k-text-3);
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.06em;
}

.leafhead .count {
  font-size: 11.5px;
  color: var(--k-text-3);
  font-variant-numeric: tabular-nums;
}

.leaf .scroll {
  overflow: hidden auto;
  flex: 1 1 auto;
  scrollbar-width: thin;
}

.leaf.right .scroll {
  padding: 10px 12px 14px;
}

.closerec {
  display: none;
}

.failed {
  margin: 0;
  padding: 10px 12px;
  border: 1px solid var(--k-warn);
  border-radius: 6px;
  color: var(--k-warn);
  font-size: 12.5px;
}

/* Below 1000px the list drops its 配信者/公開 columns (js-driven, see
   `measure()`); the spread itself keeps two columns until 860px. */
@container (max-width: 1000px) {
  .spread {
    grid-template-columns: minmax(0, 1fr) 330px;
  }
}

/* Below 860px the record covers the list instead of sitting beside it - the
   same fold `/stats/` uses for its own two-leaf layout. */
@container (max-width: 860px) {
  .spread {
    grid-template-columns: minmax(0, 1fr);
    height: 560px;
  }

  .leaf.left,
  .leaf.right {
    height: 100%;
  }

  .leaf.right {
    position: absolute;
    inset: 0;
    z-index: 6;
    transform: translateX(100%);
    visibility: hidden;
    transition:
      transform 0.22s ease,
      visibility 0.22s ease;
  }

  .spread[data-open='1'] .leaf.right {
    transform: translateX(0);
    visibility: visible;
  }

  .closerec {
    display: inline-block;
    margin-left: auto;
    font: inherit;
    font-size: 11.5px;
    padding: 3px 9px;
    border: 1px solid var(--k-line-2);
    border-radius: 5px;
    background: var(--k-surface);
    color: var(--k-text-2);
    cursor: pointer;
  }
}

@media (prefers-reduced-motion: reduce) {
  .leaf.right {
    transition: none;
  }
}
</style>
