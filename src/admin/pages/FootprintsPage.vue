<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';

import BulkPublishBar from '../components/BulkPublishBar.vue';
import BulkPublishOutcome from '../components/BulkPublishOutcome.vue';
import FootprintsInspector from '../components/FootprintsInspector.vue';
import RepublishBand from '../components/RepublishBand.vue';
import { AdminApiError, getJson, postJson } from '../lib/api';
import {
  ABANDONED,
  allTicked,
  ALREADY_PUBLISHED,
  BULK_TEXT,
  isTickable,
  publishInTurn,
  tickedRows,
  ticksAfterReload,
  toggleAll,
  toggleTick,
  type BulkPublishOutcome as Outcome,
} from '../lib/bulk-publish';
import { SAVE_TOAST } from '../lib/editing';
import {
  footprintsQuery,
  kindLabel,
  STATUS_OPTIONS,
  toFormFields,
  withKeptRow,
  type FootprintsEvent,
  type FootprintsMember,
} from '../lib/footprints';
import type { FootprintsPending } from '../lib/footprints-publish';
import { isShortOfSources, useWhitelist, SOURCE_TEXT } from '../lib/footprints-sources';
import { refreshSidebarDrafts } from '../lib/sidebar-drafts';
import { liveMarkFor } from '../lib/publishing';
import { footprintsBandText } from '../lib/republish';
import { countText } from '../lib/list-count';
import { useListTotal } from '../lib/list-total';
import { showToast } from '../lib/toast';
import { confirmDiscard } from '../lib/unsaved-guard';

/**
 * あしあと (#144, task 9's own admin screen) - the table and its edit panel.
 * 出典不足だけ narrows the rows already read to those short of sources
 * (#277's decision 2b), judged here against the whitelist.
 */

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
// まとめて公開 (#285): the drafts ticked, how far a run has got, and what the last one did.
const ticked = ref<Set<number>>(new Set());
const bulkProgress = ref<{ done: number; total: number } | null>(null);
const bulkOutcome = ref<Outcome<FootprintsEvent> | null>(null);
// Neither the filters nor the selection move while the panel's request or a run is on its way.
const locked = computed(() => inspectorBusy.value || bulkProgress.value !== null);
// Which published rows the public JSON has not caught up with - the edit
// panel says so. Null when it could not be read.
const pending = ref<FootprintsPending | null>(null);
// The 出典ホワイトリスト's prefixes, or null while they are unknown: no row
// is called short of sources then, and 出典不足だけ cannot be pressed.
const { whitelist, failed: whitelistFailed, load: loadWhitelist } = useWhitelist();
const shortOnly = ref(false);
// The row last saved, published or withdrawn, kept in the table at the place
// it had until another row is selected or a filter changes (`withKeptRow`).
const keptId = ref<number | null>(null);
let keptIndex = 0;
// The kept row as it was when kept: what the table shows when it cannot be read again.
let keptCopy: FootprintsEvent | null = null;
// The rows the worker answered for the filter, without a kept one put back.
const answeredIds = ref<Set<number>>(new Set());

// `/footprints?event=<id>` opens that row, for a link to it. Read once,
// for the first list that arrives; later loads keep whatever is selected.
const route = useRoute();
let requestedId = typeof route.query.event === 'string' ? Number(route.query.event) : Number.NaN;

const selected = computed(() => events.value.find((e) => e.eventId === selectedId.value) ?? null);
// 出典不足だけ is pressed and has a whitelist to judge by.
const shortOnlyApplied = computed(() => shortOnly.value && whitelist.value !== null);
const filtered = computed(() => status.value !== 'all' || q.value.trim() !== '' || shortOnlyApplied.value);
const shortCount = computed(() =>
  whitelist.value === null ? null : events.value.filter((e) => isShortOfSources(e, whitelist.value)).length,
);
const shown = computed(() =>
  shortOnlyApplied.value
    ? events.value.filter((e) => isShortOfSources(e, whitelist.value) || e.eventId === keptId.value)
    : events.value,
);
// Whether `e` is in the table only because it is kept: the count leaves it out.
function keptOnly(e: FootprintsEvent): boolean {
  if (e.eventId !== keptId.value) return false;

  return !answeredIds.value.has(e.eventId) || (shortOnlyApplied.value && !isShortOfSources(e, whitelist.value));
}

