<script setup lang="ts">
import { computed, ref } from 'vue';
import { RouterLink } from 'vue-router';

import { markdownHtml } from '@/lib/genet/musicSong';

import { deleteJson, postJson } from '../lib/api';
import { useCrumbDetail } from '../lib/crumb';
import { SAVE_TOAST } from '../lib/editing';
import { footprintsMarkFor, type PublishBand } from '../lib/footprints-publish';
import { clock } from '../lib/genet-markdown';
import { streamAnswerFor } from '../lib/genet-publish';
import { SCENE_STYLE_LABEL, toFormFields, type GenetStream, type SceneStyle } from '../lib/genet-streams';
import { firstStart, jstDate, REJECTED_TOAST } from '../lib/inbox';
import { refreshPublishBadge } from '../lib/publish-badge';
import { showToast } from '../lib/toast';

import SplitHandle from './SplitHandle.vue';

/**
 * 確認待ち's panel for one ジェネット楽曲一覧 stream (#141). A stream does not
 * fit the narrow panel the other screens edit in, so this only reads it out -
 * the tunes, where each starts, and the memo the draft was written with - and
 * leads to the stream's own screen for any change. 承認 is the stream's
 * 「公開」, which reaches the public JSON at once (#284).
 */
const props = defineProps<{
  stream: GenetStream;
  tuneTitles: Record<string, string>;
}>();
const emit = defineEmits<{ changed: []; back: [] }>();

const busy = ref(false);
const band = ref<PublishBand | null>(null);

const mark = computed(() => footprintsMarkFor(props.stream.status));
const withoutStart = computed(() => props.stream.performances.filter((p) => firstStart(p) === null).length);

function styleLabel(style: string): string {
  return SCENE_STYLE_LABEL[style as SceneStyle] ?? style;
}

/**
 * Runs `request`, then says what came of it as the stream's own screen does
 * (`streamAnswerFor`): a toast when it went through, otherwise the band.
 * The list is read again whenever the stream may have changed.
 */
async function settle(request: () => Promise<unknown>, toast: string): Promise<void> {
  // `A` reaches approve without the button, which is what otherwise stops a second press.
  if (busy.value) return;

  let error: unknown = null;

  busy.value = true;
  band.value = null;

  try {
    await request();
  } catch (caught) {
    error = caught;
  } finally {
    busy.value = false;
  }

  const answer = streamAnswerFor('publish', props.stream.status, error);

  if (answer.kind === 'done') {
    emit('changed');
    void refreshPublishBadge();
    showToast(toast);

    return;
  }

  band.value = answer.band;

  if (answer.changed) {
    emit('changed');
    void refreshPublishBadge();
  }
}

const path = computed(() => `/genet/streams/${encodeURIComponent(props.stream.videoId)}`);

// The fields as they were read: 承認 publishes the stream as it stands.
const approve = () => settle(() => postJson(`${path.value}/publish`, toFormFields(props.stream)), SAVE_TOAST.publish);
const reject = () => settle(() => deleteJson(path.value), REJECTED_TOAST);

defineExpose({ approve });

useCrumbDetail(() => props.stream.shortTitle ?? props.stream.title);
</script>

<template>
  <div class="inspector">
    <SplitHandle />
    <div class="inspector-head">
      <div>
        <h3>{{ stream.shortTitle ?? stream.title }}</h3>
        <div class="stack">
          <span class="chip" :class="mark.tone">{{ mark.label }}</span>
          <span class="sub num">{{ jstDate(stream.publishedAt) }}</span>
          <span v-for="c in stream.categories" :key="c" class="chip kind">{{ c }}</span>
        </div>
      </div>
    </div>

    <div class="inspector-body">
      <div v-if="band" class="panel flag" role="alert">
        <h4>{{ band.title }}</h4>
        <ul v-if="band.lines.length > 0" class="reasons">
          <li v-for="(line, i) in band.lines" :key="i">{{ line }}</li>
        </ul>
        <div v-if="band.note" class="hint">{{ band.note }}</div>
      </div>

      <div v-if="withoutStart > 0" class="panel flag">
        <h4>時刻が入っていない曲が {{ withoutStart }} 件</h4>
      </div>

      <div class="panel span2">
        <h4>曲 {{ stream.performances.length }} 件</h4>
        <div v-for="(p, i) in stream.performances" :key="i" class="ov tune-row">
          <span class="k num">{{ i + 1 }}</span>
          <span class="vals">
            <span class="collected" v-html="markdownHtml(tuneTitles[String(p.tuneId)] ?? `曲 ${p.tuneId}`, [])"></span>
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
      <button class="btn primary" type="button" :disabled="busy" @click="approve">承認</button>
      <button class="btn back quiet" type="button" @click="emit('back')">← 一覧</button>
      <span class="grow"></span>
      <span class="foot-sep" aria-hidden="true"></span>
      <button class="btn danger" type="button" :disabled="busy" @click="reject">却下</button>
    </div>
  </div>
</template>

<style scoped>
/* The reasons a publish was refused, one each, as the worker gave them - as on あしあと. */
.reasons {
  margin: 0;
  padding-left: 1.2em;
  color: var(--k-text-2);
  font-size: var(--a-small);
}

.tune-row {
  grid-template-columns: 20px minmax(0, 1fr) auto;
}

.tune-row :deep(p) {
  margin: 0;
}

.memo {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-size: var(--a-small);
  background: var(--k-surface);
  border: 1px solid var(--k-line-2);
  border-radius: 6px;
  padding: 5px 8px;
  max-height: 40vh;
  overflow: auto;
}
</style>
