<script setup lang="ts">
import { computed, ref, watch } from 'vue';

import type { Channel } from '@/type/api';
import type { VideoProperty } from '@/type/video';
import type { RankingPeriod } from '@/lib/ranking';
import {
  COUNT_METRICS,
  KINDS,
  LENGTH_BANDS,
  PERIOD_CHIPS,
  periodLabel,
  shelfFilterCount,
  RATE_METRICS,
  type Filters,
  type YearOption,
} from '../model';
import { memberColor } from '@/lib/memberColor';
import MemberAvatar from '@/parts/MemberAvatar.vue';
import SegmentGroup from '@/parts/SegmentGroup.vue';

/**
 * The condition面: the always-visible search field, the collapsible shelf of
 * length and channel filters, and the metric/period/kind controls.
 *
 * Opening the page shows the ranking it always has - the shelf starts closed,
 * and nothing here changes the ranking's denominator except the metric,
 * period and kind controls at the bottom (#135's rule).
 */
const { metric, kind, period, filters, channels, years, dark } = defineProps<{
  metric: VideoProperty;
  kind: string;
  period: RankingPeriod;
  filters: Filters;
  channels: readonly Channel[];
  years: readonly YearOption[];
  dark: boolean;
}>();

const emit = defineEmits<{
  metric: [VideoProperty];
  kind: [string];
  period: [RankingPeriod];
  query: [string];
  lengthBand: [string];
  toggleChannel: [string];
  resetFilters: [];
}>();

const shelfOpen = ref(false);
const shelfCount = computed(() => shelfFilterCount(filters));
const kindItems = KINDS.map((k) => ({ id: k.id, label: k.name }));

const periodSamePeriod = (a: RankingPeriod, b: RankingPeriod) =>
  typeof a === 'object' || typeof b === 'object' ? JSON.stringify(a) === JSON.stringify(b) : a === b;

const yearSelectValue = computed(() => (typeof period === 'object' ? `y${period.year}` : ''));

function onYearSelect(event: Event) {
  const value = (event.target as HTMLSelectElement).value;

  if (value === '') return;
  const year = Number(value.slice(1));

  emit('period', { year });
}

function channelStyle(color: string) {
  return { '--chip-ch': memberColor(color, dark) };
}

let searchTimer: ReturnType<typeof setTimeout> | undefined;
const searchInput = ref(filters.query);

// The shelf's own "条件をすべて消す" and the funnel's suggestions clear
// filters.query from outside this component - without this, the input box
// would keep showing the old text after either one.
watch(
  () => filters.query,
  (query) => {
    if (searchTimer) clearTimeout(searchTimer);
    searchInput.value = query;
  },
);

function onSearchInput(event: Event) {
  const value = (event.target as HTMLInputElement).value;

  searchInput.value = value;
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => emit('query', value), 110);
}

function clearQuery() {
  searchInput.value = '';
  if (searchTimer) clearTimeout(searchTimer);
  emit('query', '');
}
</script>