const matchedCount = computed(() => shown.value.filter((e) => !keptOnly(e)).length);
const keyOf = (e: FootprintsEvent): number => e.eventId;
const bulkTargets = computed(() =>
  loading.value || loadError.value !== null ? [] : tickedRows(ticked.value, shown.value, keyOf),
);
const bandText = computed(() => footprintsBandText(pending.value));
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

    let rows = body.events;

    answeredIds.value = new Set(rows.map((e) => e.eventId));

    const requestedKept = keptId.value;

    if (requestedKept !== null && !rows.some((e) => e.eventId === requestedKept)) {
      const kept = await readKept(requestedKept);

      if (generation !== loadGeneration) return;

      // Let go while it was being read: another row was selected meanwhile.
      if (keptId.value === requestedKept) {
        // Gone when it was deleted.
        if (kept === null) keptId.value = null;
        else rows = withKeptRow(rows, kept, keptIndex);
      }
    }

    events.value = rows;
    ticked.value = ticksAfterReload(ticked.value, shown.value, keyOf);
    listTotal.update(matchedCount.value, filtered.value);

    if (selectedId.value !== null && !shown.value.some((e) => e.eventId === selectedId.value)) {
      selectedId.value = null;
      detail.value = false;
    }

    // The wide layout always keeps the inspector column filled - matching
    // the mock, which never leaves it empty - so the first row is selected
    // by default. This does not open the narrow layout's
    // detail view; only clicking a row does that. Not while a new event is
    // being entered there.
    if (selectedId.value === null && !adding.value && shown.value.length > 0) {
      const requested = shown.value.find((e) => e.eventId === requestedId);

      selectedId.value = (requested ?? shown.value[0]!).eventId;
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

// Generations of the pending reads: the latest one sent, and the one `pending` holds. An
// older answer that lands later is dropped. The message above the list stays hidden after a
// 「本番に反映」 through the read the press starts (RepublishBand.vue).
let pendingSent = 0;
const pendingHeld = ref(0);

async function loadPending(): Promise<void> {
  const generation = ++pendingSent;

  try {
    const body = await getJson<FootprintsPending>('/footprints/pending');

    if (generation === pendingSent) pending.value = body;
  } catch {
    if (generation === pendingSent) pending.value = null;
  } finally {
    if (generation === pendingSent) pendingHeld.value = generation;
  }
}

/** RepublishBand.vue's `reload`: reads the pending state again, and answers the generation of that read. */
function reloadPending(): number {
  void loadPending();

  return pendingSent;
}

/**
 * reload() calls on their way. `loading` alone ends with the list, before
 * the pending list is read and so before created() opens the new row over
 * whatever was typed into the row shown meanwhile.
 */
const reloading = ref(0);

/** The kept row as it is now, null when it is gone, or the copy kept with it when it cannot be read. */
async function readKept(eventId: number): Promise<FootprintsEvent | null> {
  try {
    return await getJson<FootprintsEvent>(`/footprints/events/${eventId}`);
  } catch (error) {
    return error instanceof AdminApiError && error.status === 404 ? null : keptCopy;
  }
}

/** The panel's own save, publish, withdraw or delete: the row it shows stays in the table. */
function keepAndReload(): Promise<void> {
  keptId.value = selectedId.value;
  keptIndex = events.value.findIndex((e) => e.eventId === selectedId.value);
  keptCopy = events.value[keptIndex] ?? null;

  return reload();
}

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
  if (locked.value) return;
  if ((adding.value || eventId !== selectedId.value) && !confirmDiscard()) return;

  openRow(eventId);
}

