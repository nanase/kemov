<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue';
import { formatCount } from '@/lib/numberFormat';

import SegmentGroup from '@/parts/SegmentGroup.vue';
import SiteShell from '@/shell/SiteShell.vue';
import UpdatedAt from '@/shell/UpdatedAt.vue';
import { zoomOf } from '@/shell/textSize';
import type { VideoType } from '@/type/api';
import type { VideoProperty } from '@/type/video';
import type { RankingPeriod } from '@/lib/ranking';

import {
  filterUniverse,
  funnelSteps,
  lengthBandOf,
  LIST_ORDERS,
  NO_FILTERS,
  nonEmptyAlternatives,
  orderEntries,
  PAGE_SIZE,
  PERIOD_CHIPS,
  scopeName,
  searchTokens,
  shownCountOf,
  universeOf,
  yearsIn,
  type Filters,
  type ListOrder,
} from './model';
import { queryToState, stateToQuery, defaultState } from './query';
import { useStoredChoice } from '@/lib/useStoredChoice';
import { RANKING_PERIODS } from '@/lib/ranking';
import { VIDEO_TYPES } from '@/type/api';
import { VIDEO_PROPERTIES } from '@/type/video';
import { videoPageTitle } from '@/lib/pageTitle';
import { freshnessOf } from '@/stats/model';
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

  if (rest === '') return null;

  // Every path this page writes comes from encodeURIComponent (see the watch
  // below), so a decode failure means someone typed or was handed a broken
  // % escape - answered with no selection rather than a mount that never
  // finishes.
  try {
    return decodeURIComponent(rest);
  } catch {
    return null;
  }
}

const params = new URLSearchParams(window.location.search);

// What the reader ranks by, and over what, is kept for next time; the address
// still wins when it names one. A calendar year is left out: it is one pick
// among several the period chips offer, not a rolling window to come back to.
const storedMetric = useStoredChoice<VideoProperty>('kemov/videos/metric', VIDEO_PROPERTIES, defaultState().metric);
const storedKind = useStoredChoice<VideoType>('kemov/videos/kind', VIDEO_TYPES, defaultState().kind);
const storedPeriod = useStoredChoice<(typeof RANKING_PERIODS)[number]>(
  'kemov/videos/period',
  RANKING_PERIODS,
  defaultState().period as (typeof RANKING_PERIODS)[number],
);
const storedOrder = useStoredChoice<ListOrder>(
  'kemov/videos/order',
  LIST_ORDERS.map((o) => o.id),
  defaultState().order,
);
const fromQuery = queryToState(params, {
  ...defaultState(),
  metric: storedMetric.value,
  kind: storedKind.value,
  period: storedPeriod.value,
  order: storedOrder.value,
});

const metric = ref<VideoProperty>(fromQuery.metric);
const kind = ref<VideoType>(fromQuery.kind);
const period = ref<RankingPeriod>(fromQuery.period);
const order = ref<ListOrder>(fromQuery.order);

watch(metric, (value) => (storedMetric.value = value), { flush: 'sync' });
watch(kind, (value) => (storedKind.value = value), { flush: 'sync' });
watch(order, (value) => (storedOrder.value = value), { flush: 'sync' });
watch(
  period,
  (value) => {
    if (typeof value === 'string') storedPeriod.value = value;
  },
  { flush: 'sync' },
);
const filters = ref<Filters>(fromQuery.filters);
const shown = ref<number>(PAGE_SIZE);
/** Null until a row is pressed - #137's decision that opening `/videos/` selects nothing by default. */
const selectedId = ref<string | null>(videoIdFromPath(window.location.pathname));
/**
 * The video the record shows, and the address names. It is the selection,
 * except while ↑ or ↓ is held down: the list's mark keeps up with the key,
 * and the record and its thumbnail follow once the key is let go (see
 * `selectVideo`).
 */
const recordId = ref<string | null>(selectedId.value);
const lightboxOpen = ref(false);
const sheetOpen = ref(false);
const dark = ref(false);
const now = ref(Date.now());
let clock: ReturnType<typeof setInterval> | undefined;

const data = useVideosData();

const channelsById = computed(() => new Map(data.channels.value.map((c) => [c.channelId, c])));
const years = computed(() => yearsIn(data.rows.value));
const candidatePeriods = computed(() => [...PERIOD_CHIPS, ...years.value.map((y) => y.period)]);

/**
 * `now` as a Date that only changes when the clock does. The record panel
 * ranks the selected video in all eleven metrics against it, so a Date built
 * afresh in the template would redo all eleven rankings on every render of
 * this page - every step of ↑ and ↓ included.
 */
const nowDate = computed(() => new Date(now.value));

const universe = computed(() => universeOf(data.rows.value, metric.value, kind.value, period.value, nowDate.value));
const view = computed(() => filterUniverse(universe.value, filters.value));
const tokens = computed(() => searchTokens(filters.value.query));

const orderedRows = computed(() => orderEntries(view.value.rows, order.value));
const orderItems = LIST_ORDERS.map((o) => ({ id: o.id, label: o.name }));

