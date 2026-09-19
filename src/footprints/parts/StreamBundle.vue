<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';

import MemberAvatar from '@/parts/MemberAvatar.vue';
import { formatCount } from '@/lib/numberFormat';

import { formatDate, formatTime, openMs } from '../draw';
import { isKeyStream, jstDay, rowAt, VIDEO_LABELS, type BundleItem } from '../model';
import type { Channel } from '@/type/api';

/**
 * A run of streams and videos, as one row of the road.
 *
 * Three or fewer are open from the start; a longer run is folded, and shows
 * the occasions in it - a debut, an anniversary - with the rest counted
 * rather than listed (#140). Opening it lists every one, grouped by day.
 */
const { item, channels, open, dark } = defineProps<{
  item: BundleItem;
  /** Every member, for the names and pictures the rows carry. */
  channels: ReadonlyMap<string, Channel>;
  open: boolean;
  dark: boolean;
}>();

const emit = defineEmits<{ toggle: [key: string]; open: [key: string] }>();

/** How many titles a folded run names before it starts counting. */
const NAMED = 4;

const count = computed(() => item.rows.length);
const foldable = computed(() => count.value > 3);
const shown = computed(() => open || !foldable.value);

const kinds = computed(() => [...new Set(item.rows.map((row) => row.type))]);
const label = computed(() =>
  kinds.value.length === 1 && kinds.value[0] !== null ? VIDEO_LABELS[kinds.value[0]] : '配信・動画',
);

const faces = computed(() =>
  [...new Set(item.rows.map((row) => row.channelId))].flatMap((id) => {
    const channel = channels.get(id);

    return channel === undefined ? [] : [channel];
  }),
);

/** The occasions inside a folded run, which is what it names instead of all. */
const occasions = computed(() => item.rows.filter((row) => isKeyStream(row.title)));
const named = computed(() => occasions.value.slice(0, NAMED));

/** Every stream in the run, grouped by the day it began on. */
const days = computed(() => {
  const groups: { day: string; rows: typeof item.rows }[] = [];

  item.rows.forEach((row) => {
    const day = jstDay(rowAt(row));
    const last = groups[groups.length - 1];

    if (last !== undefined && last.day === day) last.rows.push(row);
    else groups.push({ day, rows: [row] });
  });

  return groups;
});

function thumbnail(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
}

function nameOf(channelId: string): string {
  return channels.get(channelId)?.name ?? '';
}

/**
 * Opening and closing, shown as the box growing rather than as a jump.
 *
 * The head does not stick while the height is moving: held inside a box that
 * is still changing size it bounces, which reads as the page fighting the
 * reader. Somebody who has asked for less movement gets the two states and
 * nothing between them.
 */
const moving = ref(false);
let timer: ReturnType<typeof setTimeout> | undefined;

