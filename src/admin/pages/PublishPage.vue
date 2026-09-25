<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';

import { AdminApiError, getJson, postJson } from '../lib/api';
import type { FootprintsMember } from '../lib/footprints';
import {
  canPublishFootprints,
  footprintsMarkFor,
  type ChangedFootprintsEntry,
  type FootprintsPending,
  type PendingFootprintsEntry,
} from '../lib/footprints-publish';
import {
  canPublishGenet,
  entityLabel,
  isWaiting,
  publishesOnlyForShape,
  type ChangedGenetEntry,
  type GenetPendingResponse,
  type GenetPublishResult,
  type PendingGenetEntry,
} from '../lib/genet-publish';
import { refreshPublishBadge } from '../lib/publish-badge';
import { CHANGED_ROWS_HINT, publishMarkFor } from '../lib/publish-mark';
import { milestoneTitle, type SubscriberMilestone } from '../lib/subscriber-milestones';
import {
  canPublishMilestones,
  milestoneMarkFor,
  publishesOnlyForShape as milestonesPublishOnlyForShape,
  type MilestonesPending,
  type MilestonesPublishResult,
} from '../lib/subscriber-milestones-publish';
import { showToast } from '../lib/toast';

/**
 * 運用 > 公開 (#144's task 9, extended by task 14 for ジェネット楽曲一覧 and by
 * #225 for 登録者数の節目). Each has its own publish gate and its own
 * pending/publish endpoint pair under /admin/api, so this screen loads and
 * publishes them independently - one failing does not block the others.
 *
 * This is the second of two steps (#185): a row's own screen moves it to
 * 公開待ち, and 「いま公開する」 here is what writes the public JSON. The rows
 * under 「公開後に変更があった行」 are waiting for the first step again, not for
 * this one - each leads back to its own screen (#201).
 */

const pending = ref<PendingFootprintsEntry[]>([]);
const changed = ref<ChangedFootprintsEntry[]>([]);
const loading = ref(false);
const loadError = ref<string | null>(null);
const publishing = ref(false);

const footprintsState = computed<FootprintsPending>(() => ({ pending: pending.value, changed: changed.value }));

const genetPending = ref<PendingGenetEntry[]>([]);
const genetChanged = ref<ChangedGenetEntry[]>([]);
const genetShapeOutdated = ref(false);
const genetLoading = ref(false);
const genetLoadError = ref<string | null>(null);
const genetPublishing = ref(false);

const genetState = computed<GenetPendingResponse>(() => ({
  pending: genetPending.value,
  changed: genetChanged.value,
  shapeOutdated: genetShapeOutdated.value,
}));

/** Where a changed genet row is edited: a stream has its own screen, a tune or a person is edited from inside the streams that perform it. */
function genetRowLink(entry: ChangedGenetEntry): { path: string; query?: { video: string } } {
  return entry.entity === 'genet_stream' ? { path: '/sets', query: { video: entry.key } } : { path: '/sets' };
}

function genetRowLinkLabel(entry: ChangedGenetEntry): string {
  return entry.entity === 'genet_stream' ? '配信の画面へ' : '配信の一覧へ';
}

// The whole answer in one ref rather than one per list as above: null until
// it has been read, so the section and its button do not appear as "nothing
// waiting" before anything is known.
const milestonesState = ref<MilestonesPending | null>(null);
const milestonesLoading = ref(false);
const milestonesLoadError = ref<string | null>(null);
const milestonesPublishing = ref(false);
// What names a milestone in the lists below. The pending list carries ids
// alone; a row missing here (the list failed to load) is named by its id.
const milestoneRows = ref<SubscriberMilestone[]>([]);
const milestoneMembers = ref<FootprintsMember[]>([]);

function milestoneLabel(milestoneId: number): string {
  const milestone = milestoneRows.value.find((m) => m.milestoneId === milestoneId);

  if (milestone === undefined) return `milestone_id ${milestoneId}`;

  const name = milestoneMembers.value.find((m) => m.channelId === milestone.channelId)?.name ?? milestone.channelId;

  return milestoneTitle(milestone, name);
}

async function load(): Promise<void> {
  loading.value = true;
  loadError.value = null;

  try {
    const body = await getJson<FootprintsPending>('/footprints/pending');

    pending.value = body.pending;
    changed.value = body.changed;
  } catch (error) {
    loadError.value = error instanceof AdminApiError ? error.message : String(error);
  } finally {
    loading.value = false;
  }
}

async function publishNow(): Promise<void> {
  publishing.value = true;

  try {
    const body = await postJson<{ published: boolean; eventCount?: number; byteLength?: number }>(
      '/footprints/publish',
      {},
    );

    showToast(
      body.published
        ? `公開しました。footprints/events.json（${body.eventCount} 件、${body.byteLength} バイト）`
        : '公開を待っているものがありません',
    );
    await Promise.all([load(), refreshPublishBadge()]);
  } catch (error) {
    showToast(error instanceof AdminApiError ? error.message : String(error));
  } finally {
    publishing.value = false;
  }
}

