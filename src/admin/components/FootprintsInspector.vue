<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';

import {
  fieldForSaveError,
  footprintsButtonsFor,
  kindLabel,
  KINDS,
  toFormFields,
  type EventFieldKey,
  type EventFormFields,
  type FootprintsEvent,
  type FootprintsMember,
} from '../lib/footprints';
import { AdminApiError, deleteJson, postJson, putJson } from '../lib/api';
import {
  footprintsMarkFor,
  isChangedSincePublish,
  waitingEntryFor,
  type FootprintsPending,
} from '../lib/footprints-publish';
import { refreshPublishBadge } from '../lib/publish-badge';
import { CHANGED_NOTICE, PUBLISH_QUEUED_TOAST, waitingNoticeFor, WITHDRAW_QUEUED_TOAST } from '../lib/publish-mark';
import { showToast } from '../lib/toast';

/**
 * 編集パネル for one あしあと row (#144). `event` is the row the table
 * already fetched - `present()` in `worker/src/admin/footprints.ts` already
 * carries every field this panel edits, so this does not fetch it again.
 *
 * The panel keeps its own editable copy (`fields`), reset from `event`
 * whenever the selected row changes, and never writes back into `event`
 * itself - the table's own row only changes once the parent refetches after
 * a save, publish, withdraw or delete succeeds.
 */
const props = defineProps<{
  event: FootprintsEvent;
  members: FootprintsMember[];
  /** `GET /footprints/pending`, or null when it could not be read. */
  pending: FootprintsPending | null;
}>();
const emit = defineEmits<{ changed: []; back: [] }>();

const fields = ref<EventFormFields>(toFormFields(props.event));
const saving = ref(false);
const errorMessage = ref<string | null>(null);
const errorField = ref<EventFieldKey | null>(null);
const memberPickerOpen = ref(false);

watch(
  () => props.event,
  (event) => {
    fields.value = toFormFields(event);
    errorMessage.value = null;
    errorField.value = null;
  },
);

const waiting = computed(() => waitingEntryFor(props.pending, props.event.eventId));
const changedSincePublish = computed(() => isChangedSincePublish(props.pending, props.event.eventId));
const mark = computed(() => footprintsMarkFor(props.event.status, props.event.eventId, props.pending));
const buttons = computed(() =>
  footprintsButtonsFor(props.event.status, props.pending === null ? null : changedSincePublish.value),
);
const selectedMembers = computed(() =>
  fields.value.channelIds.map((channelId) => ({
    channelId,
    member: props.members.find((m) => m.channelId === channelId),
  })),
);

function toggleMember(channelId: string): void {
  const at = fields.value.channelIds.indexOf(channelId);

  if (at === -1) fields.value.channelIds.push(channelId);
  else fields.value.channelIds.splice(at, 1);
}

function addSource(): void {
  fields.value.sources.push({ url: '', title: null });
}

function removeSource(index: number): void {
  fields.value.sources.splice(index, 1);
}

