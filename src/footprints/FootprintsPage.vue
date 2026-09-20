<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';

import SiteShell from '@/shell/SiteShell.vue';
import UpdatedAt from '@/shell/UpdatedAt.vue';
import MemberAvatar from '@/parts/MemberAvatar.vue';

import {
  buildTimeline,
  daysBetween,
  eventItems,
  thisWeekInPast,
  upcoming,
  KIND_LABELS,
  SOON_DAYS,
  SOON_SHOW,
  STREAM_MODES,
  type Filters,
  type StreamModeId,
} from './model';
import AsideList from './parts/AsideList.vue';
import PanelDialog from './parts/PanelDialog.vue';
import RecordDialog from './parts/RecordDialog.vue';
import TimelineView from './parts/TimelineView.vue';
import TrailDialog from './parts/TrailDialog.vue';
import TrailMap from './parts/TrailMap.vue';
import { useFootprintsData } from './useFootprintsData';
import type { EventKind } from '@/type/api';

/**
 * けもV あしあと.
 *
 * The site's top page, and one road: what happened and what was streamed, in
 * one column in date order, with today marked in it. #140 settled what the
 * page may not do - no member compared with another, nobody faded for having
 * finished, and a colour that tells people apart and nothing else.
 */

const data = useFootprintsData();
const now = ref(Date.now());
const dark = ref(false);
const openBundles = ref(new Set<string>());
const filters = ref<Filters>({ members: new Set(), kind: 'all', streams: 'all', order: 'asc' });
let clock: ReturnType<typeof setInterval> | undefined;
let themeObserver: MutationObserver | undefined;
const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');

/** How often the clock in the badge and the "now" row are written again. */
const TICK_MS = 30_000;

const rowsById = computed(() => new Map(data.rows.value.map((row) => [row.videoId, row])));
const items = computed(() => eventItems(data.events.value, rowsById.value, now.value));
const timeline = computed(() => buildTimeline(items.value, data.rows.value, filters.value, now.value));

/** The kinds that are actually in the record, which is what the picker lists. */
const kinds = computed(() => {
  const present = new Set(data.events.value.map((event) => event.kind));

  return (Object.keys(KIND_LABELS) as EventKind[]).filter((kind) => present.has(kind));
});

const years = computed(() => {
  const list = timeline.value.years.map((year) => year.year);

  return filters.value.order === 'asc' ? list : [...list].reverse();
});

/**
 * `data.failure` alone is what a stream-only or events-only failure looks
 * like too, not just a total one: `fetchedAt` comes from the channel counts,
 * a third, independent fetch that can succeed while the archive (events and
 * streams together) is failing. Gating this on `fetchedAt` as well used to
 * hide that failure completely whenever the counts happened to be fine - the
 * badge kept reading "ok" while events or streams silently stopped updating.
 */
const updatedState = computed(() => {
  if (data.failure.value !== null) return 'error' as const;

  return data.loading.value ? ('loading' as const) : ('ok' as const);
});

/**
 * Only when neither half of the archive has anything to show. One half
 * failing while the other is fine still draws a timeline from what did
 * arrive - the same leniency the events-not-published-yet case already gets
 * (#140) - and `updatedState` above is what tells a reader something is
 * wrong.
 */
const failed = computed(
  () => data.failure.value !== null && data.rows.value.length === 0 && data.events.value.length === 0,
);

function toggleMember(channelId: string | null) {
  const members = new Set(filters.value.members);

  if (channelId === null) members.clear();
  else if (members.has(channelId)) members.delete(channelId);
  else members.add(channelId);

  // Everybody chosen is the same as nobody chosen, and reads better.
  if (members.size === data.channels.value.length) members.clear();

  filters.value = { ...filters.value, members };
}

function toggleBundle(key: string) {
  const open = new Set(openBundles.value);

  if (open.has(key)) open.delete(key);
  else open.add(key);

  openBundles.value = open;
}

function jumpToYear(year: string) {
  if (year === '') return;

  document.querySelector(`[data-year="${year}"]`)?.scrollIntoView({ block: 'start' });
}

