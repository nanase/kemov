<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';

import { AdminApiError, getJson } from '../lib/api';
import {
  ACTIONS,
  actionLabel,
  ENTITIES,
  entityLabel,
  formatBytes,
  revisionsQuery,
  targetLabel,
  type Publication,
  type Revision,
  type RevisionListItem,
} from '../lib/revisions';
import { jstClock } from '../lib/snapshots';

/**
 * 運用 > 版の履歴 (#144's task 13) - GET /admin/api/revisions[/:id] and
 * GET /admin/api/publications (added alongside this screen). `revision` is
 * append-only (#141's design), so this screen only ever reads; there is
 * nothing here to save.
 */

const revisions = ref<RevisionListItem[]>([]);
const publications = ref<Publication[]>([]);
const loading = ref(false);
const loadError = ref<string | null>(null);
const publicationsLoadError = ref<string | null>(null);

const entityFilter = ref('');
const actionFilter = ref('');
const fromFilter = ref('');
const toFilter = ref('');

const selectedId = ref<number | null>(null);
const detail = ref<Revision | null>(null);
const detailError = ref<string | null>(null);
const detailLoading = ref(false);

// Changing a filter mid-request starts a second, overlapping GET /revisions -
// without this, a slower earlier response can resolve after a faster later
// one and overwrite the list with results for a filter that is no longer
// selected. Each call captures its own generation and only applies a
// response still on the latest one.
let revisionsGeneration = 0;

async function loadRevisions(): Promise<void> {
  loading.value = true;
  loadError.value = null;

  const generation = ++revisionsGeneration;

  try {
    const qs = revisionsQuery({
      entity: entityFilter.value === '' ? null : entityFilter.value,
      action: actionFilter.value === '' ? null : actionFilter.value,
      from: fromFilter.value === '' ? null : fromFilter.value,
      to: toFilter.value === '' ? null : toFilter.value,
    });
    const body = await getJson<{ revisions: RevisionListItem[] }>(`/revisions${qs}`);

    if (generation !== revisionsGeneration) return;

    revisions.value = body.revisions;
  } catch (error) {
    if (generation !== revisionsGeneration) return;

    loadError.value = error instanceof AdminApiError ? error.message : String(error);
  } finally {
    if (generation === revisionsGeneration) loading.value = false;
  }
}

async function loadPublications(): Promise<void> {
  publicationsLoadError.value = null;

  try {
    const body = await getJson<{ publications: Publication[] }>('/publications');

    publications.value = body.publications;
  } catch (error) {
    // Leaves `publications` as it was rather than clearing it to [] - an
    // empty table here reads as "nothing has ever been published", when the
    // truth is this request failed.
    publicationsLoadError.value = error instanceof AdminApiError ? error.message : String(error);
  }
}

async function selectRevision(revisionId: number): Promise<void> {
  selectedId.value = revisionId;
  detail.value = null;
  detailError.value = null;
  detailLoading.value = true;

  try {
    const body = await getJson<{ revision: Revision }>(`/revisions/${revisionId}`);

    // Selecting a different row before this resolves must not let this
    // response - for the row no longer selected - overwrite what the newer
    // selection already loaded.
    if (selectedId.value !== revisionId) return;

    detail.value = body.revision;
  } catch (error) {
    if (selectedId.value !== revisionId) return;

    detailError.value = error instanceof AdminApiError ? error.message : String(error);
  } finally {
    if (selectedId.value === revisionId) detailLoading.value = false;
  }
}

const bodyEntries = computed(() =>
  detail.value?.body === null || detail.value?.body === undefined ? [] : Object.entries(detail.value.body),
);

function formatValue(value: unknown): string {
  if (value === null) return '—';
  if (typeof value === 'object') return JSON.stringify(value);

  return String(value);
}

watch([entityFilter, actionFilter, fromFilter, toFilter], loadRevisions);

onMounted(async () => {
  await loadRevisions();
  await loadPublications();
});
</script>

