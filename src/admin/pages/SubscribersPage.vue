<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';

import SubscriberMilestoneInspector from '../components/SubscriberMilestoneInspector.vue';
import { AdminApiError, getJson } from '../lib/api';
import { STATUS_OPTIONS, type FootprintsEvent, type FootprintsMember } from '../lib/footprints';
import {
  announcerLabel,
  formatCount,
  linkableEvents,
  milestonesQuery,
  type SubscriberMilestone,
} from '../lib/subscriber-milestones';
import { milestoneMarkFor, type MilestonesPending } from '../lib/subscriber-milestones-publish';
import { showToast } from '../lib/toast';

/**
 * 登録者数の節目 (#225) - the table and its edit panel, laid out as
 * FootprintsPage.vue is. The numbers here are only ever typed in by a person
 * from an announcement; nothing on this screen reads the YouTube API's count
 * or offers it as a value (#222).
 */

const milestones = ref<SubscriberMilestone[]>([]);
const members = ref<FootprintsMember[]>([]);
const events = ref<FootprintsEvent[]>([]);
const loading = ref(false);
const loadError = ref<string | null>(null);
const channelId = ref('all');
const status = ref('all');
const selectedId = ref<number | null>(null);
const adding = ref(false);
const detail = ref(false);
// Null when it could not be read, so a failed request does not draw every
// published row as already public - see FootprintsPage.vue.
const pending = ref<MilestonesPending | null>(null);

// `/subscribers?milestone=<id>` is where the 公開 screen's rows lead. Read
// once, for the first list that arrives.
const route = useRoute();
let requestedId = typeof route.query.milestone === 'string' ? Number(route.query.milestone) : Number.NaN;

const selected = computed(() => milestones.value.find((m) => m.milestoneId === selectedId.value) ?? null);
const linkable = computed(() => linkableEvents(events.value));
// A new milestone starts with the member the table is narrowed to, or the
// first member when it is not narrowed.
const newChannelId = computed(() =>
  channelId.value !== 'all' ? channelId.value : (members.value[0]?.channelId ?? ''),
);

function memberName(id: string): string {
  return members.value.find((m) => m.channelId === id)?.name ?? id;
}

function memberColor(id: string): string {
  return members.value.find((m) => m.channelId === id)?.colorKey ?? '#9b9289';
}

function eventTitle(eventId: number): string {
  return events.value.find((e) => e.eventId === eventId)?.title ?? `event_id ${eventId}`;
}

// See FootprintsPage.vue: a slower response for a filter no longer selected
// must not overwrite a faster one for the filter that is.
let loadGeneration = 0;

async function load(): Promise<void> {
  loading.value = true;
  loadError.value = null;

  const generation = ++loadGeneration;

  try {
    const body = await getJson<{ milestones: SubscriberMilestone[] }>(
      `/subscribers/milestones${milestonesQuery(channelId.value, status.value)}`,
    );

    if (generation !== loadGeneration) return;

    milestones.value = body.milestones;

    if (selectedId.value !== null && !milestones.value.some((m) => m.milestoneId === selectedId.value)) {
      selectedId.value = null;
      detail.value = false;
    }

    // The wide layout keeps the edit panel filled, as FootprintsPage.vue does,
    // unless a new milestone is being entered there.
    if (selectedId.value === null && !adding.value && milestones.value.length > 0) {
      const requested = milestones.value.find((m) => m.milestoneId === requestedId);

      selectedId.value = (requested ?? milestones.value[0]!).milestoneId;
      if (requested !== undefined) detail.value = true;
    }

    requestedId = Number.NaN;
  } catch (error) {
    if (generation !== loadGeneration) return;

    loadError.value = error instanceof AdminApiError ? error.message : String(error);
  } finally {
    if (generation === loadGeneration) loading.value = false;
  }
}

async function loadPending(): Promise<void> {
  try {
    pending.value = await getJson<MilestonesPending>('/subscribers/pending');
  } catch {
    pending.value = null;
  }
}

function reload(): Promise<unknown> {
  return Promise.all([load(), loadPending()]);
}

async function loadMembers(): Promise<void> {
  try {
    members.value = (await getJson<{ members: FootprintsMember[] }>('/members')).members;
  } catch {
    // The table falls back to the raw channelId when this fails.
  }
}

async function loadEvents(): Promise<void> {
  try {
    events.value = (await getJson<{ events: FootprintsEvent[] }>('/footprints/events')).events;
  } catch {
    // The table and the picker fall back to the raw event_id when this fails.
  }
}

