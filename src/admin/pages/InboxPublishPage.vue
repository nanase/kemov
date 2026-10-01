<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';

import { AdminApiError, getJson, postJson } from '../lib/api';
import {
  canPublishAny,
  plainTitle,
  publishItemLink,
  publishItemMark,
  publishItemPage,
  type PublishInbox,
  type PublishItem,
} from '../lib/inbox';
import { refreshPublishBadge } from '../lib/publish-badge';
import { showToast } from '../lib/toast';

/**
 * やること > 公開待ち (#141, #185): what the next 「いま公開する」 puts on the
 * site or takes off it, across あしあと, ジェネット楽曲一覧 and 登録者数の節目,
 * and the button itself. The 公開 screen keeps a button per public JSON; this
 * one runs whichever of them has something to do.
 */

const inbox = ref<PublishInbox | null>(null);
const loading = ref(false);
const loadError = ref<string | null>(null);
const publishing = ref(false);

const items = computed(() => inbox.value?.items ?? []);

async function load(): Promise<void> {
  loading.value = true;
  loadError.value = null;

  try {
    inbox.value = await getJson<PublishInbox>('/inbox/publish');
  } catch (error) {
    loadError.value = error instanceof AdminApiError ? error.message : String(error);
  } finally {
    loading.value = false;
  }
}

/** A tune's title is Markdown, read here as the text it shows - a link in a table cell would only get in the way. */
function titleOf(item: PublishItem): string {
  const title = item.title ?? '';

  return item.entity === 'genet_tune' ? plainTitle(title) : title;
}

async function publishNow(): Promise<void> {
  if (inbox.value === null) return;

  publishing.value = true;

  const { canPublish } = inbox.value;
  const done: string[] = [];

  try {
    if (canPublish.footprints) {
      const body = await postJson<{ published: boolean; eventCount?: number }>('/footprints/publish', {});

      if (body.published) done.push(`あしあと ${body.eventCount} 件`);
    }

    if (canPublish.genet) {
      const body = await postJson<{ published: boolean; streamCount?: number }>('/genet/publish', {});

      if (body.published) done.push(`ジェネット楽曲一覧 配信 ${body.streamCount} 件`);
    }

    if (canPublish.milestones) {
      const body = await postJson<{ published: boolean; milestoneCount?: number }>('/subscribers/publish', {});

      if (body.published) done.push(`登録者数の節目 ${body.milestoneCount} 件`);
    }

    showToast(done.length === 0 ? '公開を待っているものがありません' : `公開しました。${done.join('、')}`);
  } catch (error) {
    // The ones before it may already be live; reading the list again shows which.
    showToast(error instanceof AdminApiError ? error.message : String(error));
  } finally {
    publishing.value = false;
    await Promise.all([load(), refreshPublishBadge()]);
  }
}

onMounted(load);
</script>

<template>
  <div class="main solo">
    <div class="pane">
      <div class="toolbar">
        <h2>公開待ち</h2>
        <span class="chip review num">{{ items.length }} 件</span>
      </div>
      <div class="scroller">
        <div v-if="loadError" class="empty">
          <b>読み込めません</b>
          <div class="sub">{{ loadError }}</div>
          <button class="btn quiet" type="button" :disabled="loading" @click="load">再読み込み</button>
        </div>
        <table v-else class="grid">
          <thead>
            <tr>
              <th>ページ</th>
              <th>日付</th>
              <th>題</th>
              <th>状態</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="inbox !== null && items.length === 0">
              <td colspan="5">
                <div class="empty"><b>公開を待っているものはありません</b></div>
              </td>
            </tr>
            <tr v-for="item in items" :key="`${item.entity}:${item.key}`" class="still">
              <td>
                <span class="chip">{{ publishItemPage(item) }}</span>
              </td>
              <td class="num sub">{{ item.date ?? '—' }}</td>
              <td>
                <span v-if="item.title === null" class="sub">（削除済み）</span>
                <span v-else class="clip">{{ titleOf(item) }}</span>
              </td>
              <td>
                <span class="chip" :class="publishItemMark(item).tone">{{ publishItemMark(item).label }}</span>
              </td>
              <td>
                <RouterLink v-if="item.title !== null" class="btn quiet" :to="publishItemLink(item)">開く</RouterLink>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="bulkbar">
        <button
          class="btn primary"
          type="button"
          :disabled="publishing || loading || inbox === null || !canPublishAny(inbox)"
          @click="publishNow"
        >
          いま公開する
        </button>
        <span v-if="inbox !== null && items.length === 0 && canPublishAny(inbox)" class="sub">
          公開中のデータは古い形のままです。押すと新しい形で作り直します（中身は変わりません）。
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
table.grid tbody tr.still {
  cursor: default;
}
</style>
