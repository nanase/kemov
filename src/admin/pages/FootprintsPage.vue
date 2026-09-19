<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';

import FootprintsInspector from '../components/FootprintsInspector.vue';
import { AdminApiError, getJson, postJson } from '../lib/api';
import {
  emptyFormFields,
  footprintsQuery,
  kindLabel,
  STATUS_OPTIONS,
  type FootprintsEvent,
  type FootprintsMember,
} from '../lib/footprints';
import { todayJst } from '../lib/snapshots';
import { showToast } from '../lib/toast';

/** あしあと (#144, task 9's own admin screen) - the table and its edit panel. */

const events = ref<FootprintsEvent[]>([]);
const members = ref<FootprintsMember[]>([]);
const loading = ref(false);
const loadError = ref<string | null>(null);
const status = ref('all');
const q = ref('');
const selectedId = ref<number | null>(null);
const detail = ref(false);
const adding = ref(false);

const selected = computed(() => events.value.find((e) => e.eventId === selectedId.value) ?? null);

function memberName(channelId: string): string {
  return members.value.find((m) => m.channelId === channelId)?.name ?? channelId;
}

function memberColor(channelId: string): string {
  return members.value.find((m) => m.channelId === channelId)?.colorKey ?? '#9b9289';
}

// Changing status or q mid-request starts a second, overlapping GET
// /footprints/events - without this, a slower earlier response can resolve
// after a faster later one and overwrite the list with results for a filter
// that is no longer selected.
let loadGeneration = 0;

async function load(): Promise<void> {
  loading.value = true;
  loadError.value = null;

  const generation = ++loadGeneration;

  try {
    const body = await getJson<{ events: FootprintsEvent[] }>(
      `/footprints/events${footprintsQuery(status.value, q.value)}`,
    );

    if (generation !== loadGeneration) return;

    events.value = body.events;

    if (selectedId.value !== null && !events.value.some((e) => e.eventId === selectedId.value)) {
      selectedId.value = null;
      detail.value = false;
    }

    // The wide layout always keeps the inspector column filled - matching
    // the mock, which never leaves it empty - so the first row is selected
    // by default, the same as the やること screens the mock's own
    // inboxTable auto-selects. This does not open the narrow layout's
    // detail view; only clicking a row does that.
    if (selectedId.value === null && events.value.length > 0) {
      selectedId.value = events.value[0]!.eventId;
    }
  } catch (error) {
    if (generation !== loadGeneration) return;

    loadError.value = error instanceof AdminApiError ? error.message : String(error);
  } finally {
    if (generation === loadGeneration) loading.value = false;
  }
}

function selectRow(eventId: number): void {
  selectedId.value = eventId;
  detail.value = true;
}

function back(): void {
  detail.value = false;
}

async function addEvent(): Promise<void> {
  adding.value = true;

  try {
    const body = await postJson<{ event: { eventId: number } }>('/footprints/events', emptyFormFields(todayJst()));

    await load();

    // A new event is always a draft with an empty title - the active status
    // or title filter can exclude it from `events`. Selecting it anyway
    // would point the inspector at an event the list doesn't show.
    if (events.value.some((e) => e.eventId === body.event.eventId)) {
      selectRow(body.event.eventId);
    } else {
      showToast('作りました（いまの絞り込みには出ません）');
    }
  } catch (error) {
    showToast(error instanceof AdminApiError ? error.message : String(error));
  } finally {
    adding.value = false;
  }
}

async function loadMembers(): Promise<void> {
  try {
    const body = await getJson<{ members: FootprintsMember[] }>('/members');

    members.value = body.members;
  } catch {
    // The table falls back to the raw channelId when this fails.
  }
}

watch([status, q], load);
onMounted(() => {
  load();
  loadMembers();
});
</script>

<template>
  <div class="main" :class="{ detail }">
    <div class="pane">
      <div class="toolbar">
        <h2>あしあと</h2>
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
        <input v-model="q" type="text" class="btn" placeholder="題で絞り込み" aria-label="題で絞り込み" />
        <span class="grow"></span>
        <span class="sub num">{{ events.length }} 件</span>
        <button class="btn" type="button" :disabled="adding" @click="addEvent">＋ 足す</button>
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
              <th>日付</th>
              <th>種類</th>
              <th>題</th>
              <th>メンバー</th>
              <th>出典</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="e in events"
              :key="e.eventId"
              :aria-selected="e.eventId === selectedId"
              tabindex="0"
              @click="selectRow(e.eventId)"
              @keydown.enter="selectRow(e.eventId)"
              @keydown.space.prevent="selectRow(e.eventId)"
            >
              <td>
                <span class="chip" :class="{ published: e.status === 'published', review: e.status === 'review' }">{{
                  e.status === 'published' ? '公開' : e.status === 'review' ? '確認中' : '下書き'
                }}</span>
              </td>
              <td class="num">{{ e.startDate }}<span v-if="e.datePrecision === 'month'" class="sub"> 月のみ</span></td>
              <td>
                <span class="chip kind">{{ kindLabel(e.kind) }}</span>
              </td>
              <td>
                <span class="clip">{{ e.title }}</span>
              </td>
              <td>
                <span class="stack">
                  <span v-if="e.channelIds.length === 0" class="sub">—</span>
                  <span v-for="id in e.channelIds" v-else :key="id" class="who-chip">
                    <i :style="{ background: memberColor(id) }"></i><span class="sub">{{ memberName(id) }}</span>
                  </span>
                </span>
              </td>
              <td>
                <span v-if="e.sourcePending" class="chip alarm">出典の確認待ち</span>
                <span v-else class="sub">{{ e.sources.length }} 件</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
    <FootprintsInspector
      v-if="selected"
      :key="selected.eventId"
      :event="selected"
      :members="members"
      @changed="load"
      @back="back"
    />
  </div>
</template>