function selectRow(milestoneId: number): void {
  adding.value = false;
  selectedId.value = milestoneId;
  detail.value = true;
}

function startAdding(): void {
  adding.value = true;
  selectedId.value = null;
  detail.value = true;
}

function back(): void {
  detail.value = false;

  if (adding.value) {
    adding.value = false;
    selectedId.value = milestones.value[0]?.milestoneId ?? null;
  }
}

async function created(milestoneId: number): Promise<void> {
  adding.value = false;
  await reload();

  // The filters can leave a new row out of the table; pointing the panel at it
  // anyway would edit a row the table does not show.
  if (milestones.value.some((m) => m.milestoneId === milestoneId)) {
    selectRow(milestoneId);
    showToast('保存しました');
  } else {
    selectedId.value = milestones.value[0]?.milestoneId ?? null;
    detail.value = false;
    showToast('保存しました（いまの絞り込みには出ません）');
  }
}

watch([channelId, status], load);
onMounted(() => {
  load();
  loadPending();
  loadMembers();
  loadEvents();
});
</script>

<template>
  <div class="main" :class="{ detail }">
    <div class="pane">
      <div class="toolbar">
        <h2>登録者数の節目</h2>
        <select v-model="channelId" aria-label="メンバーで絞る">
          <option value="all">すべてのメンバー</option>
          <option v-for="m in members" :key="m.channelId" :value="m.channelId">{{ m.name }}</option>
        </select>
        <div class="seg" role="group" aria-label="状態で絞る">
          <button
            v-for="opt in STATUS_OPTIONS"
            :key="opt.value"
            type="button"
            :aria-pressed="status === opt.value"
            @click="status = opt.value"
          >
            {{ opt.label }}
          </button>
        </div>
        <span class="grow"></span>
        <span class="sub num">{{ milestones.length }} 件</span>
        <button class="btn" type="button" :disabled="members.length === 0" @click="startAdding">＋ 足す</button>
      </div>
      <div class="scroller">
        <div v-if="loadError" class="empty">
          <b>読み込めません</b>
          <div class="sub">{{ loadError }}</div>
          <button class="btn quiet" type="button" :disabled="loading" @click="load">再読み込み</button>
        </div>
        <table class="grid">
          <thead>
            <tr>
              <th>状態</th>
              <th>達成の日</th>
              <th>メンバー</th>
              <th>人数</th>
              <th>誰の公表か</th>
              <th>出典</th>
              <th>つないだ出来事</th>
              <th>milestone_id</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="m in milestones"
              :key="m.milestoneId"
              :aria-selected="m.milestoneId === selectedId"
              tabindex="0"
              @click="selectRow(m.milestoneId)"
              @keydown.enter="selectRow(m.milestoneId)"
              @keydown.space.prevent="selectRow(m.milestoneId)"
            >
              <td>
                <span class="chip" :class="milestoneMarkFor(m.status, m.milestoneId, pending).tone">{{
                  milestoneMarkFor(m.status, m.milestoneId, pending).label
                }}</span>
              </td>
              <td class="num">
                {{ m.reachedDate }}<span v-if="m.datePrecision === 'month'" class="sub"> 月のみ</span>
              </td>
              <td>
                <span class="who-chip">
                  <i :style="{ background: memberColor(m.channelId) }"></i
                  ><span class="sub">{{ memberName(m.channelId) }}</span>
                </span>
              </td>
              <td class="num">{{ formatCount(m.subscriberCount) }}</td>
              <td>
                <span class="chip kind">{{ announcerLabel(m.announcedBy) }}</span>
              </td>
              <td class="sub">{{ m.sources.length }} 件</td>
              <td>
                <span v-if="m.eventId === null" class="sub">—</span>
                <span v-else class="clip">{{ eventTitle(m.eventId) }}</span>
              </td>
              <td class="num sub">{{ m.milestoneId }}</td>
            </tr>
          </tbody>
        </table>
        <div v-if="!loading && !loadError && milestones.length === 0" class="empty">
          <div class="sub">該当する節目はありません</div>
        </div>
      </div>
    </div>
    <SubscriberMilestoneInspector
      v-if="adding || selected"
      :key="adding ? 'new' : selected!.milestoneId"
      :milestone="adding ? null : selected"
      :channel-id="newChannelId"
      :members="members"
      :events="linkable"
      :pending="pending"
      @changed="reload"
      @created="created"
      @back="back"
    />
  </div>
</template>