<template>
  <div class="main" :class="{ detail: selectedId !== null }">
    <div class="pane">
      <div class="toolbar">
        <h2>版の履歴</h2>
        <select v-model="entityFilter" aria-label="entity">
          <option value="">entity すべて</option>
          <option v-for="e in ENTITIES" :key="e" :value="e">{{ entityLabel(e) }}</option>
        </select>
        <select v-model="actionFilter" aria-label="action">
          <option value="">action すべて</option>
          <option v-for="a in ACTIONS" :key="a" :value="a">{{ actionLabel(a) }}</option>
        </select>
        <input v-model="fromFilter" type="text" class="btn" placeholder="from (YYYY-MM-DD)" aria-label="from" />
        <input v-model="toFilter" type="text" class="btn" placeholder="to (YYYY-MM-DD)" aria-label="to" />
        <span class="grow"></span>
        <span class="sub num">{{ revisions.length }} 件</span>
      </div>
      <div class="scroller">
        <div v-if="loadError" class="empty">
          <b>読み込めません</b>
          <div class="sub">{{ loadError }}</div>
        </div>
        <table class="grid">
          <thead>
            <tr>
              <th>日時 (JST)</th>
              <th>entity</th>
              <th>entity_key</th>
              <th>action</th>
              <th>経路</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="r in revisions"
              :key="r.revisionId"
              :aria-selected="r.revisionId === selectedId"
              @click="selectRevision(r.revisionId)"
            >
              <td class="num">{{ jstClock(r.createdAt) }}</td>
              <td>
                <span class="sub">{{ entityLabel(r.entity) }}</span>
              </td>
              <td>
                <span class="clip">{{ r.entityKey }}</span>
              </td>
              <td>
                <span class="sub">{{ actionLabel(r.action) }}</span>
              </td>
              <td>
                <span class="sub">{{ r.createdVia }}</span>
              </td>
            </tr>
          </tbody>
        </table>

        <div class="toolbar" style="margin-top: 18px">
          <h2>公開の記録</h2>
          <span class="grow"></span>
          <span v-if="!publicationsLoadError" class="sub num">{{ publications.length }} 件</span>
        </div>
        <div v-if="publicationsLoadError" class="panel flag">
          <h4>公開の記録を取得できません</h4>
          <div class="hint">{{ publicationsLoadError }}</div>
          <button class="btn" type="button" @click="loadPublications">読み直す</button>
        </div>
        <table v-else class="grid">
          <thead>
            <tr>
              <th>公開日時 (JST)</th>
              <th>対象</th>
              <th>object_key</th>
              <th>大きさ</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in publications" :key="p.publicationId">
              <td class="num">{{ jstClock(p.publishedAt) }}</td>
              <td>
                <span class="sub">{{ targetLabel(p.target) }}</span>
              </td>
              <td>
                <span class="clip">{{ p.objectKey }}</span>
              </td>
              <td class="num sub">{{ formatBytes(p.byteLength) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-if="selectedId !== null" class="inspector">
      <div class="inspector-head">
        <div>
          <h3>版 #{{ selectedId }}</h3>
        </div>
      </div>

      <div class="inspector-body">
        <div v-if="detailError" class="panel flag">
          <h4>読み込めません</h4>
          <div class="hint">{{ detailError }}</div>
        </div>

        <template v-else-if="detail">
          <div class="panel">
            <h4>版の情報</h4>
            <dl class="kv">
              <dt>日時</dt>
              <dd class="num">{{ jstClock(detail.createdAt) }}</dd>
              <dt>entity</dt>
              <dd>{{ entityLabel(detail.entity) }}</dd>
              <dt>entity_key</dt>
              <dd>{{ detail.entityKey }}</dd>
              <dt>action</dt>
              <dd>{{ actionLabel(detail.action) }}</dd>
              <dt>作った経路</dt>
              <dd>{{ detail.createdVia }}</dd>
            </dl>
          </div>

          <div class="panel">
            <h4>内容</h4>
            <div v-if="bodyEntries.length === 0" class="sub">
              {{
                detail.action === 'withdraw' || detail.action === 'delete' ? '（この版には値がありません）' : '空です'
              }}
            </div>
            <dl v-else class="kv">
              <template v-for="[key, value] in bodyEntries" :key="key">
                <dt>{{ key }}</dt>
                <dd>{{ formatValue(value) }}</dd>
              </template>
            </dl>
          </div>
        </template>
      </div>

      <div class="inspector-foot">
        <button class="btn back quiet" type="button" @click="selectedId = null">← 一覧</button>
      </div>
    </div>
  </div>
</template>