async function withErrorHandling(action: () => Promise<void>): Promise<void> {
  saving.value = true;
  errorMessage.value = null;
  errorField.value = null;

  try {
    await action();
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

function save(): Promise<void> {
  return withErrorHandling(async () => {
    await putJson(`/footprints/events/${props.event.eventId}`, fields.value);
    emit('changed');
    // Saving a published row's content makes it 「公開後に変更あり」, which the badge counts.
    void refreshPublishBadge();
    showToast('保存しました');
  });
}

/** Saves the fields, then moves the row one step: to 公開待ち (`publish`) or back to a draft (`withdraw`). Neither writes the public JSON - that is the 公開 screen's 「いま公開する」. */
function moveStatus(action: 'publish' | 'withdraw'): Promise<void> {
  return withErrorHandling(async () => {
    await putJson(`/footprints/events/${props.event.eventId}`, fields.value);
    await postJson(`/footprints/events/${props.event.eventId}/${action}`, {});
    emit('changed');
    void refreshPublishBadge();
    showToast(action === 'withdraw' ? WITHDRAW_QUEUED_TOAST : PUBLISH_QUEUED_TOAST);
  });
}

function remove(): Promise<void> {
  return withErrorHandling(async () => {
    await deleteJson(`/footprints/events/${props.event.eventId}`);
    emit('changed');
    showToast('削除しました');
  });
}
</script>

<template>
  <div class="inspector">
    <div class="inspector-head">
      <div style="flex: 1 1 auto; min-width: 0">
        <h3>{{ fields.title || '（無題）' }}</h3>
        <div class="stack" style="margin-top: 4px">
          <span class="chip" :class="mark.tone">{{ mark.label }}</span>
          <span class="chip kind">{{ kindLabel(fields.kind) }}</span>
        </div>
      </div>
    </div>

    <div class="inspector-body">
      <div v-if="errorMessage" class="panel flag">
        <h4>保存できません</h4>
        <div class="hint">{{ errorMessage }}</div>
      </div>

      <div v-if="waiting" class="panel">
        <h4>{{ waitingNoticeFor(event.status).title }}</h4>
        <div class="hint">{{ waitingNoticeFor(event.status).body }}</div>
        <div>
          <RouterLink class="btn" to="/publish">公開画面へ</RouterLink>
        </div>
      </div>

      <div v-if="changedSincePublish" class="panel flag">
        <h4>{{ CHANGED_NOTICE.title }}</h4>
        <div class="hint">{{ CHANGED_NOTICE.body }}</div>
      </div>

      <div v-if="fields.sourcePending" class="panel flag">
        <h4>出典の確認待ち</h4>
        <div class="hint">このまま公開すると、年表に「出典の確認待ち」と表示されます</div>
      </div>

      <div class="row2">
        <div class="field">
          <label for="f-date">日付</label>
          <input id="f-date" v-model="fields.startDate" type="text" :aria-invalid="errorField === 'startDate'" />
        </div>
        <div class="field">
          <label for="f-prec">日付の細かさ</label>
          <select id="f-prec" v-model="fields.datePrecision" :aria-invalid="errorField === 'datePrecision'">
            <option value="day">日まで</option>
            <option value="month">月まで</option>
          </select>
        </div>
      </div>

      <div class="field">
        <label for="f-title">題</label>
        <input id="f-title" v-model="fields.title" type="text" :aria-invalid="errorField === 'title'" />
      </div>

      <div class="row2">
        <div class="field">
          <label for="f-kind">種類</label>
          <select id="f-kind" v-model="fields.kind" :aria-invalid="errorField === 'kind'">
            <option v-for="k in KINDS" :key="k.value" :value="k.value">{{ k.label }}</option>
          </select>
        </div>
        <div class="field">
          <label for="f-place">場所</label>
          <input id="f-place" v-model="fields.place" type="text" />
        </div>
      </div>

      <div class="field">
        <label>関わったメンバー</label>
        <div class="stack" style="padding-top: 2px">
          <span v-if="selectedMembers.length === 0" class="sub">未設定</span>
          <span v-for="entry in selectedMembers" v-else :key="entry.channelId" class="who-chip">
            <i :style="{ background: entry.member?.colorKey ?? '#9b9289' }"></i>
            <span class="sub">{{ entry.member?.name ?? entry.channelId }}</span>
          </span>
          <button class="btn quiet" type="button" @click="memberPickerOpen = true">＋ 選ぶ</button>
        </div>
      </div>

      <div class="field">
        <label for="f-supplement">補足</label>
        <textarea id="f-supplement" v-model="fields.supplement"></textarea>
      </div>

      <div class="field">
        <label for="f-memo">メモ（公開されません）</label>
        <textarea id="f-memo" v-model="fields.memo"></textarea>
      </div>

      <div class="panel" :class="{ flag: errorField === 'sources' }">
        <h4>出典</h4>
        <div v-for="(source, i) in fields.sources" :key="i" class="source-row">
          <input v-model="source.url" type="text" placeholder="https://..." aria-label="出典の URL" />
          <input v-model="source.title" type="text" placeholder="題（省略可）" aria-label="出典の題" />
          <button class="row-del" type="button" aria-label="この出典を外す" @click="removeSource(i)">&times;</button>
        </div>
        <div>
          <button class="btn quiet" type="button" @click="addSource">＋ 出典を足す</button>
        </div>
        <div style="display: flex; align-items: center; gap: 9px">
          <button
            class="toggle"
            type="button"
            :aria-pressed="fields.sourcePending"
            aria-label="出典の確認待ち"
            @click="fields.sourcePending = !fields.sourcePending"
          ></button>
          <span class="sub">{{ fields.sourcePending ? '出典の確認待ち' : '確認済み' }}</span>
        </div>
      </div>

      <div class="field">
        <label for="f-video">動画 ID</label>
        <input id="f-video" v-model="fields.videoId" type="text" :aria-invalid="errorField === 'videoId'" />
      </div>

      <div class="panel">
        <h4>年表での大きさ</h4>
        <div style="display: flex; align-items: center; gap: 9px">
          <button
            class="toggle"
            type="button"
            :aria-pressed="fields.emphasized"
            aria-label="年表で大きく出す"
            @click="fields.emphasized = !fields.emphasized"
          ></button>
          <span class="sub">{{ fields.emphasized ? '大きい' : '通常の大きさ' }}</span>
        </div>
      </div>
    </div>

    <div class="inspector-foot">
      <button class="btn primary" type="button" :disabled="saving" @click="save">保存</button>
      <button v-if="buttons.publishLabel" class="btn" type="button" :disabled="saving" @click="moveStatus('publish')">
        {{ buttons.publishLabel }}
      </button>
      <button v-if="buttons.withdrawLabel" class="btn" type="button" :disabled="saving" @click="moveStatus('withdraw')">
        {{ buttons.withdrawLabel }}
      </button>
      <button class="btn back quiet" type="button" @click="emit('back')">← 一覧</button>
      <span class="grow"></span>
      <span class="foot-sep" aria-hidden="true"></span>
      <button class="btn danger" type="button" :disabled="saving || buttons.deleteDisabled" @click="remove">
        削除
      </button>
    </div>

    <div v-if="memberPickerOpen" class="picker" @mousedown.self="memberPickerOpen = false">
      <div class="picker-box" role="dialog" aria-label="メンバーを選ぶ">
        <div class="picker-head">メンバーを選ぶ</div>
        <div class="picker-body">
          <label v-for="m in props.members" :key="m.channelId" class="picker-row">
            <input
              type="checkbox"
              :checked="fields.channelIds.includes(m.channelId)"
              @change="toggleMember(m.channelId)"
            />
            <span class="who-chip"
              ><i :style="{ background: m.colorKey }"></i><span class="sub">{{ m.name }}</span></span
            >
          </label>
          <div v-if="props.members.length === 0" class="sub">メンバーがいません</div>
        </div>
        <div class="picker-foot">
          <button class="btn primary" type="button" @click="memberPickerOpen = false">閉じる</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.source-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto;
  gap: 7px;
  align-items: center;
}

.source-row input {
  width: 100%;
  font-size: 12.5px;
  background: var(--k-surface);
  border: 1px solid var(--k-line-2);
  border-radius: 6px;
  padding: 4px 7px;
}

.row-del {
  border: 0;
  background: none;
  color: var(--a-danger);
  cursor: pointer;
  font-size: 15px;
  line-height: 1;
  padding: 3px 7px;
  border-radius: 5px;
}

.row-del:hover {
  background: var(--a-danger-soft);
}

[aria-invalid='true'] {
  border-color: var(--a-danger) !important;
}
</style>