/**
 * The two lists beside the road: what is coming, and the same week before.
 *
 * Both are worked out from the same records the timeline reads, so a member
 * chosen above narrows them too - a reader who has picked one person is not
 * shown somebody else's anniversary in the corner.
 */
const soonAll = ref(false);
const soonList = computed(() => upcoming(items.value, data.rows.value, data.channels.value, filters.value, now.value));
const soonShown = computed(() => {
  const near = soonList.value.filter((entry) => daysBetween(now.value, entry.at) <= SOON_DAYS);

  // Three is the fewest worth a panel. A quiet month reaches further ahead
  // rather than leaving a heading with nothing under it.
  if (soonAll.value) return soonList.value;

  return (near.length >= 3 ? near : soonList.value.slice(0, 3)).slice(0, SOON_SHOW);
});
const agoList = computed(() => thisWeekInPast(items.value, data.rows.value, filters.value, now.value));

/**
 * The road's own rows.
 *
 * Qualified by the key, because a run of streams that has been opened holds
 * buttons of the same class: without this, "the last row" can be one stream
 * inside a run rather than the end of the road.
 */
const TIMELINE_ROWS = '.timeline .row[data-key]';

/** The first row of the road, which is whichever end the order puts it at. */
function jumpToStart() {
  const rows = document.querySelectorAll(TIMELINE_ROWS);
  const first = filters.value.order === 'asc' ? document.querySelector('.timeline .year') : rows[rows.length - 1];

  first?.scrollIntoView({ block: 'start' });
}

function jumpToNow() {
  document.querySelector('.timeline .row.now')?.scrollIntoView({ block: 'center' });
}

/** How long the month a reader is sent to stays lit. */
const FLASH_MS = 1600;

const mapOpen = ref(false);
const flashed = ref<string | null>(null);

/**
 * Pressing a month on the trajectory sends the timeline to that month.
 *
 * The month it arrives at is lit for a moment, and the dialog folds away
 * before the page moves rather than vanishing: being moved somewhere without
 * being shown where is how a reader loses their place.
 */
function jumpToMonth(month: string) {
  mapOpen.value = false;

  requestAnimationFrame(() => {
    document.querySelector(`[data-month="${month}"]`)?.scrollIntoView({ block: 'start' });
    flashed.value = month;
    globalThis.setTimeout(() => {
      if (flashed.value === month) flashed.value = null;
    }, FLASH_MS);
  });
}

/**
 * The months the timeline is showing, which both charts mark.
 *
 * Read from the months on screen rather than from a scroll offset, because
 * the rows are not all the same height: a month of one event and a month of
 * forty streams take very different amounts of the page.
 */
const reading = ref<{ from: string; to: string } | null>(null);

/**
 * Whether the filters are still on screen, and whether the road is ending.
 *
 * The band at the foot only says what the filters say, so it appears when
 * they scroll away and goes again when they come back. It also retracts near
 * the end of the road: the last row would otherwise sit under it, which is
 * one row a reader could never finish reading.
 */
const filtersOffScreen = ref(false);
const nearEnd = ref(false);

/** How close to the end of the road the band gets out of the way, in px. */
const END_MARGIN = 140;

function readBand() {
  const panel = document.querySelector('.fp-page .filters')?.getBoundingClientRect();
  const rows = document.querySelectorAll(TIMELINE_ROWS);
  const last = rows[rows.length - 1]?.getBoundingClientRect();

  filtersOffScreen.value = panel !== undefined && panel.bottom < 0;
  nearEnd.value = last !== undefined && last.bottom < globalThis.innerHeight + END_MARGIN;
}

/** What the band says, which is only what is not left at its default. */
const chosen = computed(() => {
  const list: { label: string; value: string; dim: boolean }[] = [];
  const kind = filters.value.kind;

  list.push({
    label: 'できごと',
    value:
      kind === 'all'
        ? 'すべて'
        : kind === 'emphasized'
          ? '顔ぶれと姿'
          : kind === 'none'
            ? '出さない'
            : KIND_LABELS[kind],
    dim: kind === 'all',
  });
  list.push({
    label: '配信',
    value: STREAM_MODES.find((mode) => mode.id === filters.value.streams)?.label ?? '',
    dim: filters.value.streams === 'all',
  });
  list.push({ label: '並び', value: filters.value.order === 'asc' ? '過去から' : '未来から', dim: true });

  return list;
});

