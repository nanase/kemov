<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';

import { AdminApiError, deleteJson, getJson, putJson } from '../lib/api';
import {
  AVAILABILITIES,
  AVAILABILITY_LABEL,
  emptyOverrideFields,
  fieldForSaveError,
  overridesNothing,
  toOverrideFormFields,
  TYPE_LABEL,
  TYPES,
  type CollectedVideo,
  type OverrideFieldKey,
  type OverrideFormFields,
  type VideoOverride,
} from '../lib/videos';
import { showToast } from '../lib/toast';

/**
 * 配信・動画 (#144's data screens task). The table lists every collected
 * video (`GET /admin/api/videos`, added alongside this screen - #158 only
 * gave this project `video_override`'s own CRUD, with no way to browse what
 * it could override). The edit panel shows each of title/type/availability
 * next to its collected value with a toggle, the same `.ov` row the mock
 * gives this screen; turning every toggle off and saving deletes the
 * override rather than sending a PUT that would itself be refused (400).
 */

const videos = ref<CollectedVideo[]>([]);
const overrideByVideoId = ref<Map<string, VideoOverride>>(new Map());
const loading = ref(false);
const loadError = ref<string | null>(null);
const q = ref('');

const selectedId = ref<string | null>(null);
const detail = ref(false);

const fields = ref<OverrideFormFields>(emptyOverrideFields());
const saving = ref(false);
const errorMessage = ref<string | null>(null);
const errorField = ref<OverrideFieldKey | null>(null);

const selected = computed(() => videos.value.find((v) => v.videoId === selectedId.value) ?? null);
const selectedOverride = computed(() =>
  selectedId.value === null ? null : (overrideByVideoId.value.get(selectedId.value) ?? null),
);

watch(selected, (video) => {
  errorMessage.value = null;
  errorField.value = null;

  if (video === null) {
    fields.value = emptyOverrideFields();

    return;
  }

  const override = overrideByVideoId.value.get(video.videoId);

  fields.value = override === undefined ? emptyOverrideFields() : toOverrideFormFields(override);
});

async function fetchOverrides(): Promise<Map<string, VideoOverride>> {
  const body = await getJson<{ videoOverrides: VideoOverride[] }>('/video-overrides');

  return new Map(body.videoOverrides.map((o) => [o.videoId, o]));
}

// The search box debounces when load() starts, not how many are in flight -
// a load already waiting on a slow response is not cancelled by the next
// keystroke's timer, so two can still resolve out of order. Each call
// captures its own generation and only applies a response still on it.
let loadRequestId = 0;

async function load(): Promise<void> {
  loading.value = true;
  loadError.value = null;

  const requestId = ++loadRequestId;

  try {
    const query = q.value.trim() === '' ? '' : `?q=${encodeURIComponent(q.value.trim())}`;
    const body = await getJson<{ videos: CollectedVideo[] }>(`/videos${query}`);

    // Before videos.value changes, not after: that assignment is what fires
    // watch(selected, ...) below (selected depends on videos.value), and
    // that watcher reads overrideByVideoId.value directly rather than
    // through a computed of its own - so it would otherwise still see the
    // old map. Fetched but not committed until the generation check below,
    // so a stale response can't overwrite a newer load's already-committed map.
    const overrides = await fetchOverrides();

    if (requestId !== loadRequestId) return;

    overrideByVideoId.value = overrides;
    videos.value = body.videos;

    if (selectedId.value === null && videos.value.length > 0) {
      selectedId.value = videos.value[0]!.videoId;
    } else if (selectedId.value !== null && !videos.value.some((v) => v.videoId === selectedId.value)) {
      selectedId.value = videos.value.length > 0 ? videos.value[0]!.videoId : null;
      detail.value = false;
    }
  } catch (error) {
    if (requestId !== loadRequestId) return;

    loadError.value = error instanceof AdminApiError ? error.message : String(error);
  } finally {
    if (requestId === loadRequestId) loading.value = false;
  }
}

function selectRow(videoId: string): void {
  selectedId.value = videoId;
  detail.value = true;
}

function back(): void {
  detail.value = false;
}

function toggle(key: OverrideFieldKey, collectedValue: string | null): void {
  if (fields.value[key] === null) {
    fields.value[key] = collectedValue ?? '';
  } else {
    fields.value[key] = null;
  }
}

async function save(): Promise<void> {
  if (selectedId.value === null) return;

  saving.value = true;
  errorMessage.value = null;
  errorField.value = null;

  try {
    if (overridesNothing(fields.value)) {
      if (overrideByVideoId.value.has(selectedId.value)) {
        await deleteJson(`/video-overrides/${encodeURIComponent(selectedId.value)}`);
        showToast('上書きを消しました');
      }
    } else {
      await putJson(`/video-overrides/${encodeURIComponent(selectedId.value)}`, fields.value);
      showToast('保存しました');
    }

    await load();
  } catch (error) {
    if (error instanceof AdminApiError) {
      errorMessage.value = error.message;
      errorField.value = fieldForSaveError(error.message);
    } else {
      errorMessage.value = String(error);
    }
  } finally {
    saving.value = false;
  }
}

