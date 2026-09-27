<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';

import SubscriberMilestoneInspector from '../components/SubscriberMilestoneInspector.vue';
import { AdminApiError, getJson, postJson } from '../lib/api';
import { STATUS_OPTIONS, type FootprintsEvent, type FootprintsMember } from '../lib/footprints';
import {
  announcerLabel,
  formatCount,
  linkableEvents,
  milestonesQuery,
  type SubscriberMilestone,
} from '../lib/subscriber-milestones';
import { bulkPublishTargets, publishInTurn, type BulkPublishOutcome } from '../lib/subscriber-milestones-bulk';
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
// まとめて公開待ちにする (#237): how far a run has got, and what the last one did.
const bulkProgress = ref<{ done: number; total: number } | null>(null);
const bulkOutcome = ref<BulkPublishOutcome | null>(null);

// `/subscribers?milestone=<id>` is where the 公開 screen's rows lead. Read
// once, for the first list that arrives.
const route = useRoute();
let requestedId = typeof route.query.milestone === 'string' ? Number(route.query.milestone) : Number.NaN;

const selected = computed(() => milestones.value.find((m) => m.milestoneId === selectedId.value) ?? null);
const linkable = computed(() => linkableEvents(events.value));
// While a list is loading or failed to load, `milestones` is not what the
// filters ask for, so the button acts on nothing until it is.
const bulkTargets = computed(() =>
  loading.value || loadError.value !== null ? [] : bulkPublishTargets(milestones.value),
);
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

/**
 * Sends each draft the table shows through 「公開待ちにする」, one at a time
 * (lib/subscriber-milestones-bulk.ts). The filters are locked meanwhile, so
 * the table stays the one the confirmation counted. The list is read again
 * afterwards, stopped or not.
 */
async function publishShownDrafts(): Promise<void> {
  const targets = bulkTargets.value;

  if (targets.length === 0) return;
  if (!window.confirm(bulkConfirmText(targets.length))) return;

  bulkOutcome.value = null;
  bulkProgress.value = { done: 0, total: targets.length };

  try {
    bulkOutcome.value = await publishInTurn(
      targets,
      (milestoneId) => postJson(`/subscribers/milestones/${milestoneId}/publish`, {}),
      (done) => {
        bulkProgress.value = { done, total: targets.length };
      },
    );
  } finally {
    bulkProgress.value = null;
    await reload();
  }
}

function bulkConfirmText(count: number): string {
  return [
    `表に出ている下書き ${count} 件を公開待ちにします。`,
    '出典の検査に通らなかった行は飛ばして続けます。',
    '本番に出すには、このあと「公開」画面で「いま公開する」を押します。',
  ].join('\n');
}

function bulkHeading(outcome: BulkPublishOutcome): string {
  if (outcome.stopped) return '途中で止まりました';

  return outcome.published > 0 ? 'まとめて公開待ちにしました' : '公開待ちにできた行はありません';
}

function milestoneLine(m: SubscriberMilestone): string {
  return `${m.reachedDate} ${formatCount(m.subscriberCount)} 人 ${memberName(m.channelId)}`;
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
        <select v-model="channelId" aria-label="メンバーで絞る" :disabled="bulkProgress !== null">
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
            @click="status = opt.value"
          >
            {{ opt.label }}
          </button>
        </div>
        <span class="grow"></span>
        <span class="sub num">{{ milestones.length }} 件</span>
        <button
          class="btn"
          type="button"
          :disabled="bulkProgress !== null || bulkTargets.length === 0"
          @click="publishShownDrafts"
        >
          <template v-if="bulkProgress">
            公開待ちにしています… {{ bulkProgress.done }} / {{ bulkProgress.total }} 件
          </template>
          <template v-else>下書きをまとめて公開待ちにする（{{ bulkTargets.length }} 件）</template>
        </button>
        <button class="btn" type="button" :disabled="members.length === 0" @click="startAdding">＋ 足す</button>
      </div>
      <div class="scroller">
        <div v-if="bulkOutcome" class="bulk">
          <div class="panel" :class="{ flag: bulkOutcome.stopped || bulkOutcome.skipped.length > 0 }">
            <h4>{{ bulkHeading(bulkOutcome) }}</h4>
            <div v-if="bulkOutcome.stopped" class="hint">
              失敗した行でいったん止めました。一覧は読み直してあります。もう一度押すと、下書きのまま残っている行をもう一度試します。
            </div>
            <div class="kv">
              <dt>公開待ちにできた</dt>
              <dd class="num">{{ bulkOutcome.published }} / {{ bulkOutcome.total }} 件</dd>
              <dt>検査に通らなかった</dt>
              <dd class="num">{{ bulkOutcome.skipped.length }} 件</dd>
              <template v-if="bulkOutcome.stopped">
                <dt>止まった行</dt>
                <dd>{{ milestoneLine(bulkOutcome.stopped.milestone) }}</dd>
                <dt>理由</dt>
                <dd>{{ bulkOutcome.stopped.reason }}</dd>
                <dt>まだ試していない</dt>
                <dd class="num">{{ bulkOutcome.total - bulkOutcome.published - bulkOutcome.skipped.length - 1 }} 件</dd>
              </template>
            </div>
            <template v-if="bulkOutcome.skipped.length > 0">
              <div class="hint">検査に通らなかった行（下書きのまま）</div>
              <ul class="bulk-skipped">
                <li v-for="s in bulkOutcome.skipped" :key="s.milestone.milestoneId">
                  <span>{{ milestoneLine(s.milestone) }}</span>
                  <span class="sub">{{ s.reason }}</span>
                </li>
              </ul>
            </template>
            <div v-if="bulkOutcome.published > 0" class="hint">
              本番に出すには、「公開」画面で「いま公開する」を押します
            </div>
            <div class="stack">
              <RouterLink v-if="bulkOutcome.published > 0" class="btn" to="/publish">公開画面へ</RouterLink>
              <button class="btn quiet" type="button" @click="bulkOutcome = null">閉じる</button>
            </div>
          </div>
        </div>
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

<style scoped>
/* The filters are locked while a bulk run goes on. */
.seg button:disabled {
  opacity: 0.55;
  pointer-events: none;
}

.bulk {
  padding: 10px 14px;
}

.bulk-skipped {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 4px;
  font-size: 12.5px;
}

.bulk-skipped li {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.bulk-skipped .sub {
  overflow-wrap: anywhere;
}
</style>
