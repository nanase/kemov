<script setup lang="ts">
import { computed } from 'vue';

import { relayVideoThumbnailURL } from '@/lib/relay';
import MemberAvatar from '@/parts/MemberAvatar.vue';
import ThumbnailImage from '@/parts/ThumbnailImage.vue';

import { formatDate, formatLength } from '../draw';
import { KIND_LABELS, VIDEO_LABELS, type EventItem } from '../model';
import type { Channel } from '@/type/api';

/**
 * One thing that happened.
 *
 * The five kinds that changed who けもV is or how somebody looks are drawn
 * large, with the picture as a print beside the words (#140); everything else
 * is the same card at a smaller size. Neither of them is dimmed for being old
 * or for being unconfirmed - what is uncertain is said in words.
 */
const { item, members, dark } = defineProps<{
  item: EventItem;
  /** The members this involved, in the order the API sends them. */
  members: readonly Channel[];
  dark: boolean;
}>();

const emit = defineEmits<{ open: [key: string] }>();

const event = computed(() => item.event);
const kindLabel = computed(() => KIND_LABELS[event.value.kind]);
const period = computed(() => (item.endAt === null ? null : `${formatDate(item.at)} 〜 ${formatDate(item.endAt)}`));
const caption = computed(() => {
  if (item.row === null) return kindLabel.value;

  const length =
    item.row.actualEndTime === null || item.row.actualStartTime === null
      ? null
      : (new Date(item.row.actualEndTime).getTime() - new Date(item.row.actualStartTime).getTime()) / 1000;
  const kind = item.row.type === null ? '配信' : VIDEO_LABELS[item.row.type];

  return length === null ? kind : `${kind} ・ ${formatLength(length)}`;
});
const thumbnail = computed(() =>
  event.value.videoId === null ? null : relayVideoThumbnailURL(event.value.videoId, 'mq'),
);
</script>

<template>
  <article class="card" :class="{ large: event.emphasized, future: item.future }">
    <button v-if="event.emphasized" type="button" class="print" @click="emit('open', item.key)">
      <span class="shot">
        <ThumbnailImage v-if="thumbnail" :src="thumbnail" loading="lazy" decoding="async" />
        <span v-else class="stand-in">
          <span class="faces">
            <MemberAvatar
              v-for="member in members"
              :key="member.channelId"
              :src="member.thumbnailUrl"
              :name="member.name"
              :color="member.color.key"
              :size="members.length > 3 ? 34 : 52"
              :dark
            />
            <span v-if="members.length === 0" class="all" aria-hidden="true">V</span>
          </span>
          <span class="kind-on-print">{{ kindLabel }}</span>
        </span>
      </span>
      <span class="print-caption fp-n">
        <span>{{ event.datePrecision === 'day' ? formatDate(item.at) : event.startDate }}</span>
        <span>{{ caption }}</span>
      </span>
    </button>

    <div class="body">
      <div class="tags">
        <span class="fp-tag">{{ kindLabel }}</span>
        <span v-if="item.future" class="fp-tag is-future">予定</span>
        <span v-if="event.sourcePending" class="fp-tag is-pending">出典の確認待ち</span>
        <span v-if="event.place" class="place">
          <svg width="10" height="12" viewBox="0 0 10 12" aria-hidden="true">
            <path
              d="M5 11.5S1 7.3 1 4.6a4 4 0 0 1 8 0C9 7.3 5 11.5 5 11.5Z"
              fill="none"
              stroke="currentColor"
              stroke-width="1.4"
            />
            <circle cx="5" cy="4.6" r="1.4" fill="currentColor" />
          </svg>
          <span>{{ event.place }}</span>
        </span>
      </div>

      <button type="button" class="title" @click="emit('open', item.key)">{{ event.title }}</button>

      <p v-if="period" class="period fp-n">
        <span>{{ period }}</span>
        <b>{{ item.days }} 日間</b>
      </p>

      <div class="members">
        <span v-if="members.length === 0" class="member">
          <span class="all small" aria-hidden="true">V</span>
          けもV 全体
        </span>
        <span v-for="member in members" v-else :key="member.channelId" class="member">
          <MemberAvatar
            :src="member.thumbnailUrl"
            :name="member.name"
            :color="member.color.key"
            :size="event.emphasized ? 28 : 22"
            :dark
          />
          {{ member.name }}
        </span>
      </div>

      <p v-if="event.supplement" class="supplement">{{ event.supplement }}</p>
    </div>

    <button
      v-if="!event.emphasized && thumbnail"
      type="button"
      class="side-shot"
      :aria-label="`${event.title}を開く`"
      @click="emit('open', item.key)"
    >
      <ThumbnailImage :src="thumbnail" loading="lazy" decoding="async" />
    </button>
  </article>
</template>

<style scoped>
.card {
  display: grid;
  position: relative;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 4px 16px;
  min-width: 0;
  padding: 10px 14px 12px;
  border: 1px solid var(--k-line);
  border-radius: 8px;
  background: var(--k-surface);
  box-shadow: var(--k-shadow);
}

