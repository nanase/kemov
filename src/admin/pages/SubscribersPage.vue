<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';

import BulkPublishBar from '../components/BulkPublishBar.vue';
import BulkPublishOutcome from '../components/BulkPublishOutcome.vue';
import RepublishBand from '../components/RepublishBand.vue';
import SubscriberMilestoneInspector from '../components/SubscriberMilestoneInspector.vue';
import { AdminApiError, getJson, postJson } from '../lib/api';
import type { FootprintsEvent, FootprintsMember } from '../lib/footprints';
import { refreshSidebarDrafts } from '../lib/sidebar-drafts';
import { liveMarkFor } from '../lib/publishing';
import {
  announcerLabel,
  formatCount,
  linkableEvents,
  milestonesQuery,
  STATUS_OPTIONS,
  toFormFields,
  toRequestBody,
  type SubscriberMilestone,
} from '../lib/subscriber-milestones';
import { SAVE_TOAST } from '../lib/editing';
import { countText } from '../lib/list-count';
import { useListTotal } from '../lib/list-total';
import {
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
import { milestonesBandText } from '../lib/republish';
import type { MilestonesPending } from '../lib/subscriber-milestones-publish';
import { showToast } from '../lib/toast';
import { confirmDiscard } from '../lib/unsaved-guard';

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
// Null when it could not be read: the edit panel then says nothing about a
// row's public copy being behind.
const pending = ref<MilestonesPending | null>(null);
// まとめて公開 (#237, #283, #285): the drafts ticked, how far a run has got, and what the last one did.
const ticked = ref<Set<number>>(new Set());
const bulkProgress = ref<{ done: number; total: number } | null>(null);
const bulkOutcome = ref<Outcome<SubscriberMilestone> | null>(null);
// How many of the edit panel's writes are on their way; a run waits for them
// to land. Counted here, not in the panel: selecting another row unmounts the
// panel but not its request.
const writesInFlight = ref(0);
const inspectorBusy = computed(() => writesInFlight.value > 0);
// Neither the selection nor the table moves while the panel's write or a まとめて公開 is on its way.
const locked = computed(() => inspectorBusy.value || bulkProgress.value !== null);

function trackWrite(write: Promise<unknown>): void {
  writesInFlight.value++;

  const settled = (): void => {
    writesInFlight.value--;
  };

  write.then(settled, settled);
}

// `/subscribers?milestone=<id>` opens that row, for a link to it. Read
// once, for the first list that arrives.
const route = useRoute();
let requestedId = typeof route.query.milestone === 'string' ? Number(route.query.milestone) : Number.NaN;

const selected = computed(() => milestones.value.find((m) => m.milestoneId === selectedId.value) ?? null);
const filtered = computed(() => channelId.value !== 'all' || status.value !== 'all');
const listTotal = useListTotal(
  async () => (await getJson<{ milestones: SubscriberMilestone[] }>('/subscribers/milestones')).milestones.length,
);
const linkable = computed(() => linkableEvents(events.value));
const keyOf = (m: SubscriberMilestone): number => m.milestoneId;
// While a list is loading or failed to load, `milestones` is not what the
// filters ask for, so the band acts on nothing until it is.
const bulkTargets = computed(() =>
  loading.value || loadError.value !== null ? [] : tickedRows(ticked.value, milestones.value, keyOf),
);
const bandText = computed(() => milestonesBandText(pending.value));
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
    ticked.value = ticksAfterReload(ticked.value, milestones.value, keyOf);
    listTotal.update(milestones.value.length, filtered.value);

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

// Generations of the pending reads: the latest one sent, and the one `pending` holds. An
// older answer that lands later is dropped. The message above the list stays hidden after a
// 「本番に反映」 through the read the press starts (RepublishBand.vue).
let pendingSent = 0;
const pendingHeld = ref(0);

async function loadPending(): Promise<void> {
  const generation = ++pendingSent;

  try {
    const body = await getJson<MilestonesPending>('/subscribers/pending');

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
 * the pending state is read and so before created() opens the new row over whatever
 * was typed into the row shown meanwhile.
 */
const reloading = ref(0);

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

/** A row clicked in the table: asks first when the open one has changes that would be lost. */
function selectRow(milestoneId: number): void {
  if (bulkProgress.value !== null) return;
  if ((adding.value || milestoneId !== selectedId.value) && !confirmDiscard()) return;

  openRow(milestoneId);
}

function openRow(milestoneId: number): void {
  adding.value = false;
  selectedId.value = milestoneId;
  detail.value = true;
}

function startAdding(): void {
  if (bulkProgress.value !== null) return;
  if (!adding.value && !confirmDiscard()) return;

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

// A filter can leave the open row out of the table, which closes its panel,
// so changing one asks first, as selecting another row does.
function setStatus(value: string): void {
  if (value !== status.value && confirmDiscard()) status.value = value;
}

function setChannel(event: Event): void {
  const select = event.target as HTMLSelectElement;

  if (confirmDiscard()) channelId.value = select.value;
  else select.value = channelId.value;
}

async function created(milestoneId: number): Promise<void> {
  adding.value = false;
  // The panel shows another row until the reload ends, held by `reloading`.
  await reload();

  // The filters can leave a new row out of the table; pointing the panel at it
  // anyway would edit a row the table does not show.
  if (milestones.value.some((m) => m.milestoneId === milestoneId)) {
    openRow(milestoneId);
    showToast(SAVE_TOAST.saveDraft);
  } else {
    selectedId.value = milestones.value[0]?.milestoneId ?? null;
    detail.value = false;
    showToast(`${SAVE_TOAST.saveDraft}（いまの絞り込みには出ません）`);
  }
}

/**
 * まとめて公開: sends each ticked draft through 「公開」, one at a time, with
 * the fields it has saved when its turn comes (lib/bulk-publish.ts). The
 * filters and the ticks are locked meanwhile, so the rows stay the ones the
 * confirmation counted. The list is read again afterwards, stopped or not,
 * and that puts the open panel's saved fields back - so its unsaved changes
 * are asked about too, after the run itself is agreed to, so that declining
 * the run keeps them.
 */
async function publishTicked(): Promise<void> {
  const targets = bulkTargets.value;

  if (targets.length === 0 || locked.value || !confirmDiscard()) return;

  bulkOutcome.value = null;
  bulkProgress.value = { done: 0, total: targets.length };

  try {
    bulkOutcome.value = await publishInTurn(
      targets,
      async ({ milestoneId }) => {
        // Read again just before: the table can be older than the row - a
        // save whose answer came after another row was opened is not in it.
        const saved = await getJson<SubscriberMilestone>(`/subscribers/milestones/${milestoneId}`);

        // Published elsewhere since the table was read. Not counted as
        // published by this run: that publish may not have reached the public JSON.
        if (saved.status !== 'draft') return ALREADY_PUBLISHED;

        await postJson(`/subscribers/milestones/${milestoneId}/publish`, toRequestBody(toFormFields(saved)));
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

function milestoneLine(m: SubscriberMilestone): string {
  return `${m.reachedDate} ${formatCount(m.subscriberCount)} 人 ${memberName(m.channelId)}`;
}

// Reading the list again reads the pending state with it, so the message above the list
// comes back after a 「本番に反映」 if the worker still calls the JSON behind.
watch([channelId, status], () => {
  void load();
  void loadPending();
});
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
        <select :value="channelId" aria-label="メンバーで絞る" :disabled="bulkProgress !== null" @change="setChannel">
          <option value="all">すべてのメンバー</option>
          <option v-for="m in members" :key="m.channelId" :value="m.channelId">{{ m.name }}</option>
        </select>
        <div class="seg" role="group" aria-label="状態で絞る">
          <button
            v-for="opt in STATUS_OPTIONS"
            :key="opt.value"
            type="button"
            :aria-pressed="status === opt.value"
            :disabled="bulkProgress !== null"
            @click="setStatus(opt.value)"
          >
            {{ opt.label }}
          </button>
        </div>
        <span class="grow"></span>
        <span class="sub num">{{ countText(milestones.length, listTotal.total.value, filtered) }}</span>
        <button class="btn" type="button" :disabled="members.length === 0" @click="startAdding">＋ 足す</button>
      </div>
      <div class="scroller">
        <RepublishBand target="milestones" :text="bandText" :held="pendingHeld" :reload="reloadPending" />
        <div v-if="loadError" class="empty-note">
          <b>読み込めません</b>
          <div class="sub">{{ loadError }}</div>
          <button
            class="btn quiet"
            type="button"
            :disabled="loading || bulkProgress !== null"
            @click="confirmDiscard() && load()"
          >
            再読み込み
          </button>
        </div>
        <table class="grid">
          <thead>
            <tr>
              <th class="tick">
                <input
                  type="checkbox"
                  :checked="allTicked(ticked, milestones, keyOf)"
                  :disabled="bulkProgress !== null || !milestones.some(isTickable)"
                  :aria-label="BULK_TEXT.selectAll"
                  @change="ticked = toggleAll(ticked, milestones, keyOf)"
                />
              </th>
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
              <td class="tick" @click.stop @keydown.stop>
                <input
                  v-if="isTickable(m)"
                  type="checkbox"
                  :checked="ticked.has(m.milestoneId)"
                  :disabled="bulkProgress !== null"
                  :aria-label="BULK_TEXT.select"
                  @change="ticked = toggleTick(ticked, m.milestoneId)"
                />
              </td>
              <td>
                <span class="chip" :class="liveMarkFor(m.status).tone">{{ liveMarkFor(m.status).label }}</span>
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
        <div v-if="!loading && !loadError && milestones.length === 0" class="empty-note">
          <div class="sub">該当する節目はありません</div>
        </div>
      </div>
      <BulkPublishOutcome
        v-if="bulkOutcome && !bulkProgress"
        :outcome="bulkOutcome"
        :describe="milestoneLine"
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
    <SubscriberMilestoneInspector
      v-if="adding || selected"
      :key="adding ? 'new' : selected!.milestoneId"
      :milestone="adding ? null : selected"
      :channel-id="newChannelId"
      :members="members"
      :events="linkable"
      :pending="pending"
      :bulk-running="bulkProgress !== null"
      :track-write="trackWrite"
      :inert="loading || reloading > 0 || undefined"
      @changed="reload"
      @created="created"
      @back="back"
    />
  </div>
</template>

<style scoped>
/* The filters are locked while a bulk run goes on. */
.seg button:disabled {
  opacity: 0.55;
  pointer-events: none;
}
</style>
