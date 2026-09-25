<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';

import { AdminApiError, deleteJson, postJson, putJson } from '../lib/api';
import type { FootprintsEvent, FootprintsMember } from '../lib/footprints';
import { CHANGED_NOTICE, PUBLISH_QUEUED_TOAST, waitingNoticeFor, WITHDRAW_QUEUED_TOAST } from '../lib/publish-mark';
import {
  ANNOUNCERS,
  announcerLabel,
  emptyFormFields,
  fieldForSaveError,
  formatCount,
  milestoneButtonsFor,
  toFormFields,
  toRequestBody,
  type MilestoneFieldKey,
  type MilestoneFormFields,
  type SubscriberMilestone,
} from '../lib/subscriber-milestones';
import {
  isChangedSincePublish,
  isEventChanged,
  milestoneMarkFor,
  waitingEntryFor,
  type MilestonesPending,
} from '../lib/subscriber-milestones-publish';
import { showToast } from '../lib/toast';

/**
 * 編集パネル for one 登録者数の節目 row (#225), or for a new one when
 * `milestone` is null. Unlike あしあと's ＋ 足す, a new milestone is not
 * created until it is saved: the worker refuses a row without a date and a
 * count, and a placeholder for either could be kept by mistake as if it had
 * been announced.
 *
 * As in FootprintsInspector.vue, the panel edits its own copy (`fields`) and
 * the table's row only changes once the parent refetches.
 */
const props = defineProps<{
  milestone: SubscriberMilestone | null;
  /** The member a new milestone starts with. */
  channelId: string;
  members: FootprintsMember[];
  /** The events a milestone may be linked to (kind `milestone`). */
  events: FootprintsEvent[];
  /** `GET /subscribers/pending`, or null when it could not be read. */
  pending: MilestonesPending | null;
}>();
const emit = defineEmits<{ changed: []; created: [milestoneId: number]; back: [] }>();

function initialFields(): MilestoneFormFields {
  return props.milestone === null ? emptyFormFields(props.channelId) : toFormFields(props.milestone);
}

const fields = ref<MilestoneFormFields>(initialFields());
const saving = ref(false);
const errorMessage = ref<string | null>(null);
const errorField = ref<MilestoneFieldKey | null>(null);

watch(
  () => props.milestone,
  () => {
    fields.value = initialFields();
    errorMessage.value = null;
    errorField.value = null;
  },
);

const milestoneId = computed(() => props.milestone?.milestoneId ?? null);
const waiting = computed(() =>
  milestoneId.value === null ? undefined : waitingEntryFor(props.pending, milestoneId.value),
);
const changedSincePublish = computed(
  () => milestoneId.value !== null && isChangedSincePublish(props.pending, milestoneId.value),
);
const eventChanged = computed(() => milestoneId.value !== null && isEventChanged(props.pending, milestoneId.value));
const mark = computed(() =>
  props.milestone === null
    ? null
    : milestoneMarkFor(props.milestone.status, props.milestone.milestoneId, props.pending),
);
const buttons = computed(() =>
  milestoneButtonsFor(props.milestone?.status ?? 'draft', props.pending === null ? null : changedSincePublish.value),
);

// The saved row, not the fields being edited: the count in the field is text
// until the worker accepts it, and the chips beside the heading describe the
// saved row too.
const heading = computed(() => {
  if (props.milestone === null) return '新しい節目';

  return `${memberName(props.milestone.channelId)} ${formatCount(props.milestone.subscriberCount)} 人`;
});

// A row can name a member or an event the lists here do not have - the
// lists failed to load, or the event is no longer a milestone. Each gets an
// option of its own, so the select shows what the row holds rather than
// falling back to its first option and saving that.
const memberOptions = computed(() =>
  props.members.some((m) => m.channelId === fields.value.channelId)
    ? props.members
    : [...props.members, { channelId: fields.value.channelId, name: fields.value.channelId, colorKey: '' }],
);
const unlistedEventId = computed(() => {
  const id = fields.value.eventId;

  return id !== null && !props.events.some((e) => e.eventId === id) ? id : null;
});

function memberName(channelId: string): string {
  return props.members.find((m) => m.channelId === channelId)?.name ?? channelId;
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
    if (milestoneId.value === null) {
      const body = await postJson<{ milestone: { milestoneId: number } }>(
        '/subscribers/milestones',
        toRequestBody(fields.value),
      );

      emit('created', body.milestone.milestoneId);
      return;
    }

    await putJson(`/subscribers/milestones/${milestoneId.value}`, toRequestBody(fields.value));
    emit('changed');
    showToast('保存しました');
  });
}

/** Saves the fields, then moves the row one step, as FootprintsInspector.vue's own `moveStatus` does. */
function moveStatus(action: 'publish' | 'withdraw'): Promise<void> {
  return withErrorHandling(async () => {
    await putJson(`/subscribers/milestones/${milestoneId.value}`, toRequestBody(fields.value));
    await postJson(`/subscribers/milestones/${milestoneId.value}/${action}`, {});
    emit('changed');
    showToast(action === 'withdraw' ? WITHDRAW_QUEUED_TOAST : PUBLISH_QUEUED_TOAST);
  });
}

function remove(): Promise<void> {
  return withErrorHandling(async () => {
    await deleteJson(`/subscribers/milestones/${milestoneId.value}`);
    emit('changed');
    showToast('削除しました');
  });
}
</script>

