<script setup lang="ts">
import { computed } from 'vue';

import SegmentGroup from '@/stats/parts/SegmentGroup.vue';
import { formatCount } from '@/stats/draw';
import { getPropertyName, VIDEO_PROPERTIES, type VideoProperty } from '@/type/video';

import { KINDS, LIST_PERIODS, type ListPeriodId, type TitlePart } from '../model';
import VideoThumb from './VideoThumb.vue';
import type { VideoType } from '@/type/api';

/** One line of the list, already ranked, searched and written out. */
export interface ListRow {
  videoId: string;
  /** Null when the measure has no value for this video, so no rank either. */
  rank: number | null;
  title: TitlePart[];
  /** The title as one string, for the tooltip and the label. */
  plainTitle: string;
  published: string;
  kind: string;
  length: string;
  value: string;
}

/**
 * This member's videos inside a ranking of every member's.
 *
 * The rank is the video's place among all eleven members' videos of the same
 * kind and period - #136 keeps it that way on purpose, because a rank within
 * one member would crown somebody once per member and turn eleven pages into
 * a comparison. Searching a title hides rows and never renumbers them.
 */
const { rows, kind, period, metric, order, query, total, shown } = defineProps<{
  rows: readonly ListRow[];
  kind: VideoType;
  period: ListPeriodId;
  metric: VideoProperty;
  order: 'desc' | 'asc';
  query: string;
  /** How many rows the kind and period admit, before the search hides any. */
  total: number;
  shown: number;
}>();

const emit = defineEmits<{
  kind: [id: VideoType];
  period: [id: ListPeriodId];
  metric: [id: VideoProperty];
  order: [id: 'desc' | 'asc'];
  query: [text: string];
}>();

const kindItems = KINDS.map((entry) => ({ id: entry.id, label: entry.label }));
const metricItems = VIDEO_PROPERTIES.map((property) => ({ id: property, label: getPropertyName(property) }));
const count = computed(() =>
  query === '' ? `${formatCount(total)} 本` : `${formatCount(total)} 本 → ${formatCount(shown)} 本`,
);
/** The bars shorten downward for a descending list and lengthen for one going up. */
const bars = computed(() => (order === 'desc' ? [9, 6, 3] : [3, 6, 9]));
</script>

<template>
  <div class="mv-panel">
    <div class="mv-head">
      <b>一覧</b>
      <SegmentGroup :items="kindItems" :value="kind" label="種別" @pick="emit('kind', $event as VideoType)" />
      <select
        :value="period"
        aria-label="期間"
        @change="emit('period', ($event.target as HTMLSelectElement).value as ListPeriodId)"
      >
        <option v-for="entry in LIST_PERIODS" :key="entry.id" :value="entry.id">{{ entry.label }}</option>
      </select>
      <span class="mv-grow"></span>
      <span class="mv-n">{{ count }}</span>
    </div>
    <div class="controls">
      <select
        :value="metric"
        aria-label="指標"
        @change="emit('metric', ($event.target as HTMLSelectElement).value as VideoProperty)"
      >
        <option v-for="item in metricItems" :key="item.id" :value="item.id">{{ item.label }}</option>
      </select>
      <span class="find">
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="7" cy="7" r="4.6" fill="none" stroke="currentColor" stroke-width="1.5" />
          <path d="M10.4 10.4 L14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
        </svg>
        <input
          id="members-find"
          type="search"
          autocomplete="off"
          spellcheck="false"
          placeholder="タイトルでさがす"
          aria-label="タイトルでさがす"
          :value="query"
          @input="emit('query', ($event.target as HTMLInputElement).value)"
        />
        <button v-if="query !== ''" type="button" class="clear" @click="emit('query', '')">消す</button>
      </span>
      <button
        type="button"
        class="order"
        :aria-label="order === 'desc' ? '降順' : '昇順'"
        :title="order === 'desc' ? '降順' : '昇順'"
        @click="emit('order', order === 'desc' ? 'asc' : 'desc')"
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path
            d="M3.6 2.6 v10.2 M1.6 10.8 l2 2 2-2"
            fill="none"
            stroke="currentColor"
            stroke-width="1.4"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
          <path
            :d="`M7.4 4 h${bars[0]} M7.4 8 h${bars[1]} M7.4 12 h${bars[2]}`"
            fill="none"
            stroke="currentColor"
            stroke-width="1.4"
            stroke-linecap="round"
          />
        </svg>
      </button>
    </div>
    <div class="columns">
      <span class="right">順位</span>
      <span></span>
      <span>タイトル</span>
      <span class="right">{{ getPropertyName(metric) }}</span>
    </div>
    <div class="scroll">
      <p v-if="rows.length === 0" class="mv-empty">条件に当てはまる配信・動画がみつかりません</p>
      <a v-for="row in rows" v-else :key="row.videoId" class="row" :href="`/videos/${row.videoId}`">
        <span class="rank mv-n">{{ row.rank ?? '—' }}</span>
        <VideoThumb :video-id="row.videoId" :width="46" :height="26" />
        <span class="about">
          <span class="title" :title="row.plainTitle">
            <template v-for="(part, index) in row.title" :key="index">
              <mark v-if="part.hit">{{ part.text }}</mark>
              <template v-else>{{ part.text }}</template>
            </template>
          </span>
          <span class="meta mv-n">
            {{ row.published }} ・ {{ row.kind }}<template v-if="row.length"> ・ {{ row.length }}</template>
            <span class="go"> ・ 配信・動画 →</span>
          </span>
        </span>
        <span class="value mv-n">{{ row.value }}</span>
      </a>
    </div>
  </div>
