<script setup lang="ts">
import { withCommas } from '@nanase/alnilam/number';

import type { Channel } from '@/type/api';
import { formatDate } from '@/lib/timeFormat';
import { formatProperty, getPropertyName, type VideoProperty } from '@/type/video';
import { titleSegments, type UniverseEntry } from '../model';
import { memberColor } from '@/stats/draw';
import VideoThumbnail from './VideoThumbnail.vue';

/**
 * The left leaf of the spread: the ranked list.
 *
 * `entries` arrives already narrowed and paginated - this component draws
 * what it is given and never re-ranks or re-filters it. A row's rank is
 * whatever `entries[i].rank` says, so a filtered list keeps the gaps in its
 * numbering rather than renumbering itself 1, 2, 3 (#135).
 */
const { entries, remainingCount, metric, top, channelsById, selectedId, tokens, wide, pinned, dark } = defineProps<{
  entries: readonly UniverseEntry[];
  remainingCount: number;
  metric: VideoProperty;
  top: number;
  channelsById: ReadonlyMap<string, Channel>;
  selectedId: string | null;
  tokens: readonly string[];
  wide: boolean;
  pinned: { rank: number | null; title: string } | null;
  dark: boolean;
}>();

const emit = defineEmits<{ select: [videoId: string]; more: [] }>();

function shareOf(value: number): string {
  const share = top > 0 ? Math.max(0, Math.min(100, (value / top) * 100)) : 0;

  return `${share.toFixed(1)}%`;
}

function whoStyle(channelId: string) {
  const channel = channelsById.get(channelId);

  return channel ? { '--who-ch': memberColor(channel.color.key, dark) } : undefined;
}

function onRowKeydown(event: KeyboardEvent, videoId: string) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    emit('select', videoId);
  }
}
</script>

<template>
  <table class="list">
    <colgroup>
      <col class="c-rank" />
      <col class="c-val" />
      <col class="c-pic" />
      <col v-if="wide" class="c-who" />
      <col class="c-name" />
      <col v-if="wide" class="c-date" />
    </colgroup>
    <thead>
      <tr>
        <th class="r">順位</th>
        <th class="r val">{{ getPropertyName(metric) }}</th>
        <th></th>
        <th v-if="wide">配信者</th>
        <th>タイトル</th>
        <th v-if="wide" class="date">公開</th>
      </tr>
    </thead>
    <tbody>
      <tr
        v-for="entry in entries"
        :key="entry.row.videoId"
        role="button"
        tabindex="0"
        :aria-current="entry.row.videoId === selectedId ? 'true' : undefined"
        @click="emit('select', entry.row.videoId)"
        @keydown="onRowKeydown($event, entry.row.videoId)"
      >
        <td class="rank">
          <span class="mark" aria-hidden="true"></span>
          {{ withCommas(entry.rank) }}
        </td>
        <td class="val">
          <div class="num">{{ formatProperty(metric, entry.value) }}</div>
          <div class="bar" :style="{ '--bar-w': shareOf(entry.value) }"></div>
        </td>
        <td class="pic">
          <VideoThumbnail :video-id="entry.row.videoId" size="mq" />
        </td>
        <td v-if="wide" class="who-col">
          <span class="who" :style="whoStyle(entry.row.channelId)">
            <span class="dot-ch" aria-hidden="true"></span>
            <span class="nm">{{ channelsById.get(entry.row.channelId)?.name ?? entry.row.channelId }}</span>
          </span>
        </td>
        <td class="name">
          <span v-if="!wide" class="who" :style="whoStyle(entry.row.channelId)">
            <span class="dot-ch" aria-hidden="true"></span>
            <span class="nm">{{ channelsById.get(entry.row.channelId)?.name ?? entry.row.channelId }}</span>
          </span>
          <span class="ttl" :title="entry.row.title">
            <template v-for="(segment, i) in titleSegments(entry.row.title, tokens)" :key="i">
              <mark v-if="segment.marked">{{ segment.text }}</mark>
              <template v-else>{{ segment.text }}</template>
            </template>
          </span>
        </td>
        <td v-if="wide" class="date">{{ formatDate(new Date(entry.row.publishedAt).getTime()) }}</td>
      </tr>
    </tbody>
  </table>

  <button v-if="remainingCount > 0" type="button" class="more" @click="emit('more')">
    もっと見る（残り {{ withCommas(remainingCount) }} 本）
  </button>

  <button v-if="pinned" type="button" class="pinned" @click="emit('select', selectedId!)">
    <span class="rk">{{ pinned.rank === null ? '選択中 —' : `選択中 ${withCommas(pinned.rank)} 位` }}</span>
    <span class="tx">{{ pinned.title }}{{ pinned.rank === null ? '（この指標では順位が付きません）' : '' }}</span>
  </button>
