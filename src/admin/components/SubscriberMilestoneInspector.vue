<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, ref, toRaw, watch } from 'vue';

import { deleteJson, postJson, putJson } from '../lib/api';
import { useCrumbDetail } from '../lib/crumb';
import { EDITING_TEXT, fieldsAfterSave, sameFields, writeBody } from '../lib/editing';
import type { FootprintsEvent, FootprintsMember } from '../lib/footprints';
import { previewOpen } from '../lib/preview';
import { refreshSidebarDrafts } from '../lib/sidebar-drafts';
import {
  BAND_NOTE_ID,
  bandReasonId,
  bandReasonIds,
  liveMarkFor,
  publishFootFor,
  PUBLISH_TEXT,
  sentFieldsSaved,
  type AnsweredAction,
  type PublishAction,
  type PublishBand,
} from '../lib/publishing';
import {
  ANNOUNCERS,
  announcerLabel,
  emptyFormFields,
  formatCount,
  toFormFields,
  toRequestBody,
  type MilestoneFieldKey,
  type MilestoneFormFields,
  type SubscriberMilestone,
} from '../lib/subscriber-milestones';
import {
  isChangedSincePublish,
  isEventChanged,
  milestonesAnswerFor,
  SOURCE_TEXT,
  sourceCheckBody,
  sourceChipFor,
  type MilestonesPending,
  type SourcesJudgement,
} from '../lib/subscriber-milestones-publish';
import { showToast } from '../lib/toast';
import { confirmDiscard, useUnsavedGuard } from '../lib/unsaved-guard';

import DeleteButton from './DeleteButton.vue';
import SplitHandle from './SplitHandle.vue';

/**
 * 編集パネル for one 登録者数の節目 row (#225), or for a new one when
 * `milestone` is null. A new milestone is not created until it is saved: the
 * worker refuses a row without a date and a count, and a placeholder for
 * either could be kept by mistake as if it had been announced.
 *
 * The buttons, the band and the toasts are あしあと's (#277's decisions 1a,
 * 1c and 1d, #283), from lib/publishing.ts. Unlike あしあと, a milestone whose
 * sources are not enough is not published (6-7), and the source panel says
 * so as the sources are typed (2a), from the worker's own check.
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
  /**
   * Whether the page's まとめて公開する is running. Every button that writes
   * waits meanwhile: a save or a delete could land between the run's read of
   * a row and its publish.
   */
  bulkRunning: boolean;
  /**
   * The other half of `bulkRunning`: handed every write this panel sends, so
   * the page does not start a run while one is on its way. A function rather
   * than an event, since the write outlives the panel when another row is
   * selected mid-save, and an unmounted panel's events reach nobody.
   */
  trackWrite: (write: Promise<unknown>) => void;
}>();
const emit = defineEmits<{ changed: []; created: [milestoneId: number]; back: [] }>();

function initialFields(): MilestoneFormFields {
  return props.milestone === null ? emptyFormFields(props.channelId) : toFormFields(props.milestone);
}

const fields = ref<MilestoneFormFields>(initialFields());
const saving = ref(false);
const locked = computed(() => saving.value || props.bulkRunning);
const band = ref<PublishBand | null>(null);
const invalidFields = ref<readonly MilestoneFieldKey[]>([]);
/** The fields typed in that another screen changed too, found when the row was read again (`fieldsOnReload`). */
const clashes = ref<readonly (keyof MilestoneFormFields)[]>([]);
/** What the last request sent, when it saved it (`sentFieldsSaved`): the read after it follows the row as the worker saved it (`fieldsAfterSave`). */
let savedSent: MilestoneFormFields | null = null;

/** Against the saved row, or a new milestone's blank fields: anything typed into a new one is unsaved. */
const dirty = computed(() => !sameFields(fields.value, initialFields()));

useUnsavedGuard(
  () => dirty.value,
  () => {
    fields.value = initialFields();
  },
);

// A refetch hands the same row back as a new object. The fields follow what
// is saved now, but keep what is typed (#304), as FootprintsInspector.vue's
// do. After a request that saved them (`savedSent`), they are the row as
// saved, but for what was typed since. The band is left alone: a refetch follows a refused publish too, and
// the band is still the answer to it. Selecting another row mounts a new
// panel (the page keys it by id), which starts clean.
watch(
  () => props.milestone,
  (after, before) => {
    if (after === null || before === null || after.milestoneId !== before.milestoneId) {
      savedSent = null;
      fields.value = initialFields();
      clashes.value = [];

      return;
    }

    const reloaded = fieldsAfterSave(fields.value, toFormFields(before), toFormFields(after), savedSent);

    savedSent = null;

    fields.value = reloaded.fields;
    clashes.value = reloaded.clashes;
  },
);

