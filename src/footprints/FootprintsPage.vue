<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

import SiteShell from '@/shell/SiteShell.vue';
import UpdatedAt from '@/shell/UpdatedAt.vue';
import MemberAvatar from '@/parts/MemberAvatar.vue';

import { buildTimeline, eventItems, KIND_LABELS, STREAM_MODES, type Filters, type StreamModeId } from './model';
import TimelineView from './parts/TimelineView.vue';
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

const updatedState = computed(() => {
  if (data.failure.value !== null && data.fetchedAt.value === null) return 'error' as const;

  return data.loading.value ? ('loading' as const) : ('ok' as const);
});

const failed = computed(() => data.failure.value !== null && data.rows.value.length === 0);

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

function openItem(key: string) {
  // Opening one record on its own is the next part of this page's work; for
  // now the row itself is what a reader sees.
  void key;
}

function readTheme() {
  dark.value = getComputedStyle(document.documentElement).colorScheme.includes('dark');
}

onMounted(async () => {
  readTheme();
  systemTheme.addEventListener('change', readTheme);
  themeObserver = new MutationObserver(readTheme);
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  clock = setInterval(() => {
    now.value = Date.now();
  }, TICK_MS);

  await data.start();
});

onBeforeUnmount(() => {
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
      <p v-else-if="timeline.events === 0 && timeline.streams === 0" class="fp-panel fp-empty">
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
        @toggle="toggleBundle"
        @open="openItem"
      />
    </div>

    <template #notes>
      <li>配信・動画の記録は 10 分ごとに更新しています</li>
      <li>できごとは運営やメンバーの発表をもとに記録しています</li>
      <li>周年と日数は、できごとに記録したデビューの日から数えています</li>
      <li>日時はすべて日本時間です</li>
      <li>このサイトは非公式のファンサイトです</li>
    </template>
  </SiteShell>
</template>

<style scoped>
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
