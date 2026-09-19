<script setup lang="ts">
import { onMounted, ref } from 'vue';

import { AdminApiError, getJson, postJson } from '../lib/api';
import { kindLabel, targetLabel, type CollectTask } from '../lib/collect-tasks';
import { jstClock } from '../lib/snapshots';
import { showToast } from '../lib/toast';

/**
 * やること > 収集の失敗 (#144's task 13) - GET/POST /admin/api/collect-tasks/*
 * (added alongside this screen). No inspector panel, unlike the data
 * screens: there is nothing here to edit, only three settling actions per
 * row (#141), each a one-click POST followed by a list reload.
 */

const tasks = ref<CollectTask[]>([]);
const loading = ref(false);
const loadError = ref<string | null>(null);
// One row's own action in flight must not re-enable another row's buttons -
// a single busyKey did exactly that, since a second row starting its own
// action stops matching the first row's own comparison.
const busyKeys = ref<Set<string>>(new Set());

function rowKey(task: CollectTask): string {
  return `${task.kind}/${task.targetId}`;
}

// Different rows' actions can overlap (busyKeys allows it), and each one
// reloads on success - an older reload's response must not overwrite a row
// a later action already settled.
let loadRequestId = 0;

async function load(): Promise<void> {
  loading.value = true;
  // Leaves `tasks` as it was rather than clearing it - a reload after a
  // successful action (see `act` below) failing must not hide the list the
  // page already showed; the error panel below reports the failure on top
  // of it instead.
  loadError.value = null;

  const requestId = ++loadRequestId;

  try {
    const body = await getJson<{ collectTasks: CollectTask[] }>('/collect-tasks');

    if (requestId !== loadRequestId) return;

    tasks.value = body.collectTasks;
  } catch (error) {
    if (requestId !== loadRequestId) return;

    loadError.value = error instanceof AdminApiError ? error.message : String(error);
  } finally {
    if (requestId === loadRequestId) loading.value = false;
  }
}

async function act(task: CollectTask, action: 'retry' | 'ack' | 'unavailable', doneMessage: string): Promise<void> {
  const key = rowKey(task);

  busyKeys.value.add(key);

  try {
    await postJson(
      `/collect-tasks/${encodeURIComponent(task.kind)}/${encodeURIComponent(task.targetId)}/${action}`,
      {},
    );
    showToast(doneMessage);
    await load();
  } catch (error) {
    showToast(error instanceof AdminApiError ? error.message : String(error));
  } finally {
    busyKeys.value.delete(key);
  }
}

const retry = (task: CollectTask) => act(task, 'retry', 'いま取り直します');
const ack = (task: CollectTask) => act(task, 'ack', '確認済みにしました');
const markUnavailable = (task: CollectTask) => act(task, 'unavailable', '動画が消えているとして決着しました');

onMounted(load);
</script>

<template>
  <div class="main">
    <div class="pane" style="flex: 1 1 auto">
      <div class="toolbar">
        <h2>収集の失敗</h2>
        <span class="grow"></span>
        <span class="sub num">{{ tasks.length }} 件</span>
      </div>
      <div class="scroller">
        <div v-if="loadError" class="empty">
          <b>読み込めません</b>
          <div class="sub">{{ loadError }}</div>
        </div>
        <div v-else-if="!loading && tasks.length === 0" class="empty">
          <b>失敗している収集はありません</b>
        </div>
        <table v-if="tasks.length > 0" class="grid">
          <thead>
            <tr>
              <th>種別</th>
              <th>対象</th>
              <th>試行回数</th>
              <th>最終更新 (JST)</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="task in tasks" :key="rowKey(task)">
              <td style="white-space: nowrap">
                <span class="sub">{{ kindLabel(task.kind) }}</span>
              </td>
              <td>
                <span class="clip">{{ targetLabel(task) }}</span>
                <div v-if="task.displayName !== null" class="sub num">{{ task.targetId }}</div>
              </td>
              <td class="num">{{ task.attempts }}</td>
              <td class="num sub">{{ jstClock(task.updatedAt) }}</td>
              <td>
                <div class="stack">
                  <button class="btn quiet" type="button" :disabled="busyKeys.has(rowKey(task))" @click="retry(task)">
                    いま取り直す
                  </button>
                  <button class="btn quiet" type="button" :disabled="busyKeys.has(rowKey(task))" @click="ack(task)">
                    確認済みにする
                  </button>
                  <button
                    v-if="!task.isChannelFailure"
                    class="btn danger"
                    type="button"
                    :disabled="busyKeys.has(rowKey(task))"
                    @click="markUnavailable(task)"
                  >
                    動画が消えている
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<style scoped>
/*
 * Unlike the other data screens, this one has no inspector to swap the
 * table for at a narrow width (there is nothing here to edit, only the
 * three action buttons a row already shows) - so the table has to stay
 * reachable on its own. `.scroller`'s own `overflow: auto` already scrolls
 * horizontally; it only needed something to actually overflow it, since
 * `table.grid`'s shared `width: 100%` otherwise just shrinks every column
 * to fit instead.
 */
.scroller table.grid {
  min-width: 640px;
}
</style>
