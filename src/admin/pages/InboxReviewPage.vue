<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';

import FootprintsInspector from '../components/FootprintsInspector.vue';
import GenetStreamReview from '../components/GenetStreamReview.vue';
import { AdminApiError, getJson, postJson } from '../lib/api';
import type { FootprintsMember } from '../lib/footprints';
import {
  moveSelection,
  reviewRows,
  runEach,
  selectionAfterReload,
  type BulkFailure,
  type ReviewInbox,
  type ReviewRow,
} from '../lib/inbox';
import { refreshPublishBadge } from '../lib/publish-badge';
import { publishMarkFor } from '../lib/publish-mark';
import { showToast } from '../lib/toast';

/**
 * やること > 確認待ち (#141): あしあと and ジェネット楽曲一覧 rows nobody has let
 * through yet, in one table. A saved filter, not a screen of its own - the
 * panel is the data screens' own, with 承認 / あとで / 却下 at the bottom.
 * `↑` `↓` move through the rows and `A` approves the one selected.
 */

const inbox = ref<ReviewInbox | null>(null);
const members = ref<FootprintsMember[]>([]);
const loading = ref(false);
const loadError = ref<string | null>(null);
const selectedKey = ref<string | null>(null);
const detail = ref(false);
const ticked = ref<Set<string>>(new Set());
const confirming = ref(false);
const bulkTotal = ref(0);
const bulkDone = ref<number | null>(null);
const failures = ref<BulkFailure[]>([]);
const inspector = ref<{ approve: () => Promise<void> } | null>(null);

const rows = computed(() => (inbox.value === null ? [] : reviewRows(inbox.value)));
const keys = computed(() => rows.value.map((row) => row.key));
const selected = computed(() => rows.value.find((row) => row.key === selectedKey.value) ?? null);
const tickedRows = computed(() => rows.value.filter((row) => ticked.value.has(row.key)));
const allTicked = computed(() => rows.value.length > 0 && rows.value.every((row) => ticked.value.has(row.key)));
const running = computed(() => bulkDone.value !== null);

function titleOf(row: ReviewRow): string {
  if (row.kind === 'event') return row.event.title || '（無題）';

  return row.stream.shortTitle ?? row.stream.title;
}

function member(channelId: string): FootprintsMember | undefined {
  return members.value.find((m) => m.channelId === channelId);
}

let loadGeneration = 0;

async function load(): Promise<void> {
  loading.value = true;
  loadError.value = null;

  const generation = ++loadGeneration;
  const before = keys.value;

  try {
    const body = await getJson<ReviewInbox>('/inbox/review');

    if (generation !== loadGeneration) return;

    inbox.value = body;
    selectedKey.value = selectionAfterReload(before, keys.value, selectedKey.value);
    // A row settled elsewhere is no longer here to act on.
    ticked.value = new Set([...ticked.value].filter((key) => keys.value.includes(key)));

    if (selectedKey.value === null) detail.value = false;
  } catch (error) {
    if (generation !== loadGeneration) return;

    loadError.value = error instanceof AdminApiError ? error.message : String(error);
  } finally {
    if (generation === loadGeneration) loading.value = false;
  }
}

async function loadMembers(): Promise<void> {
  try {
    members.value = (await getJson<{ members: FootprintsMember[] }>('/members')).members;
  } catch {
    // The table falls back to the raw channelId when this fails.
  }
}

function selectRow(key: string): void {
  selectedKey.value = key;
  detail.value = true;
}

function toggleTick(key: string): void {
  const next = new Set(ticked.value);

  if (next.has(key)) next.delete(key);
  else next.add(key);

  ticked.value = next;
}

function toggleAll(): void {
  ticked.value = allTicked.value ? new Set() : new Set(keys.value);
}

function approveRow(row: ReviewRow): Promise<unknown> {
  return row.kind === 'event'
    ? postJson(`/footprints/events/${row.event.eventId}/publish`, {})
    : postJson(`/genet/streams/${encodeURIComponent(row.stream.videoId)}/publish`, {});
}

/** まとめて承認: each row the way a single 承認 sends it, carrying on past one that is refused. */
async function approveTicked(): Promise<void> {
  confirming.value = false;

  const targets = tickedRows.value;

  bulkTotal.value = targets.length;
  bulkDone.value = 0;
  failures.value = [];

  const failed = await runEach(
    targets,
    async (row) => {
      await approveRow(row);
    },
    (row) => ({ key: row.key, title: titleOf(row) }),
    (done) => (bulkDone.value = done),
  );

  failures.value = failed;
  ticked.value = new Set(failed.map((f) => f.key));
  bulkDone.value = null;
  showToast(
    failed.length === 0
      ? `${targets.length} 件を承認しました。「公開待ち」で「いま公開する」を押すと本番に反映されます`
      : `${targets.length - failed.length} 件を承認しました。${failed.length} 件は通りませんでした`,
  );
  await Promise.all([load(), refreshPublishBadge()]);
}

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
  );
}

async function onKeydown(event: KeyboardEvent): Promise<void> {
  if (event.altKey || event.ctrlKey || event.metaKey || isTyping(event.target)) return;
  if (confirming.value || running.value || document.querySelector('.picker') !== null) return;

  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    selectedKey.value = moveSelection(keys.value, selectedKey.value, event.key === 'ArrowDown' ? 1 : -1);
    await nextTick();
    document.querySelector('tr[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });

    return;
  }

  if (event.key.toLowerCase() === 'a' && inspector.value !== null) {
    event.preventDefault();
    await inspector.value.approve();
  }
}