const bandFaces = computed(() => data.channels.value.filter((channel) => filters.value.members.has(channel.channelId)));

function backToFilters() {
  document.querySelector('.fp-page .filters')?.scrollIntoView({ block: 'start' });
}

/** Which side panel the narrow layout has opened, or null. */
const panel = ref<'soon' | 'ago' | null>(null);

function readPosition() {
  const names = [...document.querySelectorAll<HTMLElement>('.timeline [data-month]')]
    .filter((element) => {
      const box = element.getBoundingClientRect();

      return box.bottom > 0 && box.top < globalThis.innerHeight;
    })
    .map((element) => element.dataset.month ?? '')
    .filter((month) => month !== '')
    .sort();

  reading.value = names.length === 0 ? null : { from: names[0]!, to: names[names.length - 1]! };
  readBand();
}

/**
 * Every record that can be opened, in the order the timeline shows them.
 *
 * Taken from the timeline rather than from the records themselves, so that
 * stepping from one to the next follows what is on screen: a member chosen
 * above, streams turned off, or the newest first, changes what "the next
 * record" is.
 */
const sequence = computed(() => {
  const keys = timeline.value.order.flatMap((item) =>
    item.kind === 'event' ? [item.key] : item.kind === 'bundle' ? item.rows.map((row) => `v:${row.videoId}`) : [],
  );

  return filters.value.order === 'desc' ? keys.reverse() : keys;
});

const openKey = ref<string | null>(null);

function openItem(key: string) {
  openKey.value = key;
}

/**
 * Closes what is open and takes the page to that record's row.
 *
 * A stream folded inside a run has no row of its own, so the run it belongs
 * to is where the reader is sent. Being put somewhere near is better than
 * being left where they were with nothing having happened.
 */
function rowKeyFor(key: string): string {
  if (!key.startsWith('v:')) return key;

  const videoId = key.slice(2);
  const holder = timeline.value.order.find(
    (item) => item.kind === 'bundle' && item.rows.some((row) => row.videoId === videoId),
  );

  return holder?.key ?? key;
}

function showItem(key: string) {
  const target = rowKeyFor(key);

  openKey.value = null;
  mapOpen.value = false;

  requestAnimationFrame(() => {
    document.querySelector(`.timeline [data-key="${target}"]`)?.scrollIntoView({ block: 'center' });
  });
}

function readTheme() {
  dark.value = getComputedStyle(document.documentElement).colorScheme.includes('dark');
}

/**
 * Where the reader is depends on where the months sit on screen, which a
 * filter, the order or a run opening moves without any scroll or resize.
 */
watch([timeline, openBundles], readPosition, { flush: 'post' });

onMounted(async () => {
  readTheme();
  globalThis.addEventListener('scroll', readPosition, { passive: true });
  globalThis.addEventListener('resize', readPosition);
  systemTheme.addEventListener('change', readTheme);
  themeObserver = new MutationObserver(readTheme);
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  clock = setInterval(() => {
    now.value = Date.now();
  }, TICK_MS);

  await data.start();
  await nextTick();
  readPosition();
});

onBeforeUnmount(() => {
  globalThis.removeEventListener('scroll', readPosition);
  globalThis.removeEventListener('resize', readPosition);
  data.stop();
  clearInterval(clock);
  themeObserver?.disconnect();
  systemTheme.removeEventListener('change', readTheme);
});
</script>

