<script setup lang="ts">
import { getThumbnailURL } from '@/lib/youtube';

import { DASH, formatCount, formatDuration, memberColor } from '../draw';
import type { Subject } from '../model';

/**
 * The last few streams, and the ones that have not started yet.
 *
 * Every row is the same shape whether or not a thumbnail exists, so the list
 * does not jump as the images arrive. A stream with none gets the member's
 * face on a panel the same size.
 */
export interface StreamRow {
  key: string;
  title: string;
  /** Only for one that has not started: the time it is due, and which of the two kinds it is. */
  upcoming?: { kind: 'live' | 'soon' | 'today'; time: string };
  videoId: string | null;
  startedAt: string;
  durationSeconds: number | null;
  viewCount: number | null;
  chatMessageCount: number | null;
  owner: Subject;
}

const { rows, showOwner, dark } = defineProps<{
  rows: readonly StreamRow[];
  /** The sum's list says whose stream each one is; a member's own does not. */
  showOwner: boolean;
  dark: boolean;
}>();

function thumbnail(videoId: string | null): string | null {
  return videoId === null ? null : getThumbnailURL(videoId, { size: 'mq' });
}

function ownerStyle(owner: Subject) {
  return owner.color === null ? undefined : { '--member-color': memberColor(owner.color, dark) };
}
</script>

<template>
  <ul class="streams">
    <li v-for="row in rows" :key="row.key" class="stream">
      <img
        v-if="thumbnail(row.videoId)"
        class="shot"
        :src="thumbnail(row.videoId)!"
        alt=""
        width="96"
        height="54"
        loading="lazy"
        decoding="async"
      />
      <span v-else class="shot none">
        <img v-if="row.owner.avatar" :src="row.owner.avatar" alt="" width="28" height="28" decoding="async" />
      </span>
      <div class="body">
        <a v-if="row.videoId" class="title" :href="`/videos/${row.videoId}`">{{ row.title }}</a>
        <span v-else class="title">{{ row.title }}</span>
        <span class="meta">
          <span v-if="showOwner" class="owner" :style="ownerStyle(row.owner)">
            <span class="swatch" aria-hidden="true"></span>{{ row.owner.name }}
          </span>
          <template v-if="row.upcoming">
            <span class="mark" :data-kind="row.upcoming.kind">
              {{ row.upcoming.kind === 'soon' ? 'まもなく開始' : `${row.upcoming.time} 開始予定` }}
            </span>
          </template>
          <template v-else>
            <span v-if="row.upcoming === undefined && row.startedAt" class="n">{{ row.startedAt }}</span>
            <span v-if="row.durationSeconds !== null"
              >配信時間 <b class="n">{{ formatDuration(row.durationSeconds) }}</b></span
            >
            <span
              >再生数 <b class="n">{{ formatCount(row.viewCount) }}</b></span
            >
            <span
              >チャット数 <b class="n">{{ formatCount(row.chatMessageCount) }}</b></span
            >
          </template>
        </span>
      </div>
    </li>
    <li v-if="rows.length === 0" class="empty">{{ DASH }}</li>
  </ul>
</template>

<style scoped>
.streams {
  display: grid;
  gap: 1px;
  max-height: 452px;
  margin: 0;
  padding: 0;
  overflow: hidden auto;
  border: 1px solid var(--k-line);
  border-radius: 6px;
  background: var(--k-line);
  list-style: none;
}

.stream {
  display: grid;
  grid-template-columns: 96px minmax(0, 1fr);
  align-items: start;
  gap: 10px;
  padding: 8px 10px;
  background: var(--k-surface);
}

.empty {
  padding: 14px 10px;
  background: var(--k-surface);
  color: var(--k-text-3);
  text-align: center;
}

.shot {
  width: 96px;
  aspect-ratio: 16 / 9;
  border-radius: 3px;
  background: var(--k-track);
  object-fit: cover;
}

.shot.none {
  display: grid;
  place-items: center;
}

.shot.none img {
  width: 28px;
  height: 28px;
  border-radius: 50%;
}

.body {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.title {
  display: -webkit-box;
  overflow: hidden;
  color: inherit;
  font-size: 12px;
  line-height: 1.4;
  text-decoration: none;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

a.title:hover {
  color: var(--k-accent);
  text-decoration: underline;
}

.meta {
  display: flex;
  flex-wrap: wrap;
  gap: 3px 10px;
  color: var(--k-text-3);
  font-size: 11px;
}

.meta b {
  color: var(--k-text-2);
  font-weight: 500;
}

.owner {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--k-text-2);
}

.swatch {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--member-color, var(--k-accent));
}

.mark {
  padding: 0 5px;
  border-radius: 3px;
  font-size: 10px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
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

@container (max-width: 560px) {
  .stream {
    grid-template-columns: 76px minmax(0, 1fr);
    gap: 8px;
  }

  .shot {
    width: 76px;
  }
}
</style>