</template>

<style scoped>
.controls {
  display: flex;
  flex: none;
  flex-wrap: wrap;
  gap: 6px 8px;
  align-items: center;
  padding: 6px 12px 7px;
  border-bottom: 1px solid var(--k-line);
}

select {
  min-width: 0;
  max-width: 100%;
  padding: 2px 4px 3px;
  border: 1px solid var(--k-line-2);
  border-radius: 5px;
  background: var(--k-surface);
  color: var(--k-text);
  font: inherit;
  font-size: 11.5px;
}

.find {
  display: flex;
  flex: 1 1 120px;
  gap: 5px;
  align-items: center;
  min-width: 0;
  padding: 2px 7px;
  border: 1px solid var(--k-line-2);
  border-radius: 5px;
  background: var(--k-surface-2);
}

.find:focus-within {
  border-color: var(--k-accent);
}

.find svg {
  flex: none;
  width: 12px;
  height: 12px;
  color: var(--k-text-3);
}

.find input {
  flex: 1 1 auto;
  min-width: 0;
  padding: 1px 0;
  border: 0;
  outline: none;
  background: none;
  color: var(--k-text);
  font: inherit;
  font-size: 11.5px;
}

.find input::placeholder {
  color: var(--k-text-3);
}

.clear {
  flex: none;
  padding: 0 5px 1px;
  border: 1px solid var(--k-line-2);
  border-radius: 3px;
  background: var(--k-surface);
  color: var(--k-text-3);
  font: inherit;
  font-size: 10.5px;
  line-height: 1.3;
  cursor: pointer;
}

.clear:hover {
  border-color: var(--k-accent);
  color: var(--k-text);
}

.order {
  display: inline-flex;
  align-items: center;
  padding: 3px 8px;
  border: 1px solid var(--k-line-2);
  border-radius: 999px;
  background: var(--k-surface);
  color: var(--k-text-2);
  font: inherit;
  cursor: pointer;
}

.order:hover {
  border-color: var(--k-accent);
}

.order svg {
  display: block;
  width: 13px;
  height: 13px;
}

.columns,
.row {
  display: grid;
  grid-template-columns: 32px 46px minmax(0, 1fr) 78px;
  gap: 8px;
}

.columns {
  flex: none;
  padding: 4px 12px 5px;
  border-bottom: 1px solid var(--k-line);
  background: var(--k-surface-2);
  color: var(--k-text-3);
  font-size: 10.5px;
}

.right {
  text-align: right;
}

.scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden auto;
}

.row {
  align-items: center;
  padding: 4px 12px;
  border-top: 1px dashed var(--k-line);
  color: inherit;
  text-decoration: none;
}

.row:first-child {
  border-top: 0;
}

.row:hover {
  background: var(--k-sunken);
}

.go {
  color: var(--k-accent);
  opacity: 0;
  transition: opacity 0.18s ease;
}

.row:hover .go,
.row:focus-visible .go {
  opacity: 1;
}

.rank {
  color: var(--k-text-3);
  font-size: 11.5px;
  text-align: right;
}

.about {
  min-width: 0;
}

.title {
  display: block;
  overflow: hidden;
  font-size: 12px;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.title mark {
  padding: 0 1px;
  border-radius: 2px;
  box-shadow: inset 0 -1px 0 var(--k-accent);
  background: var(--k-accent-soft);
  color: inherit;
}

.meta {
  display: block;
  overflow: hidden;
  color: var(--k-text-3);
  font-size: 10.5px;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.value {
  overflow: hidden;
  font-size: 12.5px;
  font-weight: 600;
  text-align: right;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@container (max-width: 1120px) {
  .scroll {
    min-height: 200px;
    max-height: 420px;
  }
}

@container (max-width: 720px) {
  .columns,
  .row {
    grid-template-columns: 28px 46px minmax(0, 1fr) 64px;
    gap: 6px;
    padding-right: 8px;
    padding-left: 8px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .go {
    transition: none;
  }
}
</style>