<template>
  <div class="panel">
    <div class="findbar">
      <div class="field">
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="7" cy="7" r="4.6" fill="none" stroke="currentColor" stroke-width="1.5" />
          <path d="M10.4 10.4 L14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
        </svg>
        <input
          type="search"
          autocomplete="off"
          spellcheck="false"
          placeholder="タイトルでさがす"
          aria-label="タイトルでさがす"
          :value="searchInput"
          @input="onSearchInput"
        />
        <button v-if="searchInput" type="button" class="xq" @click="clearQuery">消す</button>
      </div>
      <button
        type="button"
        class="shelfbtn"
        :data-on="shelfCount > 0 ? '1' : '0'"
        :aria-expanded="shelfOpen"
        aria-controls="videos-shelf"
        @click="shelfOpen = !shelfOpen"
      >
        絞り込み
        <span v-if="shelfCount > 0" class="cnt">{{ shelfCount }}</span>
      </button>
    </div>

    <div v-show="shelfOpen" id="videos-shelf" class="shelf">
      <div class="rail">
        <span class="tag">再生時間</span>
        <div class="chips">
          <button
            v-for="band in LENGTH_BANDS"
            :key="band.id"
            type="button"
            class="chip"
            :aria-pressed="filters.lengthBandId === band.id"
            @click="emit('lengthBand', band.id)"
          >
            {{ band.name }}
          </button>
        </div>
      </div>
      <div class="rail">
        <span class="tag">メンバー</span>
        <div class="chips">
          <button
            v-for="channel in channels"
            :key="channel.channelId"
            type="button"
            class="chip who"
            :style="channelStyle(channel.color.key)"
            :aria-pressed="filters.channelIds.has(channel.channelId)"
            @click="emit('toggleChannel', channel.channelId)"
          >
            <MemberAvatar
              :src="channel.thumbnailUrl"
              :name="channel.name"
              :color="channel.color.key"
              :size="17"
              :dark="dark"
            />
            <span>{{ channel.name }}</span>
          </button>
        </div>
      </div>
      <div class="shelffoot">
        <button
          type="button"
          class="reset"
          :disabled="shelfCount === 0 && !filters.query"
          @click="emit('resetFilters')"
        >
          条件をすべて消す
        </button>
      </div>
    </div>

    <div class="controls">
      <div class="rail">
        <span class="tag">計測値</span>
        <div class="chips">
          <button
            v-for="m in COUNT_METRICS"
            :key="m.id"
            type="button"
            class="chip"
            :aria-pressed="metric === m.id"
            @click="emit('metric', m.id)"
          >
            {{ m.name }}
          </button>
        </div>
      </div>
      <div class="rail sibling">
        <span class="tag">密度</span>
        <div class="chips">
          <button
            v-for="m in RATE_METRICS"
            :key="m.id"
            type="button"
            class="chip"
            :aria-pressed="metric === m.id"
            @click="emit('metric', m.id)"
          >
            {{ m.name }}
          </button>
        </div>
      </div>
      <div class="rail">
        <span class="tag">期間</span>
        <div class="chips">
          <button
            v-for="p in PERIOD_CHIPS"
            :key="p"
            type="button"
            class="chip"
            :aria-pressed="periodSamePeriod(period, p)"
            @click="emit('period', p)"
          >
            {{ periodLabel(p) }}
          </button>
          <select
            class="yearsel"
            :data-on="yearSelectValue ? '1' : '0'"
            :value="yearSelectValue"
            aria-label="年を選ぶ"
            @change="onYearSelect"
          >
            <option value="">年を選ぶ</option>
            <option v-for="y in years" :key="y.year" :value="`y${y.year}`">{{ y.name }}</option>
          </select>
        </div>
        <div class="knob">
          <span class="tag">種別</span>
          <SegmentGroup :items="kindItems" :value="kind" label="種別" @pick="emit('kind', $event)" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.panel {
  background: var(--k-surface);
  border: 1px solid var(--k-line);
  border-radius: 8px;
  box-shadow: var(--k-shadow);
  overflow: hidden;
}

.findbar {
  display: flex;
  align-items: center;
  gap: 8px 12px;
  flex-wrap: wrap;
  padding: 9px 12px;
}

.field {
  flex: 1 1 240px;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 8px;
  border: 1px solid var(--k-line-2);
  border-radius: 6px;
  background: var(--k-surface-2);
  transition: border-color 0.22s ease;
}

.field:focus-within {
  border-color: var(--k-accent);
}

.field svg {
  width: 14px;
  height: 14px;
  flex: 0 0 auto;
  color: var(--k-text-3);
}

.field input {
  flex: 1 1 auto;
  min-width: 0;
  font: inherit;
  font-size: 12.5px;
  padding: 2px 0;
  border: 0;
  background: none;
  color: var(--k-text);
  outline: none;
}

.field input::placeholder {
  color: var(--k-text-3);
}