<template>
  <SiteShell page="footprints" title="けもV あしあと">
    <template #title-aside>
      <UpdatedAt :at="data.fetchedAt.value" :state="updatedState" />
    </template>

    <div class="fp-page">
      <div class="fp-panel filters">
        <div class="filter-row">
          <span class="filter-label">メンバー</span>
          <div class="chips">
            <button type="button" class="chip" :aria-pressed="filters.members.size === 0" @click="toggleMember(null)">
              みんな
            </button>
            <button
              v-for="channel in data.channels.value"
              :key="channel.channelId"
              type="button"
              class="chip with-face"
              :aria-pressed="filters.members.has(channel.channelId)"
              @click="toggleMember(channel.channelId)"
            >
              <MemberAvatar
                :src="channel.thumbnailUrl"
                :name="channel.name"
                :color="channel.color.key"
                :size="24"
                :dark
              />
              <span class="chip-name">{{ channel.name }}</span>
            </button>
          </div>
        </div>

        <div class="filter-row">
          <span class="filter-label">できごと</span>
          <select
            class="picker"
            aria-label="できごとの種類"
            :value="filters.kind"
            @change="filters = { ...filters, kind: ($event.target as HTMLSelectElement).value as Filters['kind'] }"
          >
            <option value="all">すべてのできごと</option>
            <option value="emphasized">顔ぶれと姿が変わった日</option>
            <optgroup label="種類">
              <option v-for="kind in kinds" :key="kind" :value="kind">{{ KIND_LABELS[kind] }}</option>
            </optgroup>
            <option value="none">できごとを出さない</option>
          </select>

          <span class="filter-label">配信</span>
          <span class="segments" role="group" aria-label="配信の見せ方">
            <button
              v-for="mode in STREAM_MODES"
              :key="mode.id"
              type="button"
              :aria-pressed="filters.streams === mode.id"
              @click="filters = { ...filters, streams: mode.id as StreamModeId }"
            >
              {{ mode.label }}
            </button>
          </span>

          <span class="spacer"></span>

          <select class="picker" aria-label="年へ移動" @change="jumpToYear(($event.target as HTMLSelectElement).value)">
            <option value="">年へ移動</option>
            <option v-for="year in years" :key="year" :value="String(year)">{{ year }}年</option>
          </select>

          <button
            type="button"
            class="order"
            @click="filters = { ...filters, order: filters.order === 'asc' ? 'desc' : 'asc' }"
          >
            {{ filters.order === 'asc' ? '過去から' : '未来から' }}
          </button>
        </div>
      </div>

      <p v-if="failed" class="fp-panel fp-empty">
        記録を取得できませんでした<br />
        しばらく時間をおいてから再度お試しください
      </p>
      <p v-else-if="data.loading.value" class="fp-panel fp-empty">読み込んでいます</p>
      <div v-else class="main">
        <p v-if="timeline.events === 0 && timeline.streams === 0" class="fp-panel fp-empty">
          条件に合う記録はありません
        </p>
        <TimelineView
          v-else
          :timeline
          :channels="data.channels.value"
          :filters
          :open="openBundles"
          :now
          :dark
          :flashed
          @toggle="toggleBundle"
          @open="openItem"
        />

        <aside class="rail">
          <div class="fp-panel side">
            <AsideList
              :items="soonShown"
              :channels="data.channels.value"
              heading="これからのあしあと"
              mode="soon"
              :now
              :dark
              empty="この条件でめぐってくる日はありません"
              @open="openItem"
            >
              <template #foot>
                <button
                  v-if="soonList.length > soonShown.length || soonAll"
                  type="button"
                  class="more fp-n"
                  @click="soonAll = !soonAll"
                >
                  {{ soonAll ? '近いものだけ表示' : `1 年先まで表示（${soonList.length} 件）` }}
                </button>
              </template>
            </AsideList>

            <AsideList
              :items="agoList"
              :channels="data.channels.value"
              heading="むかしの今週"
              mode="ago"
              :now
              :dark
              empty="この週の記録はまだありません"
              @open="openItem"
            />
          </div>

          <div class="stuck">
            <div class="fp-panel side map-card">
              <div class="map-head">
                <h2>軌跡</h2>
                <button type="button" class="detail" aria-haspopup="dialog" @click="mapOpen = true">詳しく見る</button>
              </div>
              <TrailMap
                :events="items"
                :rows="data.rows.value"
                :channels="data.channels.value"
                :filters
                :now
                :dark
                :reading
                @month="jumpToMonth"
                @member="toggleMember"
              />
            </div>

            <div class="jump" role="group" aria-label="年表の端へ送る">
              <button type="button" class="order" @click="jumpToStart">はじまり</button>
              <button type="button" class="order" @click="jumpToNow">いま</button>
            </div>
          </div>
        </aside>
      </div>

      <!-- What the filters say, at the foot of the screen once they have
           scrolled away. A frame of no height, so nothing below it moves
           when the band appears or goes. -->
      <div v-if="filtersOffScreen && !nearEnd" class="band">
        <div class="band-in">
          <button type="button" class="band-open" @click="backToFilters">
            <span class="band-faces">
              <MemberAvatar
                v-for="face in bandFaces"
                :key="face.channelId"
                :src="face.thumbnailUrl"
                :name="face.name"
                :color="face.color.key"
                :size="22"
                :dark
              />
              <span v-if="bandFaces.length === 0" class="band-all">V</span>
            </span>
            <span v-if="bandFaces.length === 0" class="band-item">みんな</span>

            <span v-for="entry in chosen" :key="entry.label" class="band-item" :class="{ dim: entry.dim }">
              <i>{{ entry.label }}</i>
              <b>{{ entry.value }}</b>
            </span>

            <span class="band-go">絞り込みへ ↑</span>
          </button>

          <span class="band-jump" role="group" aria-label="年表の端へ送る">
            <button type="button" class="band-b" @click="jumpToStart">はじまり</button>
            <button type="button" class="band-b" @click="jumpToNow">いま</button>
          </span>
        </div>
      </div>

      <!-- Where the rail does not fit, what it held is reached from here. -->
      <div class="dock" role="group" aria-label="軌跡・これからのあしあと・むかしの今週">
        <button type="button" aria-haspopup="dialog" @click="mapOpen = true">軌跡</button>
        <button type="button" aria-haspopup="dialog" @click="panel = 'soon'">これからのあしあと</button>
        <button type="button" aria-haspopup="dialog" @click="panel = 'ago'">むかしの今週</button>
      </div>

      <PanelDialog v-if="panel === 'soon'" heading="これからのあしあと" @close="panel = null">
        <AsideList
          :items="soonShown"
          :channels="data.channels.value"
          heading=""
          mode="soon"
          :now
          :dark
          empty="この条件でめぐってくる日はありません"
          @open="openItem"
        >
          <template #foot>
            <button
              v-if="soonList.length > soonShown.length || soonAll"
              type="button"
              class="more fp-n"
              @click="soonAll = !soonAll"
            >
              {{ soonAll ? '近いものだけ表示' : `1 年先まで表示（${soonList.length} 件）` }}
            </button>
          </template>
        </AsideList>
      </PanelDialog>

      <PanelDialog v-if="panel === 'ago'" heading="むかしの今週" @close="panel = null">
        <AsideList
          :items="agoList"
          :channels="data.channels.value"
          heading=""
          mode="ago"
          :now
          :dark
          empty="この週の記録はまだありません"
          @open="openItem"
        />
      </PanelDialog>

      <RecordDialog
        v-if="openKey !== null"
        :open="openKey"
        :events="items"
        :rows="data.rows.value"
        :channels="data.channels.value"
        :sequence
        :now
        :dark
        @close="openKey = null"
        @open="openItem"
        @show="showItem"
      />

      <TrailDialog
        v-if="mapOpen"
        :events="items"
        :rows="data.rows.value"
        :channels="data.channels.value"
        :filters
        :soon="soonList"
        :now
        :dark
        :reading
        @close="mapOpen = false"
        @month="jumpToMonth"
        @member="toggleMember"
        @open="openItem"
      />
    </div>

    <template #notes>
      <li>配信・動画の記録は 10 分ごとに更新しています</li>
      <li>できごとはパークスタッフさんやメンバーの発表をもとに記録しています</li>
      <li>周年と日数は、できごとに記録したデビューの日から数えています</li>
      <li>日時はすべて日本時間です</li>
      <li>このサイトは非公式のファンサイトです</li>
    </template>
  </SiteShell>
