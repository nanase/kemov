<script setup lang="ts">
import { computed, defineAsyncComponent, ref, watch } from 'vue';

import {
  emptyFormFields,
  footprintsFootFor,
  kindLabel,
  KINDS,
  toFormFields,
  type EventFieldKey,
  type EventFormFields,
  type FootAction,
  type FootprintsEvent,
  type FootprintsMember,
} from '../lib/footprints';
import { deleteJson, postJson, putJson } from '../lib/api';
import { useCrumbDetail } from '../lib/crumb';
import { EDITING_TEXT, sameFields } from '../lib/editing';
import { REJECTED_TOAST } from '../lib/inbox';
import {
  footprintsAnswerFor,
  footprintsMarkFor,
  isChangedSincePublish,
  PUBLISH_TEXT,
  type FootprintsPending,
  type PublishBand,
} from '../lib/footprints-publish';
import { refreshPublishBadge } from '../lib/publish-badge';
import { PREVIEW_NOTES, previewOpen } from '../lib/preview';
import { todayJst } from '../lib/snapshots';
import { showToast } from '../lib/toast';
import { confirmDiscard, useUnsavedGuard } from '../lib/unsaved-guard';

import DeleteButton from './DeleteButton.vue';
import SplitHandle from './SplitHandle.vue';

/**
 * 編集パネル for one あしあと row (#144), or for a new one when `event` is
 * null. A new event is not created until it is saved (#277's 6-12), the same
 * as a new 登録者数の節目.
 *
 * `event` is the row the table already fetched - `present()` in
 * `worker/src/admin/footprints.ts` already carries every field this panel
 * edits, so this does not fetch it again. The panel keeps its own editable
 * copy (`fields`), and never writes back into `event` itself - the table's
 * own row only changes once the parent refetches.
 *
 * `mode` is where the panel was opened from, and decides only the buttons at
 * the bottom: あしあと's own (#277's decision 1a), 確認待ち's (承認 / 却下)
 * or 出典の確認待ち's (出典を確かめた / 保存).
 */
const props = withDefaults(
  defineProps<{
    event: FootprintsEvent | null;
    members: FootprintsMember[];
    /** `GET /footprints/pending`, or null when it could not be read. */
    pending: FootprintsPending | null;
    mode?: 'data' | 'review' | 'source';
  }>(),
  { mode: 'data' },
);
const emit = defineEmits<{ changed: []; created: [eventId: number]; back: [] }>();

// Taken once: a blank row opened before midnight must not turn unsaved at it.
const blank = emptyFormFields(todayJst());

function initialFields(): EventFormFields {
  return props.event === null ? structuredClone(blank) : toFormFields(props.event);
}

const fields = ref<EventFormFields>(initialFields());

useCrumbDetail(() => fields.value.title);

const saving = ref(false);
const band = ref<PublishBand | null>(null);
const invalidFields = ref<readonly EventFieldKey[]>([]);
const memberPickerOpen = ref(false);

/** Against the saved row, or a new row's blank fields: the 未保存 chip, and what asks before they are thrown away. */
const dirty = computed(() => !sameFields(fields.value, initialFields()));

useUnsavedGuard(
  () => dirty.value,
  () => {
    fields.value = initialFields();
  },
);

// A refetch hands the same row back as a new object, and the fields follow
// what was saved. The band is left alone: a refetch follows a refused
// publish too, and the band is still the answer to it. Selecting another row
// mounts a new panel (the page keys it by id), which starts clean.
watch(
  () => props.event,
  () => {
    fields.value = initialFields();
  },
);

const eventId = computed(() => props.event?.eventId ?? null);
const changedSincePublish = computed(
  () => props.event?.status === 'published' && isChangedSincePublish(props.pending, props.event.eventId),
);
const mark = computed(() => (props.event === null ? null : footprintsMarkFor(props.event.status)));
const foot = computed(() => footprintsFootFor(props.event?.status ?? 'draft'));
const selectedMembers = computed(() =>
  fields.value.channelIds.map((channelId) => ({
    channelId,
    member: props.members.find((m) => m.channelId === channelId),
  })),
);