<template>
  <div class="inspector">
    <div class="inspector-head">
      <div style="flex: 1 1 auto; min-width: 0">
        <h3>{{ heading }}</h3>
        <div v-if="milestone" class="stack" style="margin-top: 4px">
          <span v-if="mark" class="chip" :class="mark.tone">{{ mark.label }}</span>
          <span class="chip kind">{{ announcerLabel(milestone.announcedBy) }}</span>
        </div>
      </div>
    </div>

    <div class="inspector-body">
      <div v-if="errorMessage" class="panel flag">
        <h4>保存できません</h4>
        <div class="hint">{{ errorMessage }}</div>
      </div>

      <div v-if="milestone && waiting" class="panel">
        <h4>{{ waitingNoticeFor(milestone.status).title }}</h4>
        <div class="hint">{{ waitingNoticeFor(milestone.status).body }}</div>
        <div>
          <RouterLink class="btn" to="/publish">公開画面へ</RouterLink>
        </div>
      </div>

      <div v-if="changedSincePublish" class="panel flag">
        <h4>{{ CHANGED_NOTICE.title }}</h4>
        <div class="hint">{{ CHANGED_NOTICE.body }}</div>
      </div>

      <div v-if="eventChanged" class="panel">
        <h4>つないだ出来事が変わりました</h4>
        <div class="hint">
          本番の節目には、変わる前の出来事の題と日付が出ています。「公開」画面で「いま公開する」を押すと反映されます
        </div>
        <div>
          <RouterLink class="btn" to="/publish">公開画面へ</RouterLink>
        </div>
      </div>

      <div class="field">
        <label for="m-member">メンバー</label>
        <select id="m-member" v-model="fields.channelId" :aria-invalid="errorField === 'channelId'">
          <option v-for="m in memberOptions" :key="m.channelId" :value="m.channelId">{{ m.name }}</option>
        </select>
      </div>

      <div class="row2">
        <div class="field">
          <label for="m-date">達成の日</label>
          <input
            id="m-date"
            v-model="fields.reachedDate"
            type="text"
            :placeholder="fields.datePrecision === 'month' ? 'YYYY-MM' : 'YYYY-MM-DD'"
            :aria-invalid="errorField === 'reachedDate'"
          />
        </div>
        <div class="field">
          <label for="m-prec">日付の細かさ</label>
          <select id="m-prec" v-model="fields.datePrecision" :aria-invalid="errorField === 'datePrecision'">
            <option value="day">日まで</option>
            <option value="month">月まで</option>
          </select>
        </div>
      </div>

      <div class="row2">
        <div class="field">
          <label for="m-count">人数</label>
          <input
            id="m-count"
            v-model="fields.subscriberCount"
            type="text"
            inputmode="numeric"
            :aria-invalid="errorField === 'subscriberCount'"
          />
        </div>
        <div class="field">
          <label for="m-by">誰の公表か</label>
          <select id="m-by" v-model="fields.announcedBy" :aria-invalid="errorField === 'announcedBy'">
            <option v-for="a in ANNOUNCERS" :key="a.value" :value="a.value">{{ a.label }}</option>
          </select>
        </div>
      </div>

      <div class="field">
        <label for="m-event">つなぐ出来事</label>
        <select id="m-event" v-model="fields.eventId" :aria-invalid="errorField === 'eventId'">
          <option :value="null">つながない</option>
          <option v-for="e in events" :key="e.eventId" :value="e.eventId">{{ e.startDate }} {{ e.title }}</option>
          <option v-if="unlistedEventId !== null" :value="unlistedEventId">event_id {{ unlistedEventId }}</option>
        </select>
        <div class="hint">あしあとの「節目」の出来事から選びます</div>
      </div>

      <div class="panel" :class="{ flag: errorField === 'sources' }">
        <h4>出典</h4>
        <div v-if="fields.announcedBy === 'listener'" class="hint">
          リスナーの投稿の URL は公開サイトに出ません。管理サイトにだけ残ります
        </div>
        <div v-for="(source, i) in fields.sources" :key="i" class="source-row">
          <input v-model="source.url" type="text" placeholder="https://..." aria-label="出典の URL" />
          <input v-model="source.title" type="text" placeholder="題（省略可）" aria-label="出典の題" />
          <button class="row-del" type="button" aria-label="この出典を外す" @click="removeSource(i)">&times;</button>
        </div>
        <div>
          <button class="btn quiet" type="button" @click="addSource">＋ 出典を足す</button>
        </div>
      </div>

      <div class="field">
        <label for="m-memo">メモ（公開されません）</label>
        <textarea id="m-memo" v-model="fields.memo"></textarea>
      </div>

      <div v-if="milestone" class="field">
        <label for="m-id">milestone_id</label>
        <input id="m-id" type="text" :value="milestone.milestoneId" readonly />
      </div>
    </div>

    <div class="inspector-foot">
      <button class="btn primary" type="button" :disabled="saving" @click="save">保存</button>
      <template v-if="milestone">
        <button v-if="buttons.publishLabel" class="btn" type="button" :disabled="saving" @click="moveStatus('publish')">
          {{ buttons.publishLabel }}
        </button>
        <button
          v-if="buttons.withdrawLabel"
          class="btn"
          type="button"
          :disabled="saving"
          @click="moveStatus('withdraw')"
        >
          {{ buttons.withdrawLabel }}
        </button>
        <button class="btn back quiet" type="button" @click="emit('back')">← 一覧</button>
        <span class="grow"></span>
        <span class="foot-sep" aria-hidden="true"></span>
        <button class="btn danger" type="button" :disabled="saving || buttons.deleteDisabled" @click="remove">
          削除
        </button>
        <!-- In the foot rather than the body, so it is in view beside the button it explains. -->
        <div v-if="buttons.deleteDisabled" class="hint delete-hint">
          公開中の節目は削除できません。先に「下書きに戻す」を押してください
        </div>
      </template>
      <template v-else>
        <span class="grow"></span>
        <button class="btn quiet" type="button" :disabled="saving" @click="emit('back')">やめる</button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.delete-hint {
  flex-basis: 100%;
}

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