const milestoneId = computed(() => props.milestone?.milestoneId ?? null);
const changedSincePublish = computed(
  () => props.milestone?.status === 'published' && isChangedSincePublish(props.pending, props.milestone.milestoneId),
);
const eventChanged = computed(() => milestoneId.value !== null && isEventChanged(props.pending, milestoneId.value));
const mark = computed(() => (props.milestone === null ? null : liveMarkFor(props.milestone.status)));
const foot = computed(() => publishFootFor(props.milestone?.status ?? 'draft'));

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

function invalid(field: keyof MilestoneFormFields): boolean {
  return (invalidFields.value as readonly string[]).includes(field) || clashes.value.includes(field);
}

function reasonIds(field: keyof MilestoneFormFields): string | undefined {
  return bandReasonIds<keyof MilestoneFormFields>(band.value, [...invalidFields.value, ...clashes.value], field);
}

function addSource(): void {
  fields.value.sources.push({ url: '', title: null });
}

function removeSource(index: number): void {
  fields.value.sources.splice(index, 1);
}

/*
 * The source check (#277's 2a): asked of the worker, which publishing asks
 * too, a moment after the member, who announced it or a URL last changed.
 * Null while it is unknown - not asked yet, or the request failed - and the
 * panel then says nothing either way rather than guess.
 */
const judgement = ref<SourcesJudgement | null>(null);
const checkKey = computed(() => JSON.stringify(sourceCheckBody(fields.value)));
const CHECK_DELAY_MS = 300;
let checkTimer: ReturnType<typeof setTimeout> | undefined;
let checkGeneration = 0;

async function checkSources(body: string): Promise<void> {
  const generation = ++checkGeneration;
  const sent = JSON.parse(body) as ReturnType<typeof sourceCheckBody>;

  // Nothing to ask about: no source is never enough.
  if (sent.urls.length === 0) {
    judgement.value = { marks: [], enough: false };
    return;
  }

  try {
    const answer = await postJson<SourcesJudgement>('/subscribers/source-check', sent);

    if (generation === checkGeneration) judgement.value = answer;
  } catch {
    if (generation === checkGeneration) judgement.value = null;
  }
}

watch(
  checkKey,
  (body) => {
    clearTimeout(checkTimer);
    // An answer for what the sources were is no longer about these.
    checkGeneration += 1;
    judgement.value = null;
    checkTimer = setTimeout(() => void checkSources(body), CHECK_DELAY_MS);
  },
  { immediate: true },
);

onBeforeUnmount(() => clearTimeout(checkTimer));

const sourcesShort = computed(() => judgement.value?.enough === false);
/** Each source's chip, by position, or null while there is nothing to say about it. */
const chips = computed(() =>
  fields.value.sources.map((_, i) => {
    const mark = judgement.value?.marks[i];

    return mark === undefined ? null : sourceChipFor(mark);
  }),
);

/** The request behind each button. Each sends the fields as they stand; the worker saves them in the same request. */
function send(action: PublishAction): Promise<unknown> {
  const path = `/subscribers/milestones/${milestoneId.value}`;
  const body = writeBody(toRequestBody(fields.value), props.milestone!);

  if (action === 'save') return putJson(path, body);

  return postJson(`${path}/${action}`, body);
}

/**
 * Runs `request`, then says what came of it (`milestonesAnswerFor`): a toast
 * when it went through, otherwise the band above the fields and the fields
 * it names marked. The table is read again whenever the row may have
 * changed, a refusal that saved a draft's fields included.
 */
async function run(action: AnsweredAction, request: () => Promise<unknown>, toast?: string): Promise<void> {
  if (locked.value) return;

  const status = props.milestone?.status ?? null;
  const sent = structuredClone(toRaw(fields.value));
  let error: unknown = null;

  saving.value = true;
  band.value = null;
  invalidFields.value = [];
  clashes.value = [];

  try {
    const write = request();

    props.trackWrite(write);
    await write;
  } catch (caught) {
    error = caught;
  } finally {
    saving.value = false;
  }

  const answer = milestonesAnswerFor(action, status, error);

  savedSent = sentFieldsSaved(error) ? sent : null;

  if (answer.kind === 'done') {
    emit('changed');
    void refreshSidebarDrafts();
    showToast(toast ?? answer.toast);

    return;
  }

  band.value = answer.band;
  invalidFields.value = answer.fields;

  if (answer.changed) {
    emit('changed');
    void refreshSidebarDrafts();
  }
}