function reduced(): boolean {
  return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

function animate(element: Element, from: number, to: number, done: () => void) {
  const box = element as HTMLElement;

  if (reduced()) return done();

  const ms = openMs(Math.max(from, to));

  moving.value = true;
  box.style.overflow = 'hidden';
  box.style.height = `${from}px`;
  box.getBoundingClientRect();
  box.style.transition = `height ${Math.round(ms)}ms ease`;
  box.style.height = `${to}px`;

  clearTimeout(timer);
  timer = setTimeout(done, ms);
}

function grow(element: Element, done: () => void) {
  animate(element, 0, (element as HTMLElement).scrollHeight, done);
}

function shrink(element: Element, done: () => void) {
  animate(element, (element as HTMLElement).scrollHeight, 0, done);
}

function settle(element: Element) {
  const box = element as HTMLElement;

  clearTimeout(timer);
  moving.value = false;
  box.style.height = '';
  box.style.overflow = '';
  box.style.transition = '';
}

onBeforeUnmount(() => clearTimeout(timer));
</script>

<template>
  <article class="bundle" :class="{ foldable }" @click="foldable && emit('toggle', item.key)">
    <div class="head" :class="{ open: shown && !moving }">
      <span class="fp-tag">{{ label }}</span>
      <span class="count fp-n"
        ><b>{{ formatCount(count) }}</b> 本</span
      >
      <span class="faces">
        <MemberAvatar
          v-for="face in faces"
          :key="face.channelId"
          :src="face.thumbnailUrl"
          :name="face.name"
          :color="face.color.key"
          :size="18"
          :dark
        />
      </span>
      <button
        v-if="foldable"
        type="button"
        class="fold"
        :aria-expanded="open"
        :aria-label="open ? '閉じる' : 'すべて見る'"
        :title="open ? '閉じる' : 'すべて見る'"
        @click.stop="emit('toggle', item.key)"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <path
            d="M3 4.5 6 7.5 9 4.5"
            fill="none"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>
    </div>

    <div v-if="!shown && named.length > 0" class="occasions">
      <button
        v-for="row in named"
        :key="row.videoId"
        type="button"
        class="occasion"
        @click.stop="emit('open', `v:${row.videoId}`)"
      >
        <img class="pic" :src="thumbnail(row.videoId)" alt="" loading="lazy" decoding="async" />
        <span class="about">
          <small class="fp-n">{{ formatDate(rowAt(row)).slice(5, 10) }} {{ formatTime(rowAt(row)) }}</small>
          <span class="occasion-title">{{ row.title }}</span>
        </span>
      </button>
      <span v-if="occasions.length > named.length" class="more fp-n">
        ほか {{ formatCount(occasions.length - named.length) }} 本
      </span>
    </div>

    <Transition @enter="grow" @after-enter="settle" @enter-cancelled="settle" @leave="shrink" @after-leave="settle">
      <div v-if="shown" class="all">
        <template v-for="group in days" :key="group.day">
          <h4 v-if="days.length > 1" class="day fp-n">{{ formatDate(rowAt(group.rows[0]!)) }}</h4>
          <ul class="rows">
            <li v-for="row in group.rows" :key="row.videoId">
              <button type="button" class="row" @click.stop="emit('open', `v:${row.videoId}`)">
                <span class="at fp-n">{{ formatTime(rowAt(row)) }}</span>
                <img class="pic" :src="thumbnail(row.videoId)" alt="" loading="lazy" decoding="async" />
                <span class="about">
                  <span class="meta fp-n">
                    <span class="fp-tag">{{ row.type === null ? '配信' : VIDEO_LABELS[row.type] }}</span>
                    <span class="who">{{ nameOf(row.channelId) }}</span>
                  </span>
                  <span class="row-title">{{ row.title }}</span>
                </span>
              </button>
            </li>
          </ul>
        </template>
      </div>
    </Transition>
  </article>
</template>

<style scoped>
.bundle {
  align-self: start;
  min-width: 0;
  padding: 8px 10px;
  border: 1px solid var(--k-line);
  border-radius: 8px;
  background: var(--k-sunken);
}

.bundle.foldable {
  cursor: pointer;
}

.head {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 10px;
  align-items: center;
  min-width: 0;
  min-height: 28px;
}

/* While the run is open its head stays on screen. A run can be forty streams
   long, and without this a reader scrolling through them has nothing left
   saying whose run this is or how to close it again (#140). */
.head.open {
  position: sticky;
  z-index: 2;
  top: calc(var(--shell-nav-height, 44px) + 6px);
  margin: -8px -10px 0;
  padding: 8px 10px 0;
  border-radius: 8px 8px 0 0;
  background: var(--k-sunken);
  box-shadow: 0 1px 0 var(--k-line);
}

.count b {
  font-size: 15px;
  font-weight: 700;
}

.faces {
  display: inline-flex;
  align-items: center;
}

.faces :deep(.avatar + .avatar) {
  margin-left: -5px;
}

.fold {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  margin-left: auto;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: none;
  color: var(--k-text-3);
  cursor: pointer;
}

.fold:hover {
  color: var(--k-text);
}

.fold svg {
  transition: transform 0.15s ease;
}

.fold[aria-expanded='true'] svg {
  transform: rotate(180deg);
}

.occasions {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 6px 10px;
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px dotted var(--k-line-2);
}

.occasion {
  display: grid;
  grid-template-columns: 76px minmax(0, 1fr);
  gap: 8px;
  align-items: center;
  padding: 3px;
  border: 0;
  border-radius: 4px;
  background: none;
  color: var(--k-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.occasion:hover,
.row:hover {
  background: var(--k-surface);
}

.pic {
  display: block;
  width: 100%;
  border: 1px solid var(--k-line);
  border-radius: 3px;
  background: var(--k-track);
  aspect-ratio: 16 / 9;
  object-fit: cover;
}

.about {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.occasion small {
  display: flex;
  gap: 4px;
  align-items: center;
  color: var(--k-text-3);
  font-size: 11px;
}

.occasion-title,
.row-title {
  display: -webkit-box;
  overflow: hidden;
  font-size: 12px;
  line-height: 1.4;
  overflow-wrap: anywhere;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.more {
  align-self: center;
  color: var(--k-text-3);
  font-size: 11.5px;
}

.all {
  margin-top: 6px;
}

.day {
  margin: 8px 0 0;
  color: var(--k-text-3);
  font-size: 11.5px;
  font-weight: 600;
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
  grid-template-columns: 44px 76px minmax(0, 1fr);
  gap: 10px;
  align-items: start;
  width: 100%;
  padding: 5px 2px;
  border: 0;
  background: none;
  color: var(--k-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.at {
  padding-top: 1px;
  color: var(--k-text-2);
  font-size: 12px;
}

.meta {
  display: flex;
  flex-wrap: wrap;
  gap: 3px 6px;
  align-items: center;
  color: var(--k-text-3);
  font-size: 11.5px;
}

.meta .fp-tag {
  height: 17px;
  padding: 0 5px;
  font-size: 10.5px;
}

.row-title {
  font-size: 12.5px;
  line-height: 1.5;
}

@container (max-width: 620px) {
  .occasions {
    grid-template-columns: minmax(0, 1fr);
  }

  .row {
    grid-template-columns: 36px 60px minmax(0, 1fr);
    gap: 6px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .fold svg {
    transition: none;
  }
}
</style>