const shownCount = computed(() => shownCountOf(view.value.rows.length, shown.value));
const shownEntries = computed(() => orderedRows.value.slice(0, shownCount.value));
const remainingCount = computed(() => view.value.rows.length - shownCount.value);

const selectedRow = computed(() => {
  if (selectedId.value === null) return null;

  return data.rows.value.find((row) => row.videoId === selectedId.value) ?? null;
});
const recordRow = computed(() => {
  if (recordId.value === null) return null;

  return data.rows.value.find((row) => row.videoId === recordId.value) ?? null;
});
const recordChannel = computed(() => (recordRow.value ? channelsById.value.get(recordRow.value.channelId) : undefined));
const selectedInView = computed(() => shownEntries.value.some((e) => e.row.videoId === selectedId.value));
const recordFiltered = computed(
  () =>
    recordId.value !== null &&
    universe.value.byId.has(recordId.value) &&
    !view.value.rows.some((e) => e.row.videoId === recordId.value),
);

const pinned = computed(() => {
  if (selectedId.value === null || selectedInView.value || !selectedRow.value) return null;

  return { rank: universe.value.byId.get(selectedId.value)?.rank ?? null, title: selectedRow.value.title };
});

type Phase = 'loading' | 'fail' | 'noUniverse' | 'funnel' | 'normal';