function act(action: PublishAction): Promise<void> {
  return run(action, () => send(action));
}

/** A new milestone's 保存: creates it, and the page opens it once the table has it. */
async function create(): Promise<void> {
  if (locked.value) return;

  saving.value = true;
  band.value = null;
  invalidFields.value = [];
  clashes.value = [];

  try {
    const write = postJson<{ milestone: { milestoneId: number } }>(
      '/subscribers/milestones',
      toRequestBody(fields.value),
    );

    props.trackWrite(write);
    const milestoneId = (await write).milestone.milestoneId;

    void refreshSidebarDrafts();
    emit('created', milestoneId);
  } catch (error) {
    const answer = milestonesAnswerFor('save', null, error);

    if (answer.kind === 'band') {
      band.value = answer.band;
      invalidFields.value = answer.fields;
    }
  } finally {
    saving.value = false;
  }
}

function remove(): Promise<void> {
  return run('delete', () => deleteJson(`/subscribers/milestones/${milestoneId.value}`));
}

/** ← 一覧 and a new milestone's やめる: what is let go here is thrown away. */
function back(): void {
  if (confirmDiscard()) emit('back');
}

useCrumbDetail(() => heading.value);

import PreviewButton from './PreviewButton.vue';
import PreviewPane from './PreviewPane.vue';

const MilestonePreview = defineAsyncComponent(() => import('./previews/MilestonePreview.vue'));

/** The linked event as the preview writes it, from the events this panel was handed. */
const previewEvent = computed(() => {
  const event = props.events.find((e) => e.eventId === fields.value.eventId);

  return event === undefined ? null : { eventId: event.eventId, title: event.title, startDate: event.startDate };
});
</script>

