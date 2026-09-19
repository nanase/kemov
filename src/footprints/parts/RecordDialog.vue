<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, useTemplateRef } from 'vue';

import MemberAvatar from '@/parts/MemberAvatar.vue';

import { formatDate, formatLength, formatSince, formatTime, hostOf } from '../draw';
import { jstDay, rowAt, KIND_LABELS, VIDEO_LABELS, type EventItem } from '../model';
import { useDialogFocus } from '../useDialogFocus';
import type { VideoTableRow } from '@/lib/ranking';
import type { Channel } from '@/type/api';

/**
 * One record, opened on its own.
 *
 * The same dialog for a day that happened and for a stream, because a reader
 * pressing a row does not sort them into two kinds first. What differs is
 * what there is to say: an event carries a place and its sources, a stream
 * carries how long it ran and a way to watch it.
 *
 * The record before and after are always offered, because a page about a road
 * is read by walking it rather than by returning to a list each time.
 */
const { open, events, rows, channels, sequence, now, dark } = defineProps<{
  /** `e:<event id>` or `v:<video id>`. */
  open: string;
  events: readonly EventItem[];
  rows: readonly VideoTableRow[];
  channels: readonly Channel[];
  /** Every openable record in the order the timeline shows them. */
  sequence: readonly string[];
  now: number;
  dark: boolean;
}>();

const emit = defineEmits<{ close: []; open: [key: string]; show: [key: string] }>();

const card = useTemplateRef<HTMLDivElement>('card');
const byId = computed(() => new Map(channels.map((channel) => [channel.channelId, channel])));
const rowById = computed(() => new Map(rows.map((row) => [row.videoId, row])));

const item = computed(() => events.find((entry) => entry.key === open) ?? null);
const row = computed(() => (open.startsWith('v:') ? (rowById.value.get(open.slice(2)) ?? null) : null));

/** Whose record this is. An event with nobody named is けもV as a whole. */
const faces = computed(() => {
  const ids = item.value === null ? (row.value === null ? [] : [row.value.channelId]) : item.value.event.channelIds;

  return ids.flatMap((id) => {
    const channel = byId.value.get(id);

    return channel === undefined ? [] : [channel];
  });
});

const at = computed(() => (item.value === null ? (row.value === null ? now : rowAt(row.value)) : item.value.at));

/** The kind and the state, which the header carries above the title. */
const kinds = computed(() => {
  if (item.value !== null) {
    return {
      kind: KIND_LABELS[item.value.event.kind],
      what: 'できごと',
      future: item.value.future,
    };
  }

  if (row.value === null) return null;

  return {
    kind: row.value.type === null ? '配信' : VIDEO_LABELS[row.value.type],
    what: '',
    future: rowAt(row.value) > now,
  };
});

/** When it was, written to whatever precision is known. */
const when = computed(() => {
  if (item.value !== null) {
    const event = item.value.event;

    if (event.datePrecision !== 'day')
      return `${event.startDate}（日付は${event.datePrecision === 'month' ? '月' : '年'}まで）`;

    const head = formatDate(item.value.at) + (item.value.timed ? ` ${formatTime(item.value.at)}` : '');

    return item.value.endAt === null ? head : `${head} 〜 ${formatDate(item.value.endAt)}`;
  }

  if (row.value === null) return '';

  const start = rowAt(row.value);
  const end = row.value.actualEndTime === null ? null : new Date(row.value.actualEndTime).getTime();
  const head = `${formatDate(start)} ${formatTime(start)}`;

  if (end === null) return head;

  const sameDay = jstDay(start) === jstDay(end);

  const length = row.value.durationSeconds === null ? '' : `（${formatLength(row.value.durationSeconds)}）`;

  return `${head} 〜 ${sameDay ? '' : `${formatDate(end)} `}${formatTime(end)}${length}`;
});

const title = computed(() => item.value?.event.title ?? row.value?.title ?? '');
const place = computed(() => {
  if (item.value !== null) return item.value.event.place;

  const channel = row.value === null ? undefined : byId.value.get(row.value.channelId);

  return channel === undefined ? null : `YouTube（${channel.name}チャンネル）`;
});

/** The stream an event was, where the archive has it and the event is not it. */
const linked = computed(() => (item.value === null ? null : item.value.row));

const thumbnail = computed(() => {
  const video = row.value ?? linked.value;

  return video === null ? null : `https://i.ytimg.com/vi/${video.videoId}/mqdefault.jpg`;
});

