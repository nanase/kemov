<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';

import { AdminApiError, deleteJson, getJson, postJson, putJson } from '../lib/api';
import { jstClock } from '../lib/snapshots';
import {
  addErrorMessage,
  entryPath,
  noteChanged,
  noteFromInput,
  type SourceWhitelistEntry,
} from '../lib/source-whitelist';
import { showToast } from '../lib/toast';

/**
 * 運用 > 出典ホワイトリスト (#175) - `GET`/`POST`/`PUT`/`DELETE
 * /admin/api/source-whitelist`. No inspector panel: the whole list fits on
 * one screen and each row has only a note to edit, so the add form sits above
 * the table and a row's own buttons act in place, the same shape CollectPage
 * has.
 */

const entries = ref<SourceWhitelistEntry[]>([]);
const loading = ref(false);
const loadError = ref<string | null>(null);

const newPrefix = ref('');
const newNote = ref('');
const adding = ref(false);
const addError = ref<string | null>(null);

// One row's note as typed, kept apart from `entries` so that saving another
// row does not throw away a note somebody is still writing.
const drafts = reactive<Record<string, string>>({});
const busyPrefixes = ref<Set<string>>(new Set());
// The row whose 削除 was pressed once. Only one at a time: pressing another
// row's 削除 moves the question there.
const confirming = ref<string | null>(null);

const count = computed(() => entries.value.length);

async function load(): Promise<void> {
  loading.value = true;
  loadError.value = null;

  try {
    const body = await getJson<{ sourceWhitelist: SourceWhitelistEntry[] }>('/source-whitelist');

    entries.value = body.sourceWhitelist;

    for (const entry of body.sourceWhitelist) drafts[entry.prefix] = entry.note ?? '';
  } catch (error) {
    loadError.value = error instanceof AdminApiError ? error.message : String(error);
  } finally {
    loading.value = false;
  }
}

async function add(): Promise<void> {
  adding.value = true;
  addError.value = null;

  try {
    const body = await postJson<{ sourceWhitelist: SourceWhitelistEntry }>('/source-whitelist', {
      prefix: newPrefix.value.trim(),
      note: noteFromInput(newNote.value),
    });

    entries.value.push(body.sourceWhitelist);
    drafts[body.sourceWhitelist.prefix] = body.sourceWhitelist.note ?? '';
    newPrefix.value = '';
    newNote.value = '';
    showToast('足しました');
  } catch (error) {
    addError.value = addErrorMessage(error);
  } finally {
    adding.value = false;
  }
}

async function saveNote(entry: SourceWhitelistEntry): Promise<void> {
  busyPrefixes.value.add(entry.prefix);

  try {
    const body = await putJson<{ sourceWhitelist: SourceWhitelistEntry }>(entryPath(entry.prefix), {
      note: noteFromInput(drafts[entry.prefix] ?? ''),
    });
    const index = entries.value.findIndex((e) => e.prefix === entry.prefix);

    if (index >= 0) entries.value[index] = body.sourceWhitelist;

    drafts[entry.prefix] = body.sourceWhitelist.note ?? '';
    showToast('メモを保存しました');
  } catch (error) {
    showToast(error instanceof AdminApiError ? error.message : String(error));
  } finally {
    busyPrefixes.value.delete(entry.prefix);
  }
}

async function remove(entry: SourceWhitelistEntry): Promise<void> {
  busyPrefixes.value.add(entry.prefix);

  try {
    await deleteJson(entryPath(entry.prefix));
    entries.value = entries.value.filter((e) => e.prefix !== entry.prefix);
    delete drafts[entry.prefix];
    confirming.value = null;
    showToast('削除しました');
  } catch (error) {
    showToast(error instanceof AdminApiError ? error.message : String(error));
  } finally {
    busyPrefixes.value.delete(entry.prefix);
  }
}

onMounted(load);
</script>