.xq {
  font: inherit;
  font-size: 11px;
  padding: 1px 7px;
  border: 1px solid var(--k-line-2);
  border-radius: 4px;
  background: var(--k-surface);
  color: var(--k-text-3);
  cursor: pointer;
  flex: 0 0 auto;
}

.xq:hover {
  color: var(--k-text);
  border-color: var(--k-accent);
}

.shelfbtn {
  font: inherit;
  font-size: 12px;
  padding: 4px 10px;
  border: 1px solid var(--k-line-2);
  border-radius: 6px;
  background: var(--k-surface);
  color: var(--k-text-2);
  cursor: pointer;
  white-space: nowrap;
  flex: 0 0 auto;
  transition:
    border-color 0.22s ease,
    color 0.22s ease,
    background 0.22s ease;
}

.shelfbtn:hover {
  border-color: var(--k-accent);
  color: var(--k-text);
}

.shelfbtn[data-on='1'] {
  background: var(--k-accent-soft);
  border-color: var(--k-accent);
  color: var(--k-accent);
  font-weight: 600;
}

.shelfbtn .cnt {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}

.shelf {
  padding: 8px 12px 9px;
  background: var(--k-sunken);
  border-top: 1px solid var(--k-line);
}

.shelffoot {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 7px;
  padding-top: 6px;
  border-top: 1px solid var(--k-line-2);
}

.reset {
  font: inherit;
  font-size: 11.5px;
  margin-left: auto;
  padding: 3px 9px;
  border: 1px solid var(--k-line-2);
  border-radius: 5px;
  background: var(--k-surface);
  color: var(--k-text-2);
  cursor: pointer;
}

.reset:hover {
  border-color: var(--k-accent);
  color: var(--k-text);
}

.reset[disabled] {
  opacity: 0.45;
  cursor: default;
}

.reset[disabled]:hover {
  border-color: var(--k-line-2);
  color: var(--k-text-2);
}

.controls {
  padding: 8px 12px 9px;
  border-top: 1px solid var(--k-line);
}

.rail {
  display: flex;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 8px;
  padding: 3px 0;
}

.rail + .rail {
  border-top: 1px solid var(--k-line);
  margin-top: 3px;
  padding-top: 6px;
}

/* Counts and rates are both "a group of selectable metrics", so only the
   border between them is dashed, marking them as siblings rather than
   unrelated rows. */
.rail.sibling {
  border-top-style: dashed;
}

.rail > .tag {
  flex: 0 0 46px;
  padding-top: 4px;
  color: var(--k-text-3);
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.06em;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
}

.chip {
  font: inherit;
  font-size: 12px;
  line-height: 1.2;
  padding: 4px 9px;
  border: 1px solid var(--k-line-2);
  border-radius: 5px;
  background: var(--k-surface);
  color: var(--k-text-2);
  cursor: pointer;
  transition:
    background 0.22s ease,
    color 0.22s ease,
    border-color 0.22s ease;
}

.chip:hover {
  border-color: var(--k-accent);
  color: var(--k-text);
}

.chip[aria-pressed='true'] {
  background: var(--k-accent);
  border-color: var(--k-accent);
  color: var(--k-on-accent);
  font-weight: 600;
}

.yearsel {
  font: inherit;
  font-size: 12px;
  line-height: 1.2;
  padding: 4px 8px;
  border: 1px solid var(--k-line-2);
  border-radius: 5px;
  background: var(--k-surface);
  color: var(--k-text-2);
  cursor: pointer;
}

.yearsel[data-on='1'] {
  background: var(--k-accent);
  border-color: var(--k-accent);
  color: var(--k-on-accent);
  font-weight: 600;
}

/* The channel chip's own colour tells it apart from the others - never its
   size or position (#135). */
.chip.who {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding-left: 4px;
}

.chip.who :deep(.avatar) {
  box-shadow: 0 0 0 1.5px var(--chip-ch, var(--k-line-2));
}

.knob {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 0 0 auto;
}
</style>