/** Everything else recorded on the same day, which is how a day is read. */
const sameDay = computed(() => {
  const day = jstDay(at.value);
  const claimed = new Set(events.flatMap((entry) => (entry.row === null ? [] : [entry.row.videoId])));
  const found = [
    ...events
      .filter((entry) => entry.event.datePrecision === 'day' && jstDay(entry.at) === day)
      .map((entry) => ({
        key: entry.key,
        at: entry.at,
        caption: `${entry.timed ? `${formatTime(entry.at)} ` : ''}${entry.event.title}`,
        videoId: entry.row?.videoId ?? null,
        kind: KIND_LABELS[entry.event.kind],
      })),
    ...rows
      .filter((entry) => !claimed.has(entry.videoId) && jstDay(rowAt(entry)) === day)
      .map((entry) => ({
        key: `v:${entry.videoId}`,
        at: rowAt(entry),
        caption: `${formatTime(rowAt(entry))} ${entry.title}`,
        videoId: entry.videoId,
        kind: entry.type === null ? '配信' : VIDEO_LABELS[entry.type],
      })),
  ].sort((a, b) => a.at - b.at);

  return found.length > 1 ? found : [];
});

/** The record before and after this one, in the order the timeline shows. */
const steps = computed(() => {
  const at = sequence.indexOf(open);

  return {
    previous: at > 0 ? (sequence[at - 1] ?? null) : null,
    next: at >= 0 && at < sequence.length - 1 ? (sequence[at + 1] ?? null) : null,
  };
});

function labelOf(key: string | null): string {
  if (key === null) return '';

  const found = events.find((entry) => entry.key === key);

  if (found !== undefined) return `${jstDay(found.at)} ${found.event.title}`;

  const video = rowById.value.get(key.slice(2));

  return video === undefined ? '' : `${jstDay(rowAt(video))} ${video.title}`;
}

function watchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') return emit('close');
  if (event.key === 'ArrowLeft' && steps.value.previous !== null) emit('open', steps.value.previous);
  if (event.key === 'ArrowRight' && steps.value.next !== null) emit('open', steps.value.next);
}

useDialogFocus(card);

onMounted(() => globalThis.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => globalThis.removeEventListener('keydown', onKeydown));
</script>

<template>
  <div class="scrim" @click.self="emit('close')">
    <div ref="card" class="card" role="dialog" aria-modal="true" aria-labelledby="record-title" tabindex="-1">
      <header class="head">
        <span class="kinds">
          <span v-if="kinds" class="fp-tag">{{ kinds.kind }}</span>
          <span v-if="kinds?.what">{{ kinds.what }}</span>
          <span v-if="kinds?.future" class="fp-tag is-future">予定</span>
        </span>

        <button
          type="button"
          class="icon"
          aria-label="前の記録"
          :disabled="steps.previous === null"
          @click="steps.previous && emit('open', steps.previous)"
        >
          ‹
        </button>
        <button
          type="button"
          class="icon"
          aria-label="次の記録"
          :disabled="steps.next === null"
          @click="steps.next && emit('open', steps.next)"
        >
          ›
        </button>
        <button type="button" class="icon" aria-label="閉じる" @click="emit('close')">✕</button>
      </header>

      <div class="body">
        <div class="picture">
          <div class="frame">
            <img v-if="thumbnail" :src="thumbnail" alt="" loading="lazy" decoding="async" />
            <div v-else class="stand-in">
              <span class="faces">
                <MemberAvatar
                  v-for="face in faces"
                  :key="face.channelId"
                  :src="face.thumbnailUrl"
                  :name="face.name"
                  :color="face.color.key"
                  :size="faces.length > 3 ? 34 : 52"
                  :dark
                />
                <span v-if="faces.length === 0" class="all">V</span>
              </span>
              <span class="stand-in-kind">{{ kinds?.kind }}</span>
            </div>
          </div>
          <span class="caption fp-n">
            <span>{{ jstDay(at) }}</span>
            <span>{{ kinds?.kind }}</span>
          </span>
        </div>

        <div class="text">
          <h2 id="record-title">{{ title }}</h2>

          <dl class="fields">
            <dt>いつ</dt>
            <dd class="fp-n">
              {{ when }}
              <span class="since">{{ formatSince(at, now) }}</span>
              <span v-if="item && item.days > 0" class="since">{{ item.days }} 日間</span>
            </dd>

            <dt>どこで</dt>
            <dd>{{ place ?? '—' }}</dd>

            <dt>だれ</dt>
            <dd>
              <span class="who">
                <span v-for="face in faces" :key="face.channelId">
                  <MemberAvatar :src="face.thumbnailUrl" :name="face.name" :color="face.color.key" :size="20" :dark />
                  {{ face.name }}
                </span>
                <span v-if="faces.length === 0">けもV 全体</span>
              </span>
            </dd>

            <template v-if="item?.event.sourcePending">
              <dt>出典</dt>
              <dd><span class="fp-tag is-pending">出典の確認待ち</span></dd>
            </template>

            <template v-if="item && item.event.sources.length > 0">
              <dt>出典</dt>
              <dd class="sources">
                <a
                  v-for="source in item.event.sources"
                  :key="source.url"
                  :href="source.url"
                  target="_blank"
                  rel="noopener noreferrer"
                  >{{ source.title ?? hostOf(source.url) }}</a
                >
              </dd>
            </template>
          </dl>

          <p v-if="item?.event.supplement" class="supplement">{{ item.event.supplement }}</p>

          <a v-if="linked" class="linked" :href="watchUrl(linked.videoId)" target="_blank" rel="noopener noreferrer">
            <img :src="`https://i.ytimg.com/vi/${linked.videoId}/mqdefault.jpg`" alt="" loading="lazy" />
            <span>
              <small class="fp-n"
                >このできごとの{{ linked.type === null ? '配信' : VIDEO_LABELS[linked.type] }} ・
                {{ formatDate(rowAt(linked)) }} {{ formatTime(rowAt(linked)) }}</small
              >
              <b>{{ linked.title }}</b>
            </span>
          </a>

          <div class="acts">
            <button type="button" class="act" @click="emit('show', open)">年表でこの位置を見る</button>
            <a v-if="row" class="act" :href="watchUrl(row.videoId)" target="_blank" rel="noopener noreferrer">
              YouTube で開く
            </a>
          </div>
        </div>

        <div v-if="sameDay.length > 0" class="day">
          <h3 class="fp-n">{{ formatDate(at) }} の記録</h3>
          <div class="strip">
            <button
              v-for="entry in sameDay"
              :key="entry.key"
              type="button"
              :class="{ current: entry.key === open }"
              :title="entry.caption"
              @click="emit('open', entry.key)"
            >
              <span class="shot">
                <img
                  v-if="entry.videoId"
                  :src="`https://i.ytimg.com/vi/${entry.videoId}/mqdefault.jpg`"
                  alt=""
                  loading="lazy"
                />
                <!-- Nothing was filmed, so the kind stands in for a picture
                     rather than leaving an empty box that reads as broken. -->
                <span v-else class="shot-kind">{{ entry.kind }}</span>
              </span>
              <small class="fp-n">{{ entry.caption }}</small>
            </button>
          </div>
        </div>
      </div>

      <footer class="foot">
        <button
          v-if="steps.previous"
          type="button"
          class="step"
          @click="steps.previous && emit('open', steps.previous)"
        >
          ‹ <span>{{ labelOf(steps.previous) }}</span>
        </button>
        <span v-else></span>

        <button v-if="steps.next" type="button" class="step" @click="steps.next && emit('open', steps.next)">
          <span>{{ labelOf(steps.next) }}</span> ›
        </button>
        <span v-else></span>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.scrim {
  display: grid;
  position: fixed;
  z-index: 45;
  inset: 0;
  place-items: start center;
  padding: 48px 12px 12px;
  overflow: auto;
  background: rgb(8 14 13 / 50%);
}