function invalid(field: EventFieldKey): boolean {
  return invalidFields.value.includes(field);
}

function toggleMember(channelId: string): void {
  const at = fields.value.channelIds.indexOf(channelId);

  if (at === -1) fields.value.channelIds.push(channelId);
  else {
    fields.value.channelIds.splice(at, 1);
    // A lead is one of the members, so leaving the members leaves the leads too.
    fields.value.leadChannelIds = fields.value.leadChannelIds.filter((id) => id !== channelId);
  }
}

function toggleLead(channelId: string): void {
  const at = fields.value.leadChannelIds.indexOf(channelId);

  if (at === -1) fields.value.leadChannelIds.push(channelId);
  else fields.value.leadChannelIds.splice(at, 1);
}

/** A debut with no lead cannot be published (footprints-publish.ts), so the panel says so before 公開 does. */
const needsLead = computed(() => fields.value.kind === 'debut' && fields.value.leadChannelIds.length === 0);

function addSource(): void {
  fields.value.sources.push({ url: '', title: null });
}

function removeSource(index: number): void {
  fields.value.sources.splice(index, 1);
}

/** The request behind each button. Each sends the fields as they stand; the worker saves them in the same request. */
function send(action: FootAction): Promise<unknown> {
  const path = `/footprints/events/${eventId.value}`;

  if (action === 'save') return putJson(path, fields.value);

  return postJson(`${path}/${action}`, fields.value);
}

/**
 * Runs `request`, then says what came of it (`footprintsAnswerFor`): a toast
 * when it went through, otherwise the band above the fields and the fields
 * it names marked. The table is read again whenever the row changed, a
 * refusal that saved a draft's fields included.
 */
async function run(action: FootAction, request: () => Promise<unknown>, toast?: string): Promise<void> {
  if (saving.value) return;

  const status = props.event?.status ?? null;
  let error: unknown = null;

  saving.value = true;
  band.value = null;
  invalidFields.value = [];

  try {
    await request();
  } catch (caught) {
    error = caught;
  } finally {
    saving.value = false;
  }

  const answer = footprintsAnswerFor(action, status, error);

  if (answer.kind === 'done') {
    emit('changed');
    void refreshPublishBadge();
    showToast(toast ?? answer.toast);

    return;
  }

  band.value = answer.band;
  invalidFields.value = answer.fields;

  if (answer.changed) {
    emit('changed');
    void refreshPublishBadge();
  }
}

function act(action: FootAction): Promise<void> {
  return run(action, () => send(action));
}

/** A new row's 保存: creates it, and the page opens it once the table has it. */
async function create(): Promise<void> {
  if (saving.value) return;

  saving.value = true;
  band.value = null;
  invalidFields.value = [];

  try {
    const body = await postJson<{ event: { eventId: number } }>('/footprints/events', fields.value);

    emit('created', body.event.eventId);
  } catch (error) {
    const answer = footprintsAnswerFor('save', null, error);

    if (answer.kind === 'band') {
      band.value = answer.band;
      invalidFields.value = answer.fields;
    }
  } finally {
    saving.value = false;
  }
}

function remove(): Promise<void> {
  return run('save', () => deleteJson(`/footprints/events/${eventId.value}`), EDITING_TEXT.removed);
}

/** 確認待ち's 承認: 「公開」, the fields as they stand. */
function approve(): Promise<void> {
  return act('publish');
}

/** 確認待ち's 却下: the row was never published, so it is deleted outright. */
function reject(): Promise<void> {
  return run('save', () => deleteJson(`/footprints/events/${eventId.value}`), REJECTED_TOAST);
}

/**
 * 出典の確認待ち's 「出典を確かめた」: the fields as typed - which for a
 * published row is its 「保存」, on the public timeline at once - then the
 * mark cleared, refused when the sources would not pass publishing. Clearing
 * the mark logs no revision, so a published row's public copy still says
 * 確認待ち until its next 保存.
 */