/** Lets the kept row go: it leaves the table at once, whichever filter kept it out. */
function releaseKept(): void {
  const released = keptId.value;

  keptId.value = null;
  keptCopy = null;

  if (released !== null && !answeredIds.value.has(released)) {
    events.value = events.value.filter((e) => e.eventId !== released);
  }
}

function openRow(eventId: number): void {
  if (eventId !== keptId.value) releaseKept();
  adding.value = false;
  selectedId.value = eventId;
  detail.value = true;
}

function startAdding(): void {
  if (locked.value) return;
  if (!adding.value && !confirmDiscard()) return;

  adding.value = true;
  releaseKept();
  selectedId.value = null;
  detail.value = true;
}

function back(): void {
  detail.value = false;

  if (adding.value) {
    adding.value = false;
    selectedId.value = shown.value[0]?.eventId ?? null;
  }
}

// A filter can leave the open row out of the table, which closes its panel,
// so changing one asks first, as selecting another row does.
function setStatus(value: string): void {
  if (locked.value) return;
  if (value !== status.value && confirmDiscard()) {
    releaseKept();
    status.value = value;
  }
}

function toggleShortOnly(): void {
  if (locked.value) return;

  // Either way the kept row is let go, which hides the open row when the
  // worker's answer does not hold it; turning the filter on also hides it
  // when it is not short of sources.
  const open = adding.value ? null : selected.value;
  const releasesOpenRow = open !== null && open.eventId === keptId.value && !answeredIds.value.has(open.eventId);
  const filtersOpenRow = open !== null && !shortOnly.value && !isShortOfSources(open, whitelist.value);
  const hidesOpenRow = releasesOpenRow || filtersOpenRow;

  if (hidesOpenRow && !confirmDiscard()) return;

  releaseKept();

  shortOnly.value = !shortOnly.value;

  if (!adding.value && !shown.value.some((e) => e.eventId === selectedId.value)) {
    selectedId.value = shown.value[0]?.eventId ?? null;
    detail.value = false;
  }
}

function setQuery(event: Event): void {
  const input = event.target as HTMLInputElement;

  if (!locked.value && confirmDiscard()) {
    releaseKept();
    q.value = input.value;
  } else input.value = q.value;
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
  if (shown.value.some((e) => e.eventId === eventId)) {
    openRow(eventId);
    showToast(SAVE_TOAST.saveDraft);
  } else {
    selectedId.value = shown.value[0]?.eventId ?? null;
    detail.value = false;
    showToast(`${SAVE_TOAST.saveDraft}（いまの絞り込みには出ません）`);
  }
}

/**
 * まとめて公開: each ticked draft through 「公開」, one at a time, with the
 * fields it has saved when its turn comes (lib/bulk-publish.ts), as
 * SubscribersPage.vue does. The list is read again afterwards, which puts
 * the open panel's saved fields back, so its unsaved changes are asked
 * about first.
 */
async function publishTicked(): Promise<void> {
  const targets = bulkTargets.value;

  if (targets.length === 0 || locked.value || !confirmDiscard()) return;

  releaseKept();
  bulkOutcome.value = null;
  bulkProgress.value = { done: 0, total: targets.length };

  try {
    bulkOutcome.value = await publishInTurn(
      targets,
      async ({ eventId }) => {
        // Read again just before: the table can be older than the row.
        const saved = await getJson<FootprintsEvent>(`/footprints/events/${eventId}`);

        // Left while the read was on its way: no publish starts after that.
        if (left) return ABANDONED;

        if (saved.status !== 'draft') return ALREADY_PUBLISHED;

        await postJson(`/footprints/events/${eventId}/publish`, toFormFields(saved));
      },
      (done) => {
        bulkProgress.value = { done, total: targets.length };
      },
      () => left,
    );
  } finally {
    bulkProgress.value = null;
    void refreshSidebarDrafts();
    if (!left) await reload();
  }
}