<template>
  <div class="main solo">
    <div class="pane" style="flex: 1 1 auto">
      <div class="toolbar">
        <h2>出典ホワイトリスト</h2>
        <span class="grow"></span>
        <span class="sub num">{{ count }} 件</span>
      </div>
      <div class="scroller">
        <div class="content">
          <div class="hint">
            <p>
              この一覧にある URL で始まる出典は 1 つだけでも認められます。ほかの出典は別のサイトのものが 2
              つ以上あれば認められます。
            </p>
            <p>
              削除してもすでに公開したできごとは公開されたままになります。ホワイトリストはこれから公開するときの判定だけに使われます。
            </p>
          </div>

          <form class="panel" @submit.prevent="add">
            <h4>URL を足す</h4>
            <div v-if="addError" class="panel flag" role="alert">
              <div class="hint">{{ addError }}</div>
            </div>
            <div class="row2">
              <div class="field">
                <label for="f-prefix">URL の先頭</label>
                <input
                  id="f-prefix"
                  v-model="newPrefix"
                  type="text"
                  autocomplete="off"
                  placeholder="https://"
                  :aria-invalid="addError !== null"
                />
              </div>
              <div class="field">
                <label for="f-note">メモ（任意）</label>
                <input
                  id="f-note"
                  v-model="newNote"
                  type="text"
                  autocomplete="off"
                  placeholder="承認理由（例: 提携先の発表）"
                />
              </div>
            </div>
            <div class="hint">
              https:// から書いてください。サイト全体なら末尾を /
              にし、単一のページや記事だけならフルパスで書いてください。
            </div>
            <div>
              <button class="btn primary" type="submit" :disabled="adding || newPrefix.trim() === ''">足す</button>
            </div>
          </form>

          <div v-if="loadError" class="empty">
            <b>読み込めません</b>
            <div class="sub">{{ loadError }}</div>
            <button class="btn quiet" type="button" :disabled="loading" @click="load">再読み込み</button>
          </div>
          <div v-else-if="!loading && entries.length === 0" class="empty">
            <b>登録されている URL はありません。</b>
          </div>
          <div v-if="entries.length > 0" class="table-wrap">
            <table class="grid">
              <thead>
                <tr>
                  <th>URL の先頭</th>
                  <th>メモ</th>
                  <th>足した日 (JST)</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="entry in entries" :key="entry.prefix">
                  <td>
                    <span class="clip num" :title="entry.prefix">{{ entry.prefix }}</span>
                  </td>
                  <td class="note-cell">
                    <input
                      v-model="drafts[entry.prefix]"
                      type="text"
                      autocomplete="off"
                      :aria-label="`${entry.prefix} のメモ`"
                    />
                  </td>
                  <td class="num sub">{{ jstClock(entry.createdAt) }}</td>
                  <td>
                    <div class="stack">
                      <button
                        class="btn quiet"
                        type="button"
                        :disabled="busyPrefixes.has(entry.prefix) || !noteChanged(entry, drafts[entry.prefix] ?? '')"
                        @click="saveNote(entry)"
                      >
                        メモを保存
                      </button>
                      <template v-if="confirming === entry.prefix">
                        <span class="hint">公開済みのできごとはそのまま公開されます。</span>
                        <button
                          class="btn danger"
                          type="button"
                          :disabled="busyPrefixes.has(entry.prefix)"
                          @click="remove(entry)"
                        >
                          削除する
                        </button>
                        <button class="btn quiet" type="button" @click="confirming = null">やめる</button>
                      </template>
                      <button
                        v-else
                        class="btn danger"
                        type="button"
                        :disabled="busyPrefixes.has(entry.prefix)"
                        @click="confirming = entry.prefix"
                      >
                        削除
                      </button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
[aria-invalid='true'] {
  border-color: var(--a-danger) !important;
}

.content {
  display: grid;
  gap: 14px;
  padding: 16px;
  max-width: 980px;
}

.hint p {
  margin: 0 0 4px;
}

/* The table stays reachable at a narrow width by scrolling in its own box, the way CollectPage's does. */
.table-wrap {
  overflow-x: auto;
}

.table-wrap table.grid {
  min-width: 720px;
}

.note-cell input {
  width: 100%;
  min-width: 160px;
  background: var(--k-surface);
  border: 1px solid var(--k-line-2);
  border-radius: 6px;
  padding: 4px 8px;
  font-size: 13px;
}
</style>