function confirmSource(): Promise<void> {
  const toast =
    props.event?.status === 'published'
      ? '出典を確かめました。本番の年表を直すには、あしあとでこの行の「保存」を押します'
      : '出典を確かめました';

  return run(
    'save',
    async () => {
      await send('save');
      await postJson(`/footprints/events/${eventId.value}/confirm-source`, {});
    },
    toast,
  );
}

/** ← 一覧 and a new row's やめる: on a narrow screen the panel stays behind the list, so what is let go here is thrown away, not kept for later. */
function back(): void {
  if (confirmDiscard()) emit('back');
}

defineExpose({ approve });

import PreviewButton from './PreviewButton.vue';
import PreviewPane from './PreviewPane.vue';

const FootprintsPreview = defineAsyncComponent(() => import('./previews/FootprintsPreview.vue'));
</script>

<template>
  <div class="inspector">
    <SplitHandle />
    <div class="inspector-head">
      <div>
        <h3>{{ fields.title || '（無題）' }}</h3>
        <div class="stack">
          <span v-if="mark" class="chip" :class="mark.tone">{{ mark.label }}</span>
          <span class="chip kind">{{ kindLabel(fields.kind) }}</span>
          <span v-if="dirty" class="chip waiting">{{ EDITING_TEXT.unsaved }}</span>
        </div>
      </div>
      <PreviewButton />
    </div>

    <div class="inspector-main" :class="{ 'with-preview': previewOpen }">
      <div class="inspector-body">
        <div v-if="band" class="panel flag" role="alert">
          <h4>{{ band.title }}</h4>
          <ul v-if="band.lines.length > 0" class="reasons">
            <li v-for="(line, i) in band.lines" :key="i">{{ line }}</li>
          </ul>
          <div v-if="band.note" class="hint">{{ band.note }}</div>
        </div>

        <div v-if="changedSincePublish" class="panel flag">
          <h4>{{ PUBLISH_TEXT.changedTitle }}</h4>
          <div class="hint">{{ PUBLISH_TEXT.changedBody }}</div>
        </div>

        <div v-if="fields.sourcePending" class="panel flag">
          <h4>出典の確認待ち</h4>
          <div class="hint">このまま公開すると、年表に「出典の確認待ち」と表示されます</div>
        </div>

        <div class="row2">
          <div class="field">
            <label for="f-date">日付</label>
            <input id="f-date" v-model="fields.startDate" type="text" :aria-invalid="invalid('startDate')" />
          </div>
          <div class="field">
            <label for="f-prec">日付の細かさ</label>
            <select id="f-prec" v-model="fields.datePrecision" :aria-invalid="invalid('datePrecision')">
              <option value="day">日まで</option>
              <option value="month">月まで</option>
            </select>
          </div>
        </div>

        <div class="field span2">
          <label for="f-title">題</label>
          <input id="f-title" v-model="fields.title" type="text" :aria-invalid="invalid('title')" />
        </div>

        <div v-if="event" class="field">
          <label for="f-eid">event_id</label>
          <input id="f-eid" type="text" :value="event.eventId" readonly />
        </div>

        <div class="row2">
          <div class="field">
            <label for="f-kind">種類</label>
            <select id="f-kind" v-model="fields.kind" :aria-invalid="invalid('kind')">
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
          <div class="stack">
            <span v-if="selectedMembers.length === 0" class="sub">未設定</span>
            <span v-for="entry in selectedMembers" v-else :key="entry.channelId" class="who-chip">
              <i :style="{ background: entry.member?.colorKey ?? '#9b9289' }"></i>
              <span class="sub">{{ entry.member?.name ?? entry.channelId }}</span>
            </span>
            <button class="btn quiet" type="button" @click="memberPickerOpen = true">＋ 選ぶ</button>
          </div>
        </div>

        <div
          v-if="selectedMembers.length > 0 || fields.kind === 'debut'"
          class="panel span2"
          :class="{ flag: needsLead || invalid('leadChannelIds') }"
        >
          <h4>主役</h4>
          <div v-if="selectedMembers.length > 0" class="stack">
            <div class="seg" role="group" aria-label="主役">
              <button
                v-for="entry in selectedMembers"
                :key="entry.channelId"
                type="button"
                :aria-pressed="fields.leadChannelIds.includes(entry.channelId)"
                @click="toggleLead(entry.channelId)"
              >
                {{ entry.member?.name ?? entry.channelId }}
              </button>
            </div>
          </div>
          <div class="hint">
            <template v-if="selectedMembers.length === 0">先に関わったメンバーを選んでください。</template>
            <template v-else-if="needsLead">デビューは、主役を 1 人以上選ばないと公開できません。</template>
            <template v-else>この出来事が誰のものかを選びます。デビューでは本人を選び、ゲストは選びません。</template>
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

        <div class="panel" :class="{ flag: invalid('sources') }">
          <h4>出典</h4>
          <div v-for="(source, i) in fields.sources" :key="i" class="source-row">
            <input v-model="source.url" type="text" placeholder="https://..." aria-label="出典の URL" />
            <input v-model="source.title" type="text" placeholder="題（省略可）" aria-label="出典の題" />
            <button class="row-del" type="button" aria-label="この出典を外す" @click="removeSource(i)">&times;</button>
          </div>
          <div>
            <button class="btn quiet" type="button" @click="addSource">＋ 出典を足す</button>
          </div>
          <div class="switch-row">
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
          <input id="f-video" v-model="fields.videoId" type="text" :aria-invalid="invalid('videoId')" />
        </div>

        <div class="panel">
          <h4>年表での大きさ</h4>
          <div class="switch-row">
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
      <PreviewPane v-if="previewOpen" :note="PREVIEW_NOTES.published">
        <FootprintsPreview :fields="fields" :event-id="eventId ?? 0" />
      </PreviewPane>
    </div>

    <div v-if="mode === 'review'" class="inspector-foot">
      <button class="btn primary" type="button" :disabled="saving" @click="approve">承認</button>
      <button class="btn back quiet" type="button" @click="back">← 一覧</button>
      <span class="grow"></span>
      <span class="foot-sep" aria-hidden="true"></span>
      <button class="btn danger" type="button" :disabled="saving" @click="reject">却下</button>
    </div>
    <div v-else-if="mode === 'source'" class="inspector-foot">
      <button class="btn primary" type="button" :disabled="saving" @click="confirmSource">出典を確かめた</button>
      <button class="btn" type="button" :disabled="saving" @click="act('save')">保存</button>
      <button class="btn back quiet" type="button" @click="back">← 一覧</button>
    </div>
    <div v-else-if="event === null" class="inspector-foot">
      <button class="btn primary" type="button" :disabled="saving" @click="create">保存</button>
      <span class="grow"></span>
      <button class="btn quiet" type="button" :disabled="saving" @click="back">やめる</button>
    </div>
    <div v-else class="inspector-foot">
      <button
        v-for="(button, i) in foot.actions"
        :key="button.action"
        class="btn"
        :class="{ primary: i === 0 }"
        type="button"
        :disabled="saving"
        @click="act(button.action)"
      >
        {{ button.label }}
      </button>
      <span v-if="foot.note" class="hint">{{ foot.note }}</span>
      <button class="btn back quiet" type="button" @click="back">← 一覧</button>
      <span class="grow"></span>
      <span class="foot-sep" aria-hidden="true"></span>
      <DeleteButton :disabled="saving || foot.deleteDisabled" @remove="remove" />
      <span v-if="foot.deleteReason" class="hint">{{ foot.deleteReason }}</span>
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
/* The reasons a publish was refused, one each, as the worker gave them. */
.reasons {
  margin: 0;
  padding-left: 1.2em;
  color: var(--k-text-2);
  font-size: var(--a-small);
}
</style>
