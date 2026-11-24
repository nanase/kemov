<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';

import FootprintsInspector from '../components/FootprintsInspector.vue';
import { AdminApiError, getJson } from '../lib/api';
import { SAVE_TOAST } from '../lib/editing';
import {
  footprintsQuery,
  kindLabel,
  STATUS_OPTIONS,
  type FootprintsEvent,
  type FootprintsMember,
} from '../lib/footprints';
import type { FootprintsPending } from '../lib/footprints-publish';
import { liveMarkFor } from '../lib/publishing';
import { countText } from '../lib/list-count';
import { useListTotal } from '../lib/list-total';
import { showToast } from '../lib/toast';
import { confirmDiscard } from '../lib/unsaved-guard';

/** あしあと (#144, task 9's own admin screen) - the table and its edit panel. */

const events = ref<FootprintsEvent[]>([]);
const members = ref<FootprintsMember[]>([]);
const loading = ref(false);
const loadError = ref<string | null>(null);
const status = ref('all');
const q = ref('');
const selectedId = ref<number | null>(null);
const detail = ref(false);
// ＋ 足す: the edit panel holds a new event, not yet created (#277's 6-12).
const adding = ref(false);
// Whether the edit panel's request is on its way. Selecting another row
// meanwhile would unmount the panel, and its answer would never reach the table.
const inspectorBusy = ref(false);
// Which published rows the public JSON has not caught up with - the edit
// panel says so. Null when it could not be read.
const pending = ref<FootprintsPending | null>(null);

// `/footprints?event=<id>` is where the 公開 screen's rows lead. Read once,
// for the first list that arrives; later loads keep whatever is selected.
const route = useRoute();
let requestedId = typeof route.query.event === 'string' ? Number(route.query.event) : Number.NaN;

const selected = computed(() => events.value.find((e) => e.eventId === selectedId.value) ?? null);
const filtered = computed(() => status.value !== 'all' || q.value.trim() !== '');
const listTotal = useListTotal(
  async () => (await getJson<{ events: FootprintsEvent[] }>('/footprints/events')).events.length,
);

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
    listTotal.update(events.value.length, filtered.value);

    if (selectedId.value !== null && !events.value.some((e) => e.eventId === selectedId.value)) {
      selectedId.value = null;
      detail.value = false;
    }

    // The wide layout always keeps the inspector column filled - matching
    // the mock, which never leaves it empty - so the first row is selected
    // by default, the same as the やること screens the mock's own
    // inboxTable auto-selects. This does not open the narrow layout's
    // detail view; only clicking a row does that. Not while a new event is
    // being entered there.
    if (selectedId.value === null && !adding.value && events.value.length > 0) {
      const requested = events.value.find((e) => e.eventId === requestedId);

      selectedId.value = (requested ?? events.value[0]!).eventId;
      // Unlike the default above, a row asked for by name is opened, so a
      // narrow screen lands on its edit panel rather than on the table.
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
    pending.value = await getJson<FootprintsPending>('/footprints/pending');
  } catch {
    pending.value = null;
  }
}

/**
 * reload() calls on their way. `loading` alone ends with the list, before
 * the pending list is read and so before created() opens the new row over
 * whatever was typed into the row shown meanwhile.
 */
const reloading = ref(0);

/** After a save, a publish, a withdraw or a delete: the rows and which of them the public JSON is behind both changed. */
async function reload(): Promise<void> {
  // A save can add a row, and a delete takes one away.
  listTotal.invalidate();
  reloading.value += 1;

  try {
    await Promise.all([load(), loadPending()]);
  } finally {
    reloading.value -= 1;
  }
}

/** A row clicked in the table: asks first when the open one has changes that would be lost. */
function selectRow(eventId: number): void {
  if (inspectorBusy.value) return;
  if ((adding.value || eventId !== selectedId.value) && !confirmDiscard()) return;

  openRow(eventId);
}

function openRow(eventId: number): void {
  adding.value = false;
  selectedId.value = eventId;
  detail.value = true;
}

function startAdding(): void {
  if (inspectorBusy.value) return;
  if (!adding.value && !confirmDiscard()) return;

  adding.value = true;
  selectedId.value = null;
  detail.value = true;
}

function back(): void {
  detail.value = false;

  if (adding.value) {
    adding.value = false;
    selectedId.value = events.value[0]?.eventId ?? null;
  }
}

// A filter can leave the open row out of the table, which closes its panel,
// so changing one asks first, as selecting another row does.
function setStatus(value: string): void {
  if (inspectorBusy.value) return;
  if (value !== status.value && confirmDiscard()) status.value = value;
}

function setQuery(event: Event): void {
  const input = event.target as HTMLInputElement;

  if (!inspectorBusy.value && confirmDiscard()) q.value = input.value;
  else input.value = q.value;
}

async function created(eventId: number): Promise<void> {
  adding.value = false;
  inspectorBusy.value = false;
  // The panel shows another row until the reload ends, held by `reloading`.
  await reload();

  // A table that could not be read says nothing about the filter.
  if (loadError.value !== null) {
    detail.value = false;
    showToast(SAVE_TOAST.saveDraft);

    return;
  }

  // A new event is always a draft - the status or title filter can leave it
  // out of the table. Pointing the panel at it anyway would edit a row the
  // table does not show.
  if (events.value.some((e) => e.eventId === eventId)) {
    openRow(eventId);
    showToast(SAVE_TOAST.saveDraft);
  } else {
    selectedId.value = events.value[0]?.eventId ?? null;
    detail.value = false;
    showToast(`${SAVE_TOAST.saveDraft}（いまの絞り込みには出ません）`);
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
  loadPending();
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
            @click="setStatus(opt.value)"
          >
            {{ opt.label }}
          </button>
        </div>
        <input
          :value="q"
          type="text"
          class="btn"
          placeholder="題で絞り込み"
          aria-label="題で絞り込み"
          @input="setQuery"
        />
        <span class="grow"></span>
        <span class="sub num">{{ countText(events.length, listTotal.total.value, filtered) }}</span>
        <button class="btn" type="button" @click="startAdding">＋ 足す</button>
      </div>
      <div class="scroller">
        <div v-if="loadError" class="empty-note">
          <b>読み込めません</b>
          <div class="sub">{{ loadError }}</div>
          <button class="btn quiet" type="button" :disabled="loading" @click="confirmDiscard() && load()">
            再読み込み
          </button>
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
              <th>event_id</th>
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
                <span class="chip" :class="liveMarkFor(e.status).tone">{{ liveMarkFor(e.status).label }}</span>
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
              <td class="num sub">{{ e.eventId }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
    <!-- inert while the list is read, or read again after a save: the answer puts the open row's saved fields back, or leaves the row out of the table and closes the panel, over anything typed meanwhile. -->
    <FootprintsInspector
      v-if="adding || selected"
      :key="adding ? 'new' : selected!.eventId"
      :event="adding ? null : selected"
      :members="members"
      :pending="pending"
      :inert="loading || reloading > 0 || undefined"
      @changed="reload"
      @created="created"
      @back="back"
      @busy="inspectorBusy = $event"
    />
  </div>
</template>