async function loadGenet(): Promise<void> {
  genetLoading.value = true;
  genetLoadError.value = null;

  try {
    const body = await getJson<GenetPendingResponse>('/genet/pending');

    genetPending.value = body.pending;
    genetChanged.value = body.changed;
    genetShapeOutdated.value = body.shapeOutdated === true;
  } catch (error) {
    genetLoadError.value = error instanceof AdminApiError ? error.message : String(error);
  } finally {
    genetLoading.value = false;
  }
}

async function publishGenetNow(): Promise<void> {
  genetPublishing.value = true;

  try {
    const body = await postJson<GenetPublishResult>('/genet/publish', {});

    showToast(
      body.published
        ? `公開しました。genet/music.json、配信 ${body.streamCount} 件・曲 ${body.tuneCount} 件・人 ${body.personCount} 件、${body.byteLength} バイト`
        : '公開を待っているものがありません',
    );
    await loadGenet();
  } catch (error) {
    showToast(error instanceof AdminApiError ? error.message : String(error));
  } finally {
    genetPublishing.value = false;
  }
}

async function loadMilestones(): Promise<void> {
  milestonesLoading.value = true;
  milestonesLoadError.value = null;

  try {
    milestonesState.value = await getJson<MilestonesPending>('/subscribers/pending');
  } catch (error) {
    milestonesLoadError.value = error instanceof AdminApiError ? error.message : String(error);
  } finally {
    milestonesLoading.value = false;
  }
}

async function loadMilestoneNames(): Promise<void> {
  try {
    const [rows, members] = await Promise.all([
      getJson<{ milestones: SubscriberMilestone[] }>('/subscribers/milestones'),
      getJson<{ members: FootprintsMember[] }>('/members'),
    ]);

    milestoneRows.value = rows.milestones;
    milestoneMembers.value = members.members;
  } catch {
    // The lists fall back to the id alone.
  }
}

async function publishMilestonesNow(): Promise<void> {
  milestonesPublishing.value = true;

  try {
    const body = await postJson<MilestonesPublishResult>('/subscribers/publish', {});

    showToast(
      body.published
        ? `公開しました。subscribers/milestones.json、節目 ${body.milestoneCount} 件、${body.byteLength} バイト`
        : '公開を待っているものがありません',
    );
    await loadMilestones();
  } catch (error) {
    showToast(error instanceof AdminApiError ? error.message : String(error));
  } finally {
    milestonesPublishing.value = false;
  }
}

onMounted(async () => {
  await Promise.all([load(), loadGenet(), loadMilestones(), loadMilestoneNames()]);
});
</script>