.card {
  display: flex;
  flex-direction: column;
  width: min(920px, 100%);
  max-height: calc(100vh - 60px);
  overflow: auto;
  border: 1px solid var(--k-line);
  border-radius: 8px;
  background: var(--k-surface);
  box-shadow: 0 24px 60px -24px rgb(0 0 0 / 55%);
}

.head {
  display: flex;
  position: sticky;
  z-index: 2;
  top: 0;
  gap: 8px;
  align-items: center;
  padding: 8px 10px 8px 16px;
  border-bottom: 1px solid var(--k-line);
  background: var(--k-surface-2);
}

.kinds {
  display: inline-flex;
  flex: 1;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  min-width: 0;
  color: var(--k-text-2);
  font-size: 12.5px;
  font-weight: 600;
}

.icon {
  display: inline-grid;
  flex: none;
  place-items: center;
  width: 30px;
  height: 30px;
  border: 1px solid var(--k-line-2);
  border-radius: 6px;
  background: var(--k-surface);
  color: var(--k-text-2);
  font: inherit;
  font-size: 15px;
  cursor: pointer;
}

.icon:hover:not(:disabled) {
  background: var(--k-sunken);
}

.icon:disabled {
  opacity: 0.45;
  cursor: default;
}

.body {
  display: grid;
  grid-template-columns: minmax(0, 400px) minmax(0, 1fr);
  gap: 18px 22px;
  padding: 18px 18px 14px;
}

/* A record is a picture pinned to a board, not a card in a feed. */
.picture {
  align-self: start;
  padding: 8px 8px 0;
  border-radius: 2px;
  background: var(--k-surface-2);
  box-shadow:
    0 1px 2px rgb(14 31 28 / 12%),
    0 10px 22px -14px rgb(14 31 28 / 45%);
}

.frame {
  display: grid;
  place-items: center;
  overflow: hidden;
  border-radius: 1px;
  background: var(--k-track);
  aspect-ratio: 16 / 9;
}

.frame img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.stand-in {
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: center;
}