/* What is still to come sits on the sunken ground, as the road ahead does. */
.card.future {
  background: var(--k-sunken);
}

.card.large {
  grid-template-columns: minmax(0, 330px) minmax(0, 1fr);
  gap: 16px 20px;
  padding: 14px 16px 16px;
}

.body {
  min-width: 0;
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 8px;
  align-items: center;
  min-width: 0;
  color: var(--k-text-3);
  font-size: 11.5px;
  line-height: 1.5;
}

.place {
  display: inline-flex;
  gap: 3px;
  align-items: flex-start;
  min-width: 0;
  overflow-wrap: anywhere;
}

.place svg {
  flex: none;
  margin-top: 3px;
}

.title {
  display: block;
  margin: 4px 0 2px;
  padding: 0;
  border: 0;
  background: none;
  color: var(--k-text);
  font: inherit;
  font-size: 15px;
  font-weight: 700;
  line-height: 1.45;
  text-align: left;
  overflow-wrap: anywhere;
  cursor: pointer;
}

.card.large .title {
  margin: 6px 0 4px;
  font-size: 19px;
}

.title:hover {
  text-decoration: underline;
  text-decoration-color: var(--k-line-2);
  text-underline-offset: 3px;
}

.period {
  display: flex;
  flex-wrap: wrap;
  gap: 0 8px;
  align-items: baseline;
  margin: 0;
  color: var(--k-text-2);
  font-size: 12px;
}

.period b {
  color: var(--k-accent);
  font-weight: 600;
}

.members {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 10px;
  margin-top: 6px;
}

.member {
  display: inline-flex;
  gap: 5px;
  align-items: center;
  color: var(--k-text-2);
  font-size: 12px;
  white-space: nowrap;
}

.card.large .member {
  font-size: 12.5px;
}

/* けもV as a whole, which is what an event with nobody named belongs to. */
.all {
  display: inline-grid;
  flex: none;
  place-items: center;
  width: 28px;
  height: 28px;
  border: 2px solid var(--k-text-3);
  border-radius: 50%;
  background: var(--k-surface);
  color: var(--k-text-2);
  font-size: 12px;
  font-style: normal;
  font-weight: 700;
}

.all.small {
  width: 22px;
  height: 22px;
  font-size: 10px;
}

.supplement {
  margin: 6px 0 0;
  color: var(--k-text-2);
  font-size: 12.5px;
  line-height: 1.65;
  overflow-wrap: anywhere;
  text-wrap: pretty;
}

.card.large .supplement {
  font-size: 13px;
}

/* The picture of a day that changed things, pinned like a print. */
.print {
  display: block;
  align-self: start;
  width: 100%;
  padding: 7px 7px 0;
  border: 0;
  border-radius: 3px;
  background: var(--k-surface-2);
  box-shadow: var(--k-shadow);
  text-align: left;
  transform: rotate(-0.6deg);
  transition: transform 0.15s ease;
  cursor: pointer;
}

.print:hover {
  transform: rotate(0) translateY(-2px);
}

.shot,
.side-shot img,
.side-shot .thumb-fallback {
  display: block;
  position: relative;
  width: 100%;
  border-radius: 2px;
  background: var(--k-track);
  aspect-ratio: 16 / 9;
  object-fit: cover;
  overflow: hidden;
}

.shot img,
.shot .thumb-fallback {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* Only the fallback takes its box's corners: `.shot img` also reaches the
   member faces in `.stand-in`, whose own circle a radius here would square. */
.shot .thumb-fallback {
  border-radius: inherit;
}

.stand-in {
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  border: 1px dashed var(--k-line-2);
  border-radius: 2px;
  background: var(--k-surface);
}

.faces {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
  justify-content: center;
}

.kind-on-print {
  color: var(--k-text-2);
  font-size: 17px;
  font-weight: 700;
  letter-spacing: 0.06em;
}

.print-caption {
  display: flex;
  gap: 6px;
  align-items: center;
  justify-content: space-between;
  height: 26px;
  overflow: hidden;
  color: var(--k-text-3);
  font-size: 11px;
  white-space: nowrap;
}

.print-caption span {
  overflow: hidden;
  text-overflow: ellipsis;
}

.side-shot {
  grid-row: 1 / span 2;
  grid-column: 2;
  align-self: start;
  width: 168px;
  margin-top: 2px;
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;
}

.side-shot img,
.side-shot .thumb-fallback {
  border: 1px solid var(--k-line);
  border-radius: 6px;
}

@container (max-width: 620px) {
  .card,
  .card.large {
    grid-template-columns: minmax(0, 1fr);
    padding: 9px 11px 11px;
  }

  .card.large .title {
    font-size: 16.5px;
  }

  .title {
    font-size: 14.5px;
  }

  .side-shot {
    grid-row: auto;
    grid-column: auto;
    width: min(100%, 200px);
    margin-top: 6px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .print {
    transition: none;
  }
}
</style>
