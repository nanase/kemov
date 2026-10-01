<script setup lang="ts">
import { computed, ref } from 'vue';
import { RouterLink } from 'vue-router';

import MarkDown from '../../components/genet/MarkDown.vue';
import { AdminApiError, deleteJson, postJson } from '../lib/api';
import { clock } from '../lib/genet-markdown';
import { SCENE_STYLE_LABEL, type GenetStream, type SceneStyle } from '../lib/genet-streams';
import { APPROVED_TOAST, DEFERRED_TOAST, firstStart, jstDate, REJECTED_TOAST } from '../lib/inbox';
import { refreshPublishBadge } from '../lib/publish-badge';
import { publishMarkFor } from '../lib/publish-mark';
import { showToast } from '../lib/toast';

/**
 * 確認待ち's panel for one ジェネット楽曲一覧 stream (#141). A stream does not
 * fit the narrow panel the other screens edit in, so this only reads it out -
 * the tunes, where each starts, and the memo the draft was written with - and
 * leads to the stream's own screen for any change. A stream in 確認待ち is
 * never published, so its chip needs no pending list.
 */
const props = defineProps<{
  stream: GenetStream;
  tuneTitles: Record<string, string>;
}>();
const emit = defineEmits<{ changed: []; back: [] }>();

const busy = ref(false);
const errorMessage = ref<string | null>(null);

const mark = computed(() => publishMarkFor(props.stream.status, false));
const withoutStart = computed(() => props.stream.performances.filter((p) => firstStart(p) === null).length);

function styleLabel(style: string): string {
  return SCENE_STYLE_LABEL[style as SceneStyle] ?? style;
}

async function settle(action: () => Promise<unknown>, toast: string): Promise<void> {
  // `A` reaches approve without the button, which is what otherwise stops a second press.
  if (busy.value) return;

  busy.value = true;
  errorMessage.value = null;

  try {
    await action();
    emit('changed');
    void refreshPublishBadge();
    showToast(toast);
  } catch (error) {
    errorMessage.value = error instanceof AdminApiError ? error.message : String(error);
  } finally {
    busy.value = false;
  }
}

const path = computed(() => `/genet/streams/${encodeURIComponent(props.stream.videoId)}`);

const approve = () => settle(() => postJson(`${path.value}/publish`, {}), APPROVED_TOAST);
const defer = () => settle(() => postJson(`${path.value}/defer`, {}), DEFERRED_TOAST);
const reject = () => settle(() => deleteJson(path.value), REJECTED_TOAST);

defineExpose({ approve });
</script>

<template>
  <div class="inspector">
    <div class="inspector-head">
      <div style="flex: 1 1 auto; min-width: 0">
        <h3>{{ stream.shortTitle ?? stream.title }}</h3>
        <div class="stack" style="margin-top: 4px">
          <span class="chip" :class="mark.tone">{{ mark.label }}</span>
          <span class="sub num">{{ jstDate(stream.publishedAt) }}</span>
          <span v-for="c in stream.categories" :key="c" class="chip kind">{{ c }}</span>
        </div>
      </div>
    </div>

    <div class="inspector-body">
      <div v-if="errorMessage" class="panel flag">
        <h4>保存できません</h4>
        <div class="hint">{{ errorMessage }}</div>
      </div>

      <div v-if="withoutStart > 0" class="panel flag">
        <h4>時刻が入っていない曲が {{ withoutStart }} 件</h4>
      </div>

      <div class="panel">
        <h4>曲 {{ stream.performances.length }} 件</h4>
        <div v-for="(p, i) in stream.performances" :key="i" class="ov tune-row">
          <span class="k num">{{ i + 1 }}</span>
          <span class="vals">
            <span class="collected"><MarkDown :source="tuneTitles[String(p.tuneId)] ?? `曲 ${p.tuneId}`" /></span>
            <span class="sub">{{ p.scenes.map((s) => styleLabel(s.style)).join('・') }}</span>
          </span>
          <span class="num sub">{{ firstStart(p) === null ? '—' : clock(firstStart(p)!) }}</span>
        </div>
        <span v-if="stream.performances.length === 0" class="sub">まだ 1 曲も入っていません</span>
      </div>

      <div v-if="stream.memo" class="field">
        <label>メモ（公開されません）</label>
        <div class="memo">{{ stream.memo }}</div>
      </div>

      <div>
        <RouterLink class="btn" :to="{ path: '/sets', query: { video: stream.videoId } }"
          >編集の画面をひらく</RouterLink
        >
      </div>
    </div>

    <div class="inspector-foot">
      <button class="btn primary" type="button" :disabled="busy" @click="approve">承認して公開待ちにする</button>
      <button class="btn" type="button" :disabled="busy" @click="defer">あとで</button>
      <button class="btn back quiet" type="button" @click="emit('back')">← 一覧</button>
      <span class="grow"></span>
      <span class="foot-sep" aria-hidden="true"></span>
      <button class="btn danger" type="button" :disabled="busy" @click="reject">却下</button>
    </div>
  </div>
</template>

<style scoped>
.tune-row {
  grid-template-columns: 20px minmax(0, 1fr) auto;
}

.tune-row :deep(p) {
  margin: 0;
}

.memo {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-size: 12.5px;
  background: var(--k-surface);
  border: 1px solid var(--k-line-2);
  border-radius: 6px;
  padding: 5px 8px;
  max-height: 40vh;
  overflow: auto;
}
</style>
