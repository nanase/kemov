<script setup lang="ts">
import { computed } from 'vue';

import MemberAvatar from '@/parts/MemberAvatar.vue';

import { formatDate, formatTime } from '../draw';
import { daysBetween, type AsideItem } from '../model';
import type { Channel } from '@/type/api';

/**
 * One of the two short lists beside the timeline.
 *
 * Both read the same way - a date, what it is, whose it is, a title - and
 * differ only in which direction they look: forward to what is coming, back
 * to the same week in earlier years. Keeping them one component keeps the two
 * from drifting apart, since a reader sees them stacked in one panel.
 */
const { items, channels, heading, mode, now } = defineProps<{
  items: readonly AsideItem[];
  channels: readonly Channel[];
  heading: string;
  mode: 'soon' | 'ago';
  now: number;
  dark: boolean;
  /** What the list says when it has nothing, which is never nothing at all. */
  empty: string;
}>();

const emit = defineEmits<{ open: [key: string] }>();

const byId = computed(() => new Map(channels.map((channel) => [channel.channelId, channel])));

function faces(item: AsideItem): Channel[] {
  return item.channelIds.flatMap((id) => {
    const channel = byId.value.get(id);

    return channel === undefined ? [] : [channel];
  });
}

/** `あと 12 日`, or `今日` on the day itself. */
function wait(item: AsideItem): string {
  const left = daysBetween(now, item.at);

  return left <= 0 ? '今日' : `あと ${left} 日`;
}

function thumbnail(item: AsideItem): string | null {
  return item.row === null ? null : `https://i.ytimg.com/vi/${item.row.videoId}/mqdefault.jpg`;
}
</script>

<template>
  <section class="aside-list">
    <h2 class="head">{{ heading }}</h2>

    <p v-if="items.length === 0" class="empty">{{ empty }}</p>
    <ul v-else class="rows">
      <li v-for="item in items" :key="`${item.key ?? ''}:${item.at}:${item.title}`">
        <component
          :is="item.key === null ? 'div' : 'button'"
          class="row"
          :type="item.key === null ? undefined : 'button'"
          @click="item.key === null ? undefined : emit('open', item.key)"
        >
          <span class="body">
            <span class="when fp-n">
              <template v-if="mode === 'soon'">
                {{ formatDate(item.at) }}<template v-if="item.timed"> {{ formatTime(item.at) }}</template>
                <b class="left">{{ wait(item) }}</b>
              </template>
              <template v-else>
                <b class="left">{{ item.yearsAgo }} 年前</b>
                {{ formatDate(item.at) }}
              </template>
            </span>

            <span v-if="mode === 'soon'" class="who">
              <span class="fp-tag" :class="{ 'is-future': item.planned }">{{ item.label }}</span>
              <span class="faces">
                <MemberAvatar
                  v-for="face in faces(item)"
                  :key="face.channelId"
                  :src="face.thumbnailUrl"
                  :name="face.name"
                  :color="face.color.key"
                  :size="18"
                  :dark
                />
                <span v-if="faces(item).length === 0" class="all" aria-label="けもV 全体">全</span>
              </span>
            </span>

            <span class="title">{{ item.title }}</span>
          </span>

          <span v-if="thumbnail(item)" class="thumb">
            <img :src="thumbnail(item)!" alt="" loading="lazy" decoding="async" />
          </span>
        </component>
      </li>
    </ul>

    <slot name="foot" />
  </section>
</template>

<style scoped>
.head {
  display: flex;
  gap: 8px;
  align-items: baseline;
  justify-content: space-between;
  margin: 0 0 4px;
  color: var(--k-text-2);
  font-size: 12.5px;
  font-weight: 700;
}

.rows {
  margin: 0;
  padding: 0;
  list-style: none;
}

.rows li + li {
  border-top: 1px dotted var(--k-line-2);
}

.row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  width: 100%;
  padding: 7px 0;
  border: 0;
  background: none;
  color: var(--k-text);
  font: inherit;
  text-align: left;
}

button.row {
  cursor: pointer;
}

button.row:hover .title {
  text-decoration: underline;
}

.body {
  min-width: 0;
}

.when,
.who {
  display: flex;
  flex-wrap: wrap;
  gap: 2px 6px;
  align-items: center;
  color: var(--k-text-3);
  font-size: 11.5px;
}

/* How long until, or how long since: the one number the row is read for. */
.left {
  color: var(--k-accent);
  font-weight: 700;
}

.faces {
  display: inline-flex;
  gap: 2px;
}

/* Nobody named means けもV as a whole, which is a mark rather than a face. */
.all {
  display: inline-grid;
  place-items: center;
  width: 18px;
  height: 18px;
  border: 2px solid var(--k-text-3);
  border-radius: 50%;
  background: var(--k-surface);
  color: var(--k-text-2);
  font-size: 8px;
  font-weight: 700;
}

.title {
  display: block;
  margin-top: 2px;
  font-size: 12.5px;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.thumb {
  width: 64px;
}

.thumb img {
  display: block;
  width: 100%;
  border-radius: 4px;
  aspect-ratio: 16 / 9;
  object-fit: cover;
  background: var(--k-track);
}

.empty {
  margin: 4px 0 0;
  color: var(--k-text-3);
  font-size: 12px;
}
</style>