onMounted(() => {
  load();
  loadMembers();
  document.addEventListener('keydown', onKeydown);
});

onUnmounted(() => document.removeEventListener('keydown', onKeydown));
</script>

<template>
  <div class="main" :class="{ detail, solo: selected === null }">
    <div class="pane">
      <div class="toolbar">
        <h2>確認待ち</h2>
        <span class="chip review num">{{ rows.length }} 件</span>
        <span class="grow"></span>
        <div class="keys">
          <span><kbd>↑</kbd><kbd>↓</kbd> 選ぶ</span><span><kbd>A</kbd> 承認</span>
        </div>
      </div>
      <div class="scroller">
        <div v-if="loadError" class="empty">
          <b>読み込めません</b>
          <div class="sub">{{ loadError }}</div>
          <button class="btn quiet" type="button" :disabled="loading" @click="load">再読み込み</button>
        </div>
        <div v-if="failures.length > 0" class="panel flag failures">
          <h4>通らなかった行が {{ failures.length }} 件あります</h4>
          <ul>
            <li v-for="f in failures" :key="f.key">
              <b>{{ f.title }}</b> <span class="sub">{{ f.message }}</span>
            </li>
          </ul>
          <div>
            <button class="btn quiet" type="button" @click="failures = []">閉じる</button>
          </div>
        </div>
        <table v-if="!loadError" class="grid">
          <thead>
            <tr>
              <th class="tick">
                <input
                  type="checkbox"
                  :checked="allTicked"
                  :disabled="rows.length === 0 || running"
                  aria-label="すべて選ぶ"
                  @change="toggleAll"
                />
              </th>
              <th>ページ</th>
              <th>日付</th>
              <th>題</th>
              <th>メンバー・曲数</th>
              <th>状態</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="!loading && inbox !== null && rows.length === 0">
              <td colspan="6">
                <div class="empty"><b>確認を待っている行はありません</b></div>
              </td>
            </tr>
            <tr
              v-for="row in rows"
              :key="row.key"
              :aria-selected="row.key === selectedKey"
              tabindex="0"
              @click="selectRow(row.key)"
              @keydown.enter="selectRow(row.key)"
            >
              <td class="tick" @click.stop>
                <input
                  type="checkbox"
                  :checked="ticked.has(row.key)"
                  :disabled="running"
                  aria-label="選ぶ"
                  @change="toggleTick(row.key)"
                />
              </td>
              <td>
                <span class="chip">{{ row.kind === 'event' ? 'あしあと' : '楽曲一覧' }}</span>
              </td>
              <td class="num sub">{{ row.date }}</td>
              <td>
                <span class="clip">{{ titleOf(row) }}</span>
              </td>
              <td>
                <span v-if="row.kind === 'stream'" class="sub">{{ row.stream.performances.length }} 曲</span>
                <span v-else class="stack">
                  <span v-if="row.event.channelIds.length === 0" class="sub">—</span>
                  <span v-for="id in row.event.channelIds" v-else :key="id" class="who-chip">
                    <i :style="{ background: member(id)?.colorKey ?? '#9b9289' }"></i
                    ><span class="sub">{{ member(id)?.name ?? id }}</span>
                  </span>
                </span>
              </td>
              <td>
                <span v-if="row.kind === 'event' && row.event.sourcePending" class="chip alarm">出典の確認待ち</span>
                <span v-else class="chip" :class="publishMarkFor(row.status, false).tone">{{
                  publishMarkFor(row.status, false).label
                }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-if="ticked.size > 0 || running" class="bulkbar">
        <span v-if="running" class="num">{{ bulkDone }} / {{ bulkTotal }} 件を承認中</span>
        <template v-else>
          <span class="num">{{ ticked.size }} 件を選択中</span>
          <button class="btn primary" type="button" @click="confirming = true">まとめて承認して公開待ちにする</button>
          <button class="btn" type="button" @click="ticked = new Set()">選択を外す</button>
        </template>
      </div>
    </div>

    <template v-if="selected">
      <FootprintsInspector
        v-if="selected.kind === 'event'"
        ref="inspector"
        :key="selected.key"
        :event="selected.event"
        :members="members"
        :pending="null"
        mode="review"
        @changed="load"
        @back="detail = false"
      />
      <GenetStreamReview
        v-else
        ref="inspector"
        :key="selected.key"
        :stream="selected.stream"
        :tune-titles="inbox?.tuneTitles ?? {}"
        @changed="load"
        @back="detail = false"
      />
    </template>

    <div v-if="confirming" class="picker" @mousedown.self="confirming = false">
      <div class="picker-box" role="dialog" aria-label="まとめて承認">
        <div class="picker-head">{{ tickedRows.length }} 件を承認して公開待ちにします</div>
        <div class="picker-body">
          <div class="sub">本番への反映は、このあと「公開待ち」で「いま公開する」を押したときです</div>
        </div>
        <div class="picker-foot">
          <button class="btn primary" type="button" @click="approveTicked">承認する</button>
          <button class="btn" type="button" @click="confirming = false">やめる</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Six columns beside the panel: a shorter title keeps 状態 in view at 1280px. */
.clip {
  max-width: 22ch;
}

.failures {
  margin: 10px 14px;
}

.failures ul {
  margin: 0;
  padding-left: 1.2em;
  display: grid;
  gap: 3px;
  font-size: 12.5px;
}
</style>