async function removeOverride(): Promise<void> {
  if (selectedId.value === null) return;

  saving.value = true;

  try {
    await deleteJson(`/video-overrides/${encodeURIComponent(selectedId.value)}`);
    await load();
    showToast('上書きを消しました');
  } catch (error) {
    errorMessage.value = error instanceof AdminApiError ? error.message : String(error);
  } finally {
    saving.value = false;
  }
}

let searchTimer: ReturnType<typeof setTimeout> | null = null;

watch(q, () => {
  if (searchTimer !== null) clearTimeout(searchTimer);
  searchTimer = setTimeout(load, 300);
});

onMounted(load);
</script>

<template>
  <div class="main" :class="{ detail }">
    <div class="pane">
      <div class="toolbar">
        <h2>配信・動画</h2>
        <span class="chip">収集した記録</span>
        <input v-model="q" type="text" class="btn" placeholder="題で絞り込み" aria-label="題で絞り込み" />
        <span class="grow"></span>
        <span class="sub num">{{ videos.length }} 件</span>
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
              <th>タイトル</th>
              <th>公開</th>
              <th>種別</th>
              <th>公開状況</th>
              <th>上書き</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="v in videos"
              :key="v.videoId"
              :aria-selected="v.videoId === selectedId"
              tabindex="0"
              @click="selectRow(v.videoId)"
              @keydown.enter="selectRow(v.videoId)"
              @keydown.space.prevent="selectRow(v.videoId)"
            >
              <td>
                <span class="clip">{{ v.title }}</span>
              </td>
              <td class="num sub">{{ v.publishedAt.slice(0, 10) }}</td>
              <td>
                <span class="sub">{{ v.type ? TYPE_LABEL[v.type] : '—' }}</span>
              </td>
              <td>
                <span class="sub">{{ AVAILABILITY_LABEL[v.availability] }}</span>
              </td>
              <td><span v-if="v.hasOverride" class="chip review">上書きあり</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-if="selected" class="inspector">
      <div class="inspector-head">
        <div style="flex: 1 1 auto; min-width: 0">
          <h3>{{ selectedOverride?.title ?? selected.title }}</h3>
          <div class="stack" style="margin-top: 4px">
            <span class="num sub">{{ selected.videoId }}</span>
          </div>
        </div>
      </div>

      <div class="inspector-body">
        <div v-if="errorMessage" class="panel flag">
          <h4>保存できません</h4>
          <div class="hint">{{ errorMessage }}</div>
        </div>

        <div v-if="!overridesNothing(fields)" class="hint">3つとも外して保存すると、上書きを消します</div>

        <div
          class="panel"
          :class="{ flag: errorField === 'title' || errorField === 'type' || errorField === 'availability' }"
        >
          <h4>収集した値と、上書き</h4>

          <div class="ov">
            <span class="k">タイトル</span>
            <span class="vals">
              <span class="collected" :class="{ struck: fields.title !== null }">{{ selected.title }}</span>
              <input v-if="fields.title !== null" v-model="fields.title" type="text" aria-label="タイトルの上書き" />
            </span>
            <button
              class="toggle"
              type="button"
              :aria-pressed="fields.title !== null"
              aria-label="タイトルを上書きする"
              @click="toggle('title', selected.title)"
            ></button>
          </div>

          <div class="ov">
            <span class="k">種別</span>
            <span class="vals">
              <span class="collected" :class="{ struck: fields.type !== null }">{{
                selected.type ? TYPE_LABEL[selected.type] : '—'
              }}</span>
              <select v-if="fields.type !== null" v-model="fields.type" aria-label="種別の上書き">
                <option v-for="t in TYPES" :key="t" :value="t">{{ TYPE_LABEL[t] }}</option>
              </select>
            </span>
            <button
              class="toggle"
              type="button"
              :aria-pressed="fields.type !== null"
              aria-label="種別を上書きする"
              @click="toggle('type', selected.type)"
            ></button>
          </div>

          <div class="ov">
            <span class="k">公開状況</span>
            <span class="vals">
              <span class="collected" :class="{ struck: fields.availability !== null }">{{
                AVAILABILITY_LABEL[selected.availability]
              }}</span>
              <select v-if="fields.availability !== null" v-model="fields.availability" aria-label="公開状況の上書き">
                <option v-for="a in AVAILABILITIES" :key="a" :value="a">{{ AVAILABILITY_LABEL[a] }}</option>
              </select>
            </span>
            <button
              class="toggle"
              type="button"
              :aria-pressed="fields.availability !== null"
              aria-label="公開状況を上書きする"
              @click="toggle('availability', selected.availability)"
            ></button>
          </div>
        </div>

        <div class="field">
          <label for="f-memo">メモ（公開されません）</label>
          <textarea id="f-memo" v-model="fields.memo"></textarea>
        </div>
      </div>

      <div class="inspector-foot">
        <button class="btn primary" type="button" :disabled="saving" @click="save">保存</button>
        <button class="btn back quiet" type="button" @click="back">← 一覧</button>
        <span class="grow"></span>
        <template v-if="selectedOverride">
          <span class="foot-sep" aria-hidden="true"></span>
          <button class="btn danger" type="button" :disabled="saving" @click="removeOverride">上書きを消す</button>
        </template>
      </div>
    </div>
  </div>
</template>
