<script setup lang="ts">
import { computed, useTemplateRef } from 'vue';

import { useDragScroll } from '@/shell/useDragScroll';

import { memberColor } from '../draw';
import type { Announcement, Subject } from '../model';

/**
 * What is on air and what starts later today.
 *
 * A busy day sends the row sideways rather than down a line at a time: the
 * list underneath would otherwise move further down the page the more there
 * is to watch.
 */
const { announcements, members, dark } = defineProps<{
  announcements: readonly Announcement[];
  members: ReadonlyMap<string, Subject>;
  dark: boolean;
}>();

const emit = defineEmits<{ select: [id: string] }>();

const band = useTemplateRef<HTMLElement>('band');
// The same drag the navigation band uses, and its two edge flags say whether
// the row continues past either end - which is what the arrows are for.
const { dragging, fadeLeft, fadeRight } = useDragScroll(band);

const rows = computed(() =>
  announcements.flatMap((announcement) => {
    const member = members.get(announcement.channelId);

    return member === undefined ? [] : [{ announcement, member }];
  }),
);

function roll(direction: number) {
  const element = band.value;

  if (element === null) return;

  element.scrollBy({ left: direction * Math.max(200, element.clientWidth * 0.8) });
}

function style(member: Subject) {
  return member.color === null ? undefined : { '--member-color': memberColor(member.color, dark) };
}
</script>

<template>
  <div v-if="rows.length > 0" class="band">
    <ul ref="band" class="band-list" :class="{ dragging }">
      <li v-for="{ announcement, member } in rows" :key="announcement.videoId">
        <button type="button" class="item" :style="style(member)" @click="emit('select', member.id)">
          <span class="mark" :data-kind="announcement.kind">
            {{
              announcement.kind === 'live'
                ? 'LIVE'
                : announcement.kind === 'soon'
                  ? 'まもなく開始'
                  : `${announcement.time} 開始予定`
            }}
          </span>
          <img
            v-if="member.avatar"
            class="avatar"
            :src="member.avatar"
            alt=""
            width="18"
            height="18"
            decoding="async"
          />
          <span v-else class="avatar" aria-hidden="true"></span>
          <span class="name">{{ member.name }}</span>
          <span class="title">{{ announcement.title }}</span>
        </button>
      </li>
    </ul>
    <button v-if="fadeLeft" type="button" class="roll left" aria-label="前の配信へ送る" @click="roll(-1)">←</button>
    <button v-if="fadeRight" type="button" class="roll right" aria-label="次の配信へ送る" @click="roll(1)">→</button>
  </div>
</template>

<style scoped>
.band {
  position: relative;
  min-width: 0;
}

.band-list {
  display: flex;
  margin: 0;
  padding: 0;
  overflow: auto hidden;
  border: 1px solid var(--k-line);
  border-radius: 8px;
  background: var(--k-surface);
  box-shadow: var(--k-shadow);
  list-style: none;
  scrollbar-width: none;
  scroll-snap-type: x proximity;
  cursor: grab;
  user-select: none;
}

.band-list::-webkit-scrollbar {
  display: none;
}

.band-list.dragging {
  cursor: grabbing;
  scroll-snap-type: none;
}

.band-list > li {
  flex: 0 0 clamp(240px, 30%, 320px);
  min-width: 0;
  scroll-snap-align: start;
}

.item {
  display: grid;
  grid-template-columns: auto 18px minmax(0, 1fr);
  align-items: center;
  gap: 7px;
  width: 100%;
  height: 100%;
  padding: 6px 9px;
  border: 0;
  border-right: 1px solid var(--k-line);
  border-bottom: 1px solid var(--k-line);
  background: var(--k-surface);
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.item:hover {
  background: var(--k-surface-2);
}

.title {
  grid-column: 1 / -1;
  overflow: hidden;
  color: var(--k-text-3);
  font-size: 11.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.name {
  overflow: hidden;
  font-size: 12px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.avatar {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--member-color, var(--k-track));
}

.mark {
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 10.5px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.04em;
  white-space: nowrap;
}

.mark[data-kind='live'] {
  background: var(--k-live);
  color: #fff;
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

.roll {
  display: grid;
  position: absolute;
  top: 50%;
  z-index: 2;
  place-items: center;
  width: 30px;
  height: 30px;
  border: 1px solid var(--k-line);
  border-radius: 50%;
  background: var(--k-surface);
  color: var(--k-text-2);
  font: inherit;
  font-size: 13px;
  line-height: 1;
  transform: translateY(-50%);
  cursor: pointer;
}

.roll:hover {
  border-color: var(--k-accent);
  color: var(--k-accent);
}

.roll.left {
  left: 6px;
}

.roll.right {
  right: 6px;
}

@container (max-width: 620px) {
  .band-list > li {
    flex-basis: 86%;
  }
}
</style>