.stand-in-kind {
  color: var(--k-text-2);
  font-size: 17px;
  font-weight: 700;
  letter-spacing: 0.06em;
}

.faces {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  justify-content: center;
}

.all {
  display: inline-grid;
  place-items: center;
  width: 52px;
  height: 52px;
  border: 2px solid var(--k-text-3);
  border-radius: 50%;
  color: var(--k-text-2);
  font-size: 20px;
  font-weight: 700;
}

.caption {
  display: flex;
  gap: 6px;
  align-items: center;
  justify-content: space-between;
  height: 30px;
  overflow: hidden;
  color: var(--k-text-3);
  font-size: 12px;
  white-space: nowrap;
}

.text {
  min-width: 0;
}

.text h2 {
  margin: 0 0 12px;
  font-size: 18px;
  font-weight: 700;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.fields {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: 7px 14px;
  margin: 0;
  font-size: 13px;
}

.fields dt {
  padding-top: 1px;
  color: var(--k-text-3);
  font-size: 12px;
}

.fields dd {
  min-width: 0;
  margin: 0;
  overflow-wrap: anywhere;
}

.since {
  margin-left: 8px;
  color: var(--k-text-3);
  font-size: 12px;
}

.who {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
}

.who > span {
  display: inline-flex;
  gap: 5px;
  align-items: center;
  white-space: nowrap;
}

.sources {
  display: grid;
  gap: 2px;
}

.sources a {
  color: var(--k-accent);
  overflow-wrap: anywhere;
}

.supplement {
  margin: 12px 0 0;
  padding-top: 10px;
  border-top: 1px dotted var(--k-line-2);
  color: var(--k-text-2);
  line-height: 1.75;
  overflow-wrap: anywhere;
}

.linked {
  display: grid;
  grid-template-columns: 96px minmax(0, 1fr);
  gap: 10px;
  align-items: center;
  margin-top: 12px;
  padding: 8px 10px;
  border: 1px solid var(--k-line);
  border-radius: 6px;
  background: var(--k-sunken);
  color: var(--k-text);
  text-decoration: none;
}

.linked:hover {
  border-color: var(--k-accent);
}

.linked img {
  display: block;
  width: 100%;
  border-radius: 3px;
  aspect-ratio: 16 / 9;
  object-fit: cover;
}

.linked small {
  display: block;
  color: var(--k-text-3);
  font-size: 11.5px;
}

.linked b {
  display: -webkit-box;
  overflow: hidden;
  font-size: 12.5px;
  font-weight: 600;
  line-height: 1.5;
  overflow-wrap: anywhere;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.acts {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 14px;
}

.act {
  display: inline-flex;
  align-items: center;
  height: 32px;
  padding: 0 10px;
  border: 1px solid var(--k-line);
  border-radius: 6px;
  background: var(--k-surface);
  color: var(--k-text);
  font: inherit;
  font-size: 12.5px;
  text-decoration: none;
  cursor: pointer;
}

.act:hover {
  border-color: var(--k-line-2);
}

.day {
  grid-column: 1 / -1;
  min-width: 0;
  padding-top: 12px;
  border-top: 1px solid var(--k-line);
}

.day h3 {
  margin: 0 0 8px;
  color: var(--k-text-3);
  font-size: 12.5px;
  font-weight: 600;
}

.strip {
  display: flex;
  gap: 10px;
  padding: 3px 3px 8px;
  overflow-x: auto;
}

.strip button {
  flex: none;
  width: 118px;
  padding: 0;
  border: 0;
  background: none;
  color: var(--k-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.shot {
  display: block;
  overflow: hidden;
  border-radius: 4px;
  background: var(--k-track);
  aspect-ratio: 16 / 9;
}

.shot-kind {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  padding: 0 4px;
  color: var(--k-text-3);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-align: center;
}

.shot img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.strip .current .shot {
  box-shadow:
    0 0 0 2px var(--k-surface),
    0 0 0 4px var(--k-accent);
}

.strip small {
  display: block;
  margin-top: 5px;
  overflow: hidden;
  color: var(--k-text-3);
  font-size: 11px;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.foot {
  display: flex;
  gap: 8px;
  justify-content: space-between;
  padding: 10px 14px;
  border-top: 1px solid var(--k-line);
  background: var(--k-surface-2);
}

.step {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  min-width: 0;
  max-width: 48%;
  height: 32px;
  padding: 0 10px;
  border: 1px solid var(--k-line);
  border-radius: 6px;
  background: var(--k-surface);
  color: var(--k-text-2);
  font: inherit;
  font-size: 12.5px;
  cursor: pointer;
}

.step span {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.step:hover {
  border-color: var(--k-line-2);
}

@container (max-width: 620px) {
  .body {
    grid-template-columns: minmax(0, 1fr);
    padding: 14px 12px;
  }
}
</style>