<template>
  <div class="inspector">
    <SplitHandle />
    <div class="inspector-head">
      <div>
        <h3>{{ heading }}</h3>
        <div v-if="milestone || dirty" class="stack">
          <template v-if="milestone">
            <span v-if="mark" class="chip" :class="mark.tone">{{ mark.label }}</span>
            <span class="chip kind">{{ announcerLabel(milestone.announcedBy) }}</span>
          </template>
          <span v-if="dirty" class="chip waiting">{{ EDITING_TEXT.unsaved }}</span>
        </div>
      </div>
      <PreviewButton />
    </div>

    <div class="inspector-main" :class="{ 'with-preview': previewOpen }">
      <!-- inert while a request is on its way: it already carries the fields as they were, and its answer puts the saved fields back over anything typed meanwhile. -->
      <div class="inspector-body" :inert="saving || undefined">
        <div v-if="band" class="panel flag" role="alert">
          <h4>{{ band.title }}</h4>
          <ul v-if="band.lines.length > 0" class="reasons">
            <li v-for="(line, i) in band.lines" :id="bandReasonId(i)" :key="i">{{ line }}</li>
          </ul>
          <div v-if="band.note" :id="BAND_NOTE_ID" class="hint">{{ band.note }}</div>
        </div>

        <div v-if="changedSincePublish" class="panel flag">
          <h4>{{ PUBLISH_TEXT.changedTitle }}</h4>
          <div class="hint">{{ PUBLISH_TEXT.changedBody }}</div>
        </div>

        <div v-if="eventChanged" class="panel">
          <h4>つないだ出来事が変わりました</h4>
          <div class="hint">一覧の上の［本番に反映］を押してください</div>
        </div>

        <div class="field">
          <label for="m-member">メンバー</label>
          <select
            id="m-member"
            v-model="fields.channelId"
            :aria-invalid="invalid('channelId')"
            :aria-describedby="reasonIds('channelId')"
          >
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
              :aria-invalid="invalid('reachedDate')"
              :aria-describedby="reasonIds('reachedDate')"
            />
          </div>
          <div class="field">
            <label for="m-prec">日付の細かさ</label>
            <select
              id="m-prec"
              v-model="fields.datePrecision"
              :aria-invalid="invalid('datePrecision')"
              :aria-describedby="reasonIds('datePrecision')"
            >
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
              :aria-invalid="invalid('subscriberCount')"
              :aria-describedby="reasonIds('subscriberCount')"
            />
          </div>
          <div class="field">
            <label for="m-by">誰の公表か</label>
            <select
              id="m-by"
              v-model="fields.announcedBy"
              :aria-invalid="invalid('announcedBy')"
              :aria-describedby="reasonIds('announcedBy')"
            >
              <option v-for="a in ANNOUNCERS" :key="a.value" :value="a.value">{{ a.label }}</option>
            </select>
          </div>
        </div>

        <div class="field">
          <label for="m-event">つなぐ出来事</label>
          <select
            id="m-event"
            v-model="fields.eventId"
            :aria-invalid="invalid('eventId')"
            :aria-describedby="reasonIds('eventId')"
          >
            <option :value="null">つながない</option>
            <option v-for="e in events" :key="e.eventId" :value="e.eventId">{{ e.startDate }} {{ e.title }}</option>
            <option v-if="unlistedEventId !== null" :value="unlistedEventId">event_id {{ unlistedEventId }}</option>
          </select>
          <div class="hint">あしあとの「節目」の出来事から選びます</div>
        </div>

        <div
          class="panel span2"
          :class="{ 'flag-src': sourcesShort || invalid('sources') }"
          role="group"
          aria-labelledby="m-sources-title"
          :aria-describedby="reasonIds('sources')"
        >
          <h4 id="m-sources-title">{{ sourcesShort ? SOURCE_TEXT.notEnoughTitle : '出典' }}</h4>
          <div v-if="fields.announcedBy === 'listener'" class="hint">
            リスナーの投稿の URL は公開サイトに出ません。管理サイトにだけ残ります
          </div>
          <div v-for="(source, i) in fields.sources" :key="i" class="source-row judged">
            <input v-model="source.url" type="text" placeholder="https://..." aria-label="出典の URL" />
            <input v-model="source.title" type="text" placeholder="題（省略可）" aria-label="出典の題" />
            <span>
              <span v-if="chips[i]" class="chip" :class="chips[i].tone">{{ chips[i].label }}</span>
            </span>
            <button class="row-del" type="button" aria-label="この出典を外す" @click="removeSource(i)">&times;</button>
          </div>
          <div v-if="judgement?.enough" class="src-ok">{{ SOURCE_TEXT.enough }}</div>
          <div v-else-if="sourcesShort" class="hint">{{ SOURCE_TEXT.notEnoughBody }}</div>
          <div>
            <button class="btn quiet" type="button" @click="addSource">＋ 出典を足す</button>
          </div>
        </div>

        <div class="field">
          <label for="m-memo">メモ（公開されません）</label>
          <textarea
            id="m-memo"
            v-model="fields.memo"
            :aria-invalid="invalid('memo')"
            :aria-describedby="reasonIds('memo')"
          ></textarea>
        </div>

        <div v-if="milestone" class="field">
          <label for="m-id">milestone_id</label>
          <input id="m-id" type="text" :value="milestone.milestoneId" readonly />
        </div>
      </div>
      <PreviewPane v-if="previewOpen">
        <MilestonePreview :fields="fields" :milestone-id="milestoneId" :event="previewEvent" />
      </PreviewPane>
    </div>

    <div v-if="milestone === null" class="inspector-foot">
      <button class="btn primary" type="button" :disabled="locked" @click="create">保存</button>
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
        :disabled="locked"
        @click="act(button.action)"
      >
        {{ button.label }}
      </button>
      <span v-if="foot.note" class="hint">{{ foot.note }}</span>
      <button class="btn back quiet" type="button" @click="back">← 一覧</button>
      <span class="grow"></span>
      <span class="foot-sep" aria-hidden="true"></span>
      <DeleteButton :disabled="locked || foot.deleteDisabled" @remove="remove" />
      <span v-if="foot.deleteReason" class="hint">{{ foot.deleteReason }}</span>
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

/* A source with what it counts as (#277's 2a) between its title and the button that drops it. */
.source-row.judged {
  grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr) auto auto;
}

/* The source panel's notice, in the flag colours. Not .flag: that one takes a row of its own. */
.panel.flag-src {
  border-color: var(--a-flag);
  background: var(--a-flag-soft);
}

.panel.flag-src > h4 {
  color: var(--a-flag);
}

.src-ok {
  color: var(--k-ok);
  font-size: var(--a-small);
  font-weight: 700;
}
</style>
