<script setup lang="ts">
import { onMounted, ref } from 'vue';

import { AdminApiError, getJson, postJson } from '../lib/api';
import { showToast } from '../lib/toast';

/**
 * 運用 > 公開 (#144's task 9, "PR" of the handoff's commit 4). Genet music's
 * own publish gate exists (genet-publish worktree) but has no PR yet, so
 * this screen only ever shows footprints - #144's handoff is explicit that
 * no ジェネット楽曲一覧 section belongs here until that lands on main.
 */

interface PendingEntry {
  eventId: number;
  latestAction: string;
}

interface ChangedEntry {
  eventId: number;
  title: string;
}

const pending = ref<PendingEntry[]>([]);
const changed = ref<ChangedEntry[]>([]);
const loading = ref(false);
const loadError = ref<string | null>(null);
const publishing = ref(false);

async function load(): Promise<void> {
  loading.value = true;
  loadError.value = null;

  try {
    const body = await getJson<{ pending: PendingEntry[]; changed: ChangedEntry[] }>('/footprints/pending');

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
        ? `公開しました。footprints/events.json、${body.eventCount} 件、${body.byteLength} バイト`
        : '公開を待っているものがありません',
    );
    await load();
  } catch (error) {
    showToast(error instanceof AdminApiError ? error.message : String(error));
  } finally {
    publishing.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="main solo">
    <div class="pane">
      <div class="toolbar">
        <h2>公開</h2>
        <span class="grow"></span>
        <span class="sub">公開すると、公開用の JSON を作り直します</span>
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
            <div v-if="changed.length > 0" class="panel">
              <h4>公開後に変更があった行</h4>
              <ul style="margin: 0; padding-left: 1.2em">
                <li v-for="c in changed" :key="c.eventId">{{ c.title }}</li>
              </ul>
            </div>
            <div style="display: flex; gap: 8px; flex-wrap: wrap">
              <button
                class="btn primary"
                type="button"
                :disabled="publishing || loading || (pending.length === 0 && changed.length === 0)"
                @click="publishNow"
              >
                いま公開する
              </button>
            </div>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>