const phase = computed<Phase>(() => {
  // Checked before `loading`: a fetch that keeps failing leaves `loading`
  // true forever (nothing ever "arrives"), and a page stuck on a skeleton
  // hides the one thing worth telling the reader - that it could not be
  // read - behind an animation that looks like progress. `data.loading`
  // rather than either fetchedAt alone, so a channel fetch that succeeded
  // while the table fetch keeps failing is not mistaken for "still loading":
  // one of the two has arrived, but not both, and that is still a failure to
  // show.
  if (data.failure.value !== null && data.loading.value) {
    return 'fail';
  }
  if (data.loading.value) return 'loading';
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
      label: `再生時間「${lengthBandOf(filters.value.lengthBandId).name}」を外す`,
      count: filterUniverse(universe.value, { ...filters.value, lengthBandId: 'any' }).rows.length,
    });
  }
  if (filters.value.channelIds.size > 0) {
    tries.push({
      key: 'channel',
      label: 'メンバーの絞り込みを外す',
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
        nowDate.value,
      )
    : [],
);

const countSentence = computed(() => {
  if (phase.value === 'loading') return '読み込み中';
  if (phase.value === 'fail') return '';

  const scope = scopeName(kind.value, period.value);

  if (phase.value === 'noUniverse') return `${scope} 0 本`;
  if (phase.value === 'funnel') return `${scope} ${formatCount(universe.value.total)} 本`;

  const active =
    filters.value.query !== '' || filters.value.lengthBandId !== 'any' || filters.value.channelIds.size > 0;
  const parts = [`${scope} ${formatCount(universe.value.total)} 本`];

  if (active) parts.push(`→ 絞り込んだ ${formatCount(view.value.rows.length)} 本`);
  parts.push(`のうち ${formatCount(shownCount.value)} 本を表示`);

  return parts.join(' ');
});

const freshness = computed(() => {
  const at = data.channelsFetchedAt.value;

  if (at === null) return 'ok' as const;

  return freshnessOf(Math.max(0, Math.round((now.value - at) / 1000)));
});
const updatedState = computed(() => {
  if (data.failure.value !== null && data.loading.value) return 'error' as const;

  return data.loading.value ? ('loading' as const) : ('ok' as const);
});

function resetPage() {
  shown.value = PAGE_SIZE;
}

/** How long the record waits for a held ↑ or ↓ to be let go, should its keyup never arrive. */
const RECORD_DELAY_MS = 300;
let recordTimer: ReturnType<typeof setTimeout> | undefined;

function showRecord() {
  clearTimeout(recordTimer);
  recordTimer = undefined;
  recordId.value = selectedId.value;
}

/**
 * Selects `videoId` in the list, and shows its record now or, with `later`,
 * once the key that is being held down is let go.
 *
 * A held key steps through the list at the keyboard's repeat rate, and
 * drawing every record it passes - fetching every thumbnail with it - would
 * leave the list behind the key.
 */
function selectVideo(videoId: string, later = false) {
  selectedId.value = videoId;
  if (narrow.value) sheetOpen.value = true;
  if (!later) return showRecord();

  clearTimeout(recordTimer);
  recordTimer = setTimeout(showRecord, RECORD_DELAY_MS);
}

function onArrowKeyUp(event: KeyboardEvent) {
  if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && recordTimer !== undefined) showRecord();
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
function onOrder(next: string) {
  order.value = next as ListOrder;
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

/**
 * Where ↑ and ↓ keep their own meaning: moving through a field's text, a
 * select's options or a menu, and anything laid over the page.
 */
const ARROWS_TAKEN = 'input, textarea, select, [contenteditable="true"], [role="menu"], [role="dialog"]';

/**
 * ↑ and ↓ step the selection through the list in the order it is drawn, so
 * one record after another can be read without going back to the list.
 *
 * ↓ with nothing selected, or with a selection the list does not show,
 * starts from the top. Stepping past the last row shown shows the next page
 * of rows, the same as "もっと見る". At either end the key is left to scroll
 * the page.
 */
function onArrowKey(event: KeyboardEvent) {
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
  if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  if (lightboxOpen.value || phase.value !== 'normal') return;
  if (event.target instanceof Element && event.target.closest(ARROWS_TAKEN) !== null) return;

  const down = event.key === 'ArrowDown';
  const at = shownEntries.value.findIndex((entry) => entry.row.videoId === selectedId.value);
  const next = at < 0 ? (down ? 0 : -1) : at + (down ? 1 : -1);
  const entry = orderedRows.value[next];

  if (entry === undefined) return;

  event.preventDefault();
  if (next >= shownCount.value) onMore();

  // A row that had the focus hands it on, so Enter and Tab carry on from the
  // row now selected rather than the one left behind.
  const fromRow = event.target instanceof HTMLElement && event.target.closest('tbody tr') !== null;

  selectVideo(entry.row.videoId, event.repeat);
  void nextTick(() => {
    const row = root.value?.querySelector<HTMLElement>('.leaf.left tbody tr[aria-current="true"]');

    if (row == null) return;
    if (fromRow) row.focus({ preventScroll: true });
    row.scrollIntoView({ block: 'nearest' });
  });
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
  [metric, kind, period, order, filters, recordId],
  () => {
    const query = stateToQuery({
      metric: metric.value,
      kind: kind.value,
      period: period.value,
      order: order.value,
      filters: filters.value,
    });
    const path = recordId.value === null ? PATH_PREFIX : `${PATH_PREFIX}${encodeURIComponent(recordId.value)}`;
    const search = query.toString();
    const url = search === '' ? path : `${path}?${search}`;

    if (url !== window.location.pathname + window.location.search) {
      window.history.replaceState(window.history.state as unknown, '', url);
    }
  },
  { deep: true },
);

/** The tab's own title, distinct from the page's visible one (#136: no name on screen). */
const tabTitle = computed(() => (recordRow.value === null ? undefined : videoPageTitle(recordRow.value.title)));

onMounted(async () => {
  readTheme();
  systemTheme.addEventListener('change', readTheme);
  themeObserver = new MutationObserver(readTheme);
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  clock = setInterval(() => {
    now.value = Date.now();
  }, 30_000);

  window.addEventListener('keydown', onArrowKey);
  window.addEventListener('keyup', onArrowKeyUp);

  if (root.value && typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver((entries) => measure(entries[0]!.contentRect.width));
    resizeObserver.observe(root.value);
    measure(root.value.getBoundingClientRect().width / zoomOf(root.value));
  }

  await data.start();
});

onBeforeUnmount(() => {
  data.stop();
  clearInterval(clock);
  window.removeEventListener('keydown', onArrowKey);
  window.removeEventListener('keyup', onArrowKeyUp);
  clearTimeout(recordTimer);
  resizeObserver?.disconnect();
  themeObserver?.disconnect();
  systemTheme.removeEventListener('change', readTheme);
});
</script>

<template>
  <SiteShell page="videos" title="けもV 配信・動画" :tab-title="tabTitle">
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
            <SegmentGroup class="order" :items="orderItems" :value="order" label="並び順" @pick="onOrder" />
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
            <span class="count">{{ recordRow ? `${scopeName(kind, period)}のうちの順位` : '' }}</span>
            <button type="button" class="closerec" @click="closeRecord">閉じる</button>
          </div>
          <div class="scroll">
            <VideoRecordPanel
              :video="recordRow"
              :channel="recordChannel"
              :metric
              :kind
              :period
              :rows="data.rows.value"
              :now="nowDate"
              :hidden="recordFiltered"
              :dark
              @metric="onMetric"
              @open-lightbox="lightboxOpen = true"
            />
          </div>
        </div>
      </div>

      <VideoLightbox
        v-if="lightboxOpen && recordRow"
        :video-id="recordRow.videoId"
        :title="recordRow.title"
        @close="lightboxOpen = false"
      />
    </div>

    <template #notes>
      <li>指標を計算できる動画だけ表示しています</li>
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

/* The three freshness steps (see @/stats/model.ts's freshnessOf). The badge itself only
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

  /* The list's head holds the order buttons and the record's does not; both
     are this tall so the two leaves still start their rows level. */
  min-height: 33px;
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
  min-height: 0;
  scrollbar-width: thin;
}

.leafhead .order {
  margin: -3px 0 -3px auto;
}

.leafhead .order :deep(button) {
  padding: 1px 8px;
  font-size: 11.5px;
}

/* The record stays beside whichever row was picked, however far down the
   list that is, and scrolls on its own when it is taller than the window.
   The narrow fold below lays it over the list instead. */
.leaf.right {
  position: sticky;
  top: calc(var(--shell-nav-height) + 10px);
  align-self: start;
  max-height: calc(100vh / var(--k-zoom, 1) - var(--shell-nav-height) - 20px);
}

.leaf.right .scroll {
  padding: 10px 12px 14px;
}

.closerec {
  display: none;
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
    align-self: stretch;
    max-height: none;
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