<template>
  <div class="main solo">
    <div class="pane">
      <div class="toolbar">
        <h2>公開</h2>
        <span class="grow"></span>
        <span class="sub">公開すると公開用の JSON が作り直されます</span>
      </div>
      <div class="scroller">
        <div style="padding: 16px; display: grid; gap: 13px; max-width: 760px">
          <div v-if="loadError" class="panel flag">
            <h4>読み込めません</h4>
            <div class="hint">{{ loadError }}</div>
          </div>
          <template v-else>
            <div class="panel">
              <h4>いま公開を待っているもの</h4>
              <div class="kv">
                <dt>公開を待っているもの</dt>
                <dd class="num">{{ pending.length }} 件</dd>
                <dt>公開後に変更あり</dt>
                <dd class="num">{{ changed.length }} 件</dd>
              </div>
            </div>
            <div v-if="changed.length > 0" class="panel flag">
              <h4>公開後に変更があった行</h4>
              <div class="hint">{{ CHANGED_ROWS_HINT }}</div>
              <ul class="change-list">
                <li v-for="c in changed" :key="c.eventId">
                  <span class="change-title">{{ c.title }}</span>
                  <span class="chip" :class="footprintsMarkFor('published', c.eventId, footprintsState).tone">{{
                    footprintsMarkFor('published', c.eventId, footprintsState).label
                  }}</span>
                  <RouterLink class="btn" :to="{ path: '/footprints', query: { event: c.eventId } }">
                    できごとの画面へ
                  </RouterLink>
                </li>
              </ul>
            </div>
            <div style="display: flex; gap: 8px; flex-wrap: wrap">
              <button
                class="btn primary"
                type="button"
                :disabled="publishing || loading || !canPublishFootprints(footprintsState)"
                @click="publishNow"
              >
                いま公開する
              </button>
            </div>
            <div v-if="!loading && !canPublishFootprints(footprintsState) && changed.length > 0" class="hint">
              公開を待っているものがありません
            </div>
          </template>

          <div v-if="genetLoadError" class="panel flag">
            <h4>読み込めません</h4>
            <div class="hint">{{ genetLoadError }}</div>
          </div>
          <template v-else>
            <div class="panel">
              <h4>ジェネット楽曲一覧 - いま公開を待っているもの</h4>
              <div class="kv">
                <dt>公開を待っているもの</dt>
                <dd class="num">{{ genetPending.length }} 件</dd>
                <dt>公開後に変更あり</dt>
                <dd class="num">{{ genetChanged.length }} 件</dd>
              </div>
            </div>
            <div v-if="genetChanged.length > 0" class="panel flag">
              <h4>公開後に変更があった行</h4>
              <div class="hint">{{ CHANGED_ROWS_HINT }}曲や人の行は、それを使っている配信の画面で押します。</div>
              <ul class="change-list">
                <li v-for="c in genetChanged" :key="`${c.entity}:${c.key}`">
                  <span class="change-title">{{ entityLabel(c.entity) }}: {{ c.title }}</span>
                  <span
                    class="chip"
                    :class="publishMarkFor('published', isWaiting(genetState, c.entity, c.key)).tone"
                    >{{ publishMarkFor('published', isWaiting(genetState, c.entity, c.key)).label }}</span
                  >
                  <RouterLink class="btn" :to="genetRowLink(c)">{{ genetRowLinkLabel(c) }}</RouterLink>
                </li>
              </ul>
            </div>
            <div v-if="publishesOnlyForShape(genetState)" class="hint">
              公開中のデータは古い形のままです。押すと新しい形で作り直します（中身は変わりません）。
            </div>
            <div style="display: flex; gap: 8px; flex-wrap: wrap">
              <button
                class="btn primary"
                type="button"
                :disabled="genetPublishing || genetLoading || !canPublishGenet(genetState)"
                @click="publishGenetNow"
              >
                ジェネット楽曲一覧をいま公開する
              </button>
            </div>
            <div v-if="!genetLoading && !canPublishGenet(genetState) && genetChanged.length > 0" class="hint">
              公開を待っているものがありません
            </div>
          </template>

          <div v-if="milestonesLoadError" class="panel flag">
            <h4>読み込めません</h4>
            <div class="hint">{{ milestonesLoadError }}</div>
          </div>
          <template v-else-if="milestonesState">
            <div class="panel">
              <h4>登録者数の節目 - いま公開を待っているもの</h4>
              <div class="kv">
                <dt>公開を待っているもの</dt>
                <dd class="num">{{ milestonesState.pending.length }} 件</dd>
                <dt>公開後に変更あり</dt>
                <dd class="num">{{ milestonesState.changed.length }} 件</dd>
                <dt>つないだ出来事の変更</dt>
                <dd class="num">{{ milestonesState.eventChanged.length }} 件</dd>
              </div>
            </div>
            <div v-if="milestonesState.changed.length > 0" class="panel flag">
              <h4>公開後に変更があった行</h4>
              <div class="hint">{{ CHANGED_ROWS_HINT }}</div>
              <ul class="change-list">
                <li v-for="c in milestonesState.changed" :key="c.milestoneId">
                  <span class="change-title">{{ milestoneLabel(c.milestoneId) }}</span>
                  <span class="chip" :class="milestoneMarkFor('published', c.milestoneId, milestonesState).tone">{{
                    milestoneMarkFor('published', c.milestoneId, milestonesState).label
                  }}</span>
                  <RouterLink class="btn" :to="{ path: '/subscribers', query: { milestone: c.milestoneId } }">
                    節目の画面へ
                  </RouterLink>
                </li>
              </ul>
            </div>
            <div v-if="milestonesState.eventChanged.length > 0" class="panel">
              <h4>つないだ出来事が変わった節目</h4>
              <div class="hint">
                あしあとで出来事が公開し直されたか、年表から外れました。「いま公開する」を押すと、節目の JSON
                の出来事を今の年表に合わせます。
              </div>
              <ul class="change-list">
                <li v-for="c in milestonesState.eventChanged" :key="c.milestoneId">
                  <span class="change-title">{{ milestoneLabel(c.milestoneId) }}</span>
                  <RouterLink class="btn" :to="{ path: '/subscribers', query: { milestone: c.milestoneId } }">
                    節目の画面へ
                  </RouterLink>
                </li>
              </ul>
            </div>
            <div v-if="milestonesPublishOnlyForShape(milestonesState)" class="hint">
              公開中のデータは古い形のままです。押すと新しい形で作り直します（中身は変わりません）。
            </div>
            <div style="display: flex; gap: 8px; flex-wrap: wrap">
              <button
                class="btn primary"
                type="button"
                :disabled="milestonesPublishing || milestonesLoading || !canPublishMilestones(milestonesState)"
                @click="publishMilestonesNow"
              >
                登録者数の節目をいま公開する
              </button>
            </div>
            <div
              v-if="!milestonesLoading && !canPublishMilestones(milestonesState) && milestonesState.changed.length > 0"
              class="hint"
            >
              公開を待っているものがありません
            </div>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.change-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 6px;
}

.change-list li {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.change-title {
  min-width: 0;
  overflow-wrap: anywhere;
}

.change-list .btn {
  text-decoration: none;
  color: inherit;
}
</style>