</template>

<style scoped>
/* The road and the panels beside it. Below 1040px the panels go, and what
   they held moves to the band at the foot of the screen (#140). */
.main {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 292px;
  gap: 22px;

  /* Stretched, not started: the rail has to be as tall as the timeline for
     the trajectory inside it to have anywhere to stick to. */
  align-items: stretch;
  min-width: 0;
}

.rail {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}

.side {
  padding: 10px 12px 12px;
}

.side > * + * {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--k-line);
}

.more {
  width: 100%;
  height: 28px;
  margin-top: 6px;
  border: 1px solid var(--k-line);
  border-radius: 6px;
  background: var(--k-surface);
  color: var(--k-text-2);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.more:hover {
  border-color: var(--k-line-2);
}

/* The trajectory and the two buttons under it stay put as the page is read.
   They are separate objects that share a way of sticking (#140), which is why
   the panel and the buttons are laid out apart and only the wrapper sticks. */
.stuck {
  display: flex;
  position: sticky;
  top: calc(var(--shell-nav-height, 44px) + 14px);
  flex-direction: column;
  gap: 12px;
}

.map-card {
  padding: 10px 12px 12px;
}

.map-head {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.map-head h2 {
  margin: 0;
  color: var(--k-text-2);
  font-size: 12.5px;
  font-weight: 700;
}

.detail {
  height: 26px;
  padding: 0 8px;
  border: 1px solid var(--k-line);
  border-radius: 6px;
  background: var(--k-surface);
  color: var(--k-text-2);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.detail:hover {
  border-color: var(--k-line-2);
}

/* Two places a reader always wants to get back to, kept beside the road
   rather than inside a panel: they move the timeline, they do not describe
   it. */
.jump {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.jump .order {
  justify-content: center;
  height: 36px;
  box-shadow: var(--k-shadow);
}

/*
 * What the filters say, once they have scrolled away.
 *
 * A frame of no height with its contents floating above it, so that the
 * timeline does not move when the band appears or goes. It sits above the
 * dock where there is one.
 */
.band {
  position: sticky;
  z-index: 30;
  bottom: var(--fp-dock, 0);
  height: 0;
}

.band-in {
  display: flex;
  position: absolute;
  right: 0;
  bottom: 10px;
  left: 0;
  gap: 6px;
  align-items: center;
  width: max-content;
  max-width: 100%;
  height: 42px;
  margin: 0 auto;
  padding: 0 6px;
  border: 1px solid var(--k-line-2);
  border-radius: 999px;

  /* Opaque, because the timeline runs under it and text through text is
     text nobody can read. */
  background: var(--k-surface);
  box-shadow:
    0 2px 4px rgb(14 31 28 / 6%),
    0 12px 26px -14px rgb(14 31 28 / 50%);
}

.band-open {
  display: inline-flex;
  gap: 8px;
  align-items: center;
  min-width: 0;
  height: 34px;
  padding: 0 4px 0 6px;
  overflow: auto hidden;
  border: 0;
  border-radius: 999px;
  background: none;
  color: var(--k-text-2);
  font: inherit;
  font-size: 12px;
  scrollbar-width: none;
  cursor: pointer;
}

.band-open::-webkit-scrollbar {
  display: none;
}

.band-open:hover {
  background: var(--k-sunken);
}

.band-faces {
  display: inline-flex;
  flex: none;
  align-items: center;
}

.band-faces > * + * {
  margin-left: -5px;
}

.band-all {
  display: inline-grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border: 2px solid var(--k-text-3);
  border-radius: 50%;
  background: var(--k-surface);
  color: var(--k-text-2);
  font-size: 9px;
  font-weight: 700;
}

/* The rule belongs to the item on its left, so hiding the item hides the
   rule with it. */
.band-item {
  display: inline-flex;
  flex: none;
  gap: 5px;
  align-items: baseline;
  padding-left: 8px;
  border-left: 1px solid var(--k-line-2);
  white-space: nowrap;
}

.band-item i {
  color: var(--k-text-3);
  font-size: 11.5px;
  font-style: normal;
}

.band-item b {
  color: var(--k-text);
  font-weight: 600;
}

.band-go {
  display: inline-flex;
  flex: none;
  align-items: center;
  height: 26px;
  margin-left: 2px;
  padding: 0 9px;
  border: 1px solid var(--k-line);
  border-radius: 999px;
  background: var(--k-sunken);
  white-space: nowrap;
}

/* The two ends of the road ride here only where the rail has gone. */
.band-jump {
  display: none;
  flex: none;
  gap: 6px;
  padding-left: 6px;
  border-left: 1px solid var(--k-line);
}

.band-b {
  display: inline-flex;
  flex: none;
  align-items: center;
  height: 30px;
  padding: 0 12px;
  border: 1px solid var(--k-line);
  border-radius: 999px;
  background: var(--k-sunken);
  color: var(--k-text-2);
  font: inherit;
  font-size: 12px;
  white-space: nowrap;
  cursor: pointer;
}

.band-b:hover {
  border-color: var(--k-line-2);
}

.dock {
  display: none;
  position: sticky;
  z-index: 31;
  bottom: 0;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
  padding: 6px 0 calc(6px + env(safe-area-inset-bottom, 0px));
  border-top: 1px solid var(--k-line);
  background: var(--k-bg);
}

.dock button {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  height: 44px;
  padding: 0 4px;
  overflow: hidden;
  border: 1px solid var(--k-line);
  border-radius: 8px;
  background: var(--k-surface);
  color: var(--k-text-2);
  font: inherit;
  font-size: 11.5px;
  font-weight: 600;
  line-height: 1.2;
  white-space: nowrap;
  text-overflow: ellipsis;
  cursor: pointer;
}

.dock button:hover {
  border-color: var(--k-line-2);
}

@container (max-width: 1040px) {
  .main {
    grid-template-columns: minmax(0, 1fr);
    gap: 0;
  }

  .rail {
    display: none;
  }

  .dock {
    display: grid;
  }

  .band {
    --fp-dock: 56px;
  }

  .band-jump {
    display: inline-flex;
  }
}

/* Narrower still, the band keeps only what is not at its default. */
@container (max-width: 620px) {
  .band-item.dim {
    display: none;
  }
}

.filters {
  padding: 4px 14px;
  margin-bottom: 8px;
}

.filter-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 10px;
  align-items: center;
  min-width: 0;
  padding: 8px 0;
}

.filter-row + .filter-row {
  border-top: 1px dotted var(--k-line-2);
}

.filter-label {
  flex: none;
  color: var(--k-text-3);
  font-size: 12px;
  font-weight: 600;
}

.chips {
  display: flex;
  flex: 1;
  flex-wrap: wrap;
  gap: 6px;
  min-width: 0;
}

.chip {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  height: 30px;
  padding: 0 10px;
  border: 1px solid var(--k-line);
  border-radius: 999px;
  background: var(--k-surface);
  color: var(--k-text-2);
  font: inherit;
  font-size: 12.5px;
  white-space: nowrap;
  cursor: pointer;
}

.chip.with-face {
  padding-left: 3px;
}

.chip:hover {
  border-color: var(--k-line-2);
}

/* The chosen state is the border and the ground, never the member's own
   colour: that colour tells people apart and says nothing else (#140). */
.chip[aria-pressed='true'] {
  border-color: var(--k-accent);
  background: var(--k-accent-soft);
  color: var(--k-text);
  font-weight: 600;
}

.picker,
.order {
  height: 32px;
  max-width: 100%;
  padding: 0 10px;
  border: 1px solid var(--k-line);
  border-radius: 6px;
  background: var(--k-surface);
  color: var(--k-text);
  font: inherit;
  font-size: 12.5px;
  cursor: pointer;
}

.picker:hover,
.order:hover {
  border-color: var(--k-line-2);
}

.segments {
  display: inline-flex;
  overflow: hidden;
  border: 1px solid var(--k-line);
  border-radius: 6px;
  background: var(--k-surface);
}

.segments button {
  height: 30px;
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

.spacer {
  flex: 1;
}

@container (max-width: 620px) {
  .filters {
    padding: 2px 10px;
  }

  .chip-name {
    display: none;
  }

  .chip.with-face {
    justify-content: center;
    width: 30px;
    padding: 0 3px;
  }

  .spacer {
    display: none;
  }
}
</style>