// Whether the page was left: a run on its way sends no row after that, so it
// does not go on unseen (lib/bulk-publish.ts's `publishInTurn`).
let left = false;

onUnmounted(() => {
  left = true;
});

function eventLine(e: FootprintsEvent): string {
  return `${e.startDate} ${e.title}`;
}

async function loadMembers(): Promise<void> {
  try {
    const body = await getJson<{ members: FootprintsMember[] }>('/members');

    members.value = body.members;
  } catch {
    // The table falls back to the raw channelId when this fails.
  }
}

// Reading the list again reads the pending state with it, so the message above the list
// comes back after a 「本番に反映」 if the worker still calls the JSON behind.
watch([status, q], () => {
  void load();
  void loadPending();
});
onMounted(() => {
  load();
  loadPending();
  loadMembers();
  loadWhitelist();
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
        <div class="seg">
          <button
            type="button"
            :aria-pressed="shortOnlyApplied"
            :disabled="whitelist === null"
            @click="toggleShortOnly"
          >
            {{ SOURCE_TEXT.shortOnly }} <span class="num">{{ shortCount ?? '' }}</span>
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
        <span class="sub num">{{ countText(matchedCount, listTotal.total.value, filtered) }}</span>
        <button class="btn" type="button" @click="startAdding">＋ 足す</button>
      </div>
      <div class="scroller">
        <RepublishBand target="footprints" :text="bandText" :held="pendingHeld" :reload="reloadPending" />
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
              <th class="tick">
                <input
                  type="checkbox"
                  :checked="allTicked(ticked, shown, keyOf)"
                  :disabled="bulkProgress !== null || !shown.some(isTickable)"
                  :aria-label="BULK_TEXT.selectAll"
                  @change="ticked = toggleAll(ticked, shown, keyOf)"
                />
              </th>
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
              v-for="e in shown"
              :key="e.eventId"
              :aria-selected="e.eventId === selectedId"
              tabindex="0"
              @click="selectRow(e.eventId)"
              @keydown.enter="selectRow(e.eventId)"
              @keydown.space.prevent="selectRow(e.eventId)"
            >
              <td class="tick" @click.stop @keydown.stop>
                <input
                  v-if="isTickable(e)"
                  type="checkbox"
                  :checked="ticked.has(e.eventId)"
                  :disabled="bulkProgress !== null"
                  :aria-label="BULK_TEXT.select"
                  @change="ticked = toggleTick(ticked, e.eventId)"
                />
              </td>
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
                <span v-if="isShortOfSources(e, whitelist)" class="chip alarm">{{ SOURCE_TEXT.shortChip }}</span>
                <span v-else class="sub">{{ e.sources.length }} 件</span>
              </td>
              <td class="num sub">{{ e.eventId }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <BulkPublishOutcome
        v-if="bulkOutcome && !bulkProgress"
        :outcome="bulkOutcome"
        :describe="eventLine"
        :key-of="keyOf"
        @close="bulkOutcome = null"
      />
      <BulkPublishBar
        :count="bulkTargets.length"
        :progress="bulkProgress"
        :disabled="inspectorBusy"
        @publish="publishTicked"
        @clear="ticked = new Set()"
      />
    </div>
    <!-- inert while the list is read, or read again after a save: the answer puts the open row's saved fields back, or leaves the row out of the table and closes the panel, over anything typed meanwhile. -->
    <FootprintsInspector
      v-if="adding || selected"
      :key="adding ? 'new' : selected!.eventId"
      :event="adding ? null : selected"
      :members="members"
      :pending="pending"
      :whitelist="whitelist"
      :whitelist-failed="whitelistFailed"
      :inert="loading || reloading > 0 || bulkProgress !== null || undefined"
      @changed="keepAndReload"
      @created="created"
      @back="back"
      @busy="inspectorBusy = $event"
    />
  </div>
</template>
