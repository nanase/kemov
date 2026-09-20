<script setup lang="ts">
import { onMounted, ref } from 'vue';

import { AdminApiError, getJson, postJson } from '../lib/api';
import {
  entityLabel,
  type ChangedGenetEntry,
  type GenetPublishResult,
  type PendingGenetEntry,
} from '../lib/genet-publish';
import { showToast } from '../lib/toast';

/**
 * 運用 > 公開 (#144's task 9, extended by task 14 for ジェネット楽曲一覧).
 * Footprints and genet music each have their own publish gate and their own
 * pending/publish endpoint pair under /admin/api, so this screen loads and
 * publishes them independently - one failing does not block the other.
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

const genetPending = ref<PendingGenetEntry[]>([]);
const genetChanged = ref<ChangedGenetEntry[]>([]);
const genetLoading = ref(false);
const genetLoadError = ref<string | null>(null);
const genetPublishing = ref(false);

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
        ? `公開しました。footprints/events.json（${body.eventCount} 件、${body.byteLength} バイト）`
        : '公開を待っているものがありません',
    );
    await load();
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
    const body = await getJson<{ pending: PendingGenetEntry[]; changed: ChangedGenetEntry[] }>('/genet/pending');

    genetPending.value = body.pending;
    genetChanged.value = body.changed;
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

onMounted(async () => {
  await Promise.all([load(), loadGenet()]);
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
            <div v-if="genetChanged.length > 0" class="panel">
              <h4>公開後に変更があった行</h4>
              <ul style="margin: 0; padding-left: 1.2em">
                <li v-for="c in genetChanged" :key="`${c.entity}:${c.key}`">
                  {{ entityLabel(c.entity) }}: {{ c.title }}
                </li>
              </ul>
            </div>
            <div style="display: flex; gap: 8px; flex-wrap: wrap">
              <button
                class="btn primary"
                type="button"
                :disabled="genetPublishing || genetLoading || (genetPending.length === 0 && genetChanged.length === 0)"
                @click="publishGenetNow"
              >
                ジェネット楽曲一覧をいま公開する
              </button>
            </div>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>