</template>

<style scoped>
table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  font-size: 12.5px;
}

col.c-rank {
  width: 52px;
}

col.c-val {
  width: 124px;
}

col.c-pic {
  width: 56px;
}

col.c-who {
  width: 124px;
}

col.c-date {
  width: 84px;
}

thead th {
  position: sticky;
  top: 0;
  z-index: 2;
  background: var(--k-surface);
  border-bottom: 1px solid var(--k-line-2);
  padding: 4px 8px;
  font-size: 10.5px;
  letter-spacing: 0.06em;
  font-weight: 600;
  color: var(--k-text-3);
  text-align: left;
  white-space: nowrap;
}

thead th.r {
  text-align: right;
}

thead th.val {
  white-space: normal;
  line-height: 1.25;
}

tbody tr {
  border-bottom: 1px solid var(--k-line);
  cursor: pointer;
}

tbody tr:hover {
  background: var(--k-sunken);
}

tbody tr[aria-current='true'] {
  background: var(--k-accent-soft);
}

tbody td {
  padding: 2px 8px;
  vertical-align: middle;
}

td.rank {
  text-align: right;
  font-variant-numeric: tabular-nums;
  color: var(--k-text-3);
  font-size: 12px;
  position: relative;
}

td.rank .mark {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: transparent;
}

tbody tr[aria-current='true'] td.rank .mark {
  background: var(--k-accent);
}

tbody tr[aria-current='true'] td.rank {
  color: var(--k-text);
  font-weight: 600;
}

td.val {
  text-align: right;
}

td.val .num {
  font-size: 13px;
  line-height: 1.35;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

/* A share-of-the-top bar. The order alone loses the gap between 1st and 2nd;
   the bar keeps it visible. */
td.val .bar {
  height: 3px;
  margin-top: 1px;
  border-radius: 2px;
  background: linear-gradient(to left, var(--k-accent) 0 var(--bar-w, 0%), var(--k-track) var(--bar-w, 0%) 100%);
  opacity: 0.62;
}

tbody tr[aria-current='true'] td.val .bar {
  opacity: 1;
}

td.pic {
  width: 46px;
  height: 26px;
}

td.who-col {
  overflow: hidden;
}

td.date,
th.date {
  text-align: right;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
  color: var(--k-text-3);
  font-size: 11.5px;
}

td.name {
  min-width: 0;
}

.who {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--k-text-3);
  line-height: 1.3;
}

.dot-ch {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex: 0 0 auto;
  background: var(--who-ch, var(--k-line-2));
}

.who .nm {
  color: var(--who-ch, var(--k-text-3));
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ttl {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.35;
}

.ttl mark {
  background: var(--k-accent-soft);
  color: inherit;
  border-radius: 2px;
  padding: 0 1px;
  box-shadow: inset 0 -1px 0 var(--k-accent);
}

.more {
  display: block;
  width: 100%;
  font: inherit;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  padding: 8px;
  border: 0;
  border-top: 1px solid var(--k-line);
  background: var(--k-surface-2);
  color: var(--k-text-2);
  cursor: pointer;
}

.more:hover {
  color: var(--k-accent);
}

.pinned {
  position: sticky;
  bottom: 0;
  z-index: 3;
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  font: inherit;
  font-size: 11.5px;
  text-align: left;
  padding: 5px 8px;
  border: 0;
  border-top: 1px solid var(--k-line-2);
  background: var(--k-accent-soft);
  color: var(--k-text-2);
  cursor: pointer;
}

.pinned .rk {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  color: var(--k-text);
  flex: 0 0 auto;
}

.pinned .tx {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
