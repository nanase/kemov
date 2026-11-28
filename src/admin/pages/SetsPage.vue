<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, onUnmounted, ref, shallowRef, toRaw, watch } from 'vue';
import { useRoute } from 'vue-router';
import { unescapeHtml } from '@nanase/alnilam/string';

import { markdownHtml } from '@/lib/genet/musicSong';

import BulkPublishBar from '../components/BulkPublishBar.vue';
import BulkPublishOutcome from '../components/BulkPublishOutcome.vue';
import DeleteButton from '../components/DeleteButton.vue';
import HelpLink from '../components/HelpLink.vue';
import PreviewButton from '../components/PreviewButton.vue';
import PreviewPane from '../components/PreviewPane.vue';
import RepublishBand from '../components/RepublishBand.vue';
import SplitHandle from '../components/SplitHandle.vue';
import { AdminApiError, deleteJson, getJson, postJson, putJson } from '../lib/api';
import {
  ABANDONED,
  allTicked,
  ALREADY_PUBLISHED,
  BULK_TEXT,
  isTickable,
  publishInTurn,
  tickedRows,
  ticksAfterReload,
  toggleAll,
  toggleTick,
  type BulkPublishOutcome as Outcome,
} from '../lib/bulk-publish';
import { useCrumbDetail } from '../lib/crumb';
import {
  clashesKept,
  EDITING_TEXT,
  fieldsAfterSave,
  fieldsOnReload,
  removePath,
  SAVE_TOAST,
  sameFields,
  writeBody,
} from '../lib/editing';
import { insertAt, mdSnippet, clock, type MdLinkKind } from '../lib/genet-markdown';
import { type GenetPerson } from '../lib/genet-people';
import {
  isChangedSincePublish,
  STREAM_NOTE_ID,
  streamAnswerFor,
  streamBandReasonIds,
  streamReasonId,
  TUNE_NOTE_ID,
  tuneAnswerFor,
  tuneBandReasonIds,
  tuneReasonId,
  type GenetPendingResponse,
} from '../lib/genet-publish';
import {
  attrNameOptions,
  emptyFormFields as emptyTuneFields,
  learnName,
  toFormFields as toTuneFormFields,
  type Attribute,
  type GenetTune,
  type TuneFieldError,
  type TuneFieldSection,
  type TuneFormFields,
} from '../lib/genet-tunes';
import {
  emptyFormFields as emptyStreamFields,
  leavesFilter,
  moveEntries,
  openTuneUnread,
  performanceMoves,
  PLATFORMS,
  SCENE_STYLE_LABEL,
  SCENE_STYLES,
  STATUS_OPTIONS,
  streamsQuery,
  toFormFields as toStreamFormFields,
  VIDEO_TYPES,
  withKeptStream,
  withoutIndex,
  withoutItem,
  type GenetStream,
  type StreamFieldError,
  type StreamFieldSection,
  type StreamFormFields,
} from '../lib/genet-streams';
import { countText } from '../lib/list-count';
import { useListTotal } from '../lib/list-total';
import { previewOpen } from '../lib/preview';
import { refreshSidebarDrafts } from '../lib/sidebar-drafts';
import {
  FOOT_TEXT,
  liveMarkFor,
  PUBLISH_TEXT,
  publishFootFor,
  sentFieldsSaved,
  type PublishAction,
  type PublishBand,
} from '../lib/publishing';
import { genetBandText } from '../lib/republish';
import { showToast } from '../lib/toast';
import { confirmDiscard, useUnsavedGuard } from '../lib/unsaved-guard';

// The プレビュー is drawn in ジェネット楽曲一覧's colours, already while it waits for a tune to be opened.
import '@/shell/palette-genet.css';

const GenetSongPreview = defineAsyncComponent(() => import('../components/previews/GenetSongPreview.vue'));

/**
 * データ > ジェネット楽曲一覧 (#141, #144's task 14) - the one screen that
 * does not use .pane/.inspector: a stream's own data (its performances, each
 * with a tune's own credits, reference videos and sheet music) does not fit
 * the narrow inspector every other screen uses, so this one splits
 * .setlist/.editor instead, full width. Uses only #158/task 10's own
 * `/admin/api/genet/*` - no new endpoint.
 *
 * A tune is shared across every stream that performs it, so saving a tune's
 * own credits is its own action (its own PUT/POST to
 * `/admin/api/genet/tunes`), separate from saving the stream's own fields
 * and which tunes/scenes it performs (`/admin/api/genet/streams`) - the mock
 * gives this screen one "保存" button, but the mock predates the tune/person
 * sharing the real schema settled on (#141 comment 5704563615), where one
 * save silently affecting every other stream performing the same tune would
 * be a surprise. See the artifact's own "モックとの違い" for this.
 *
 * A stream's 「公開」, a published stream's 「保存」 and 「非公開に戻す」 reach
 * the public JSON in the one request that pressed them, and so does a tune's
 * 保存 when a published stream performs it (#284). The buttons sit in the
 * band at the bottom, as あしあと's do (#277's decision 1a, 6-1).
 */

const streams = ref<GenetStream[]>([]);
const people = ref<GenetPerson[]>([]);
// Which published streams the public JSON has not caught up with - the
// editor says so. Null when it could not be read.
const pending = ref<GenetPendingResponse | null>(null);
const bandText = computed(() => genetBandText(pending.value));
// まとめて公開 (#285): the drafts ticked, how far a run has got, and what the last one did.
const ticked = ref<Set<string>>(new Set());
const bulkProgress = ref<{ done: number; total: number } | null>(null);
const bulkOutcome = ref<Outcome<GenetStream> | null>(null);
const keyOf = (s: GenetStream): string => s.videoId;

// `/sets?video=<videoId>` opens that stream, for a link to it. Read once,
// for the first list that arrives.
const route = useRoute();
let requestedVideoId = typeof route.query.video === 'string' ? route.query.video : null;
const loading = ref(false);
const loadError = ref<string | null>(null);
const peopleLoadError = ref<string | null>(null);

const UNTITLED = '（無題）';

const statusFilter = ref('all');
const q = ref('');
const selectedVideoId = ref<string | null>(null);
const detail = ref(false);
// ＋ 追加: the editor holds a new stream, not yet created (#277's 6-4).
const adding = ref(false);
const newVideoId = ref('');

const filtered = computed(() => statusFilter.value !== 'all' || q.value.trim() !== '');
// `load` asks the worker for the filtered list, so `streams` is already what the filter shows.
const listTotal = useListTotal(
  async () => (await getJson<{ streams: GenetStream[] }>('/genet/streams')).streams.length,
);
const selected = computed(() => streams.value.find((s) => s.videoId === selectedVideoId.value) ?? null);
/** The stream the editor's scenes and プレビュー point at: the one open, or the id typed for a new one. */
const currentVideoId = computed(() => (adding.value ? newVideoId.value : (selected.value?.videoId ?? '')));
const selectedChanged = computed(
  () =>
    selected.value?.status === 'published' &&
    isChangedSincePublish(pending.value, 'genet_stream', selected.value.videoId),
);
const foot = computed(() => publishFootFor(selected.value?.status ?? 'draft'));

const streamFields = ref<StreamFormFields>(emptyStreamFields());
/** A request about the stream on its way, through the list read after it. */
const sending = ref(false);
const band = ref<PublishBand | null>(null);
const invalidFields = ref<readonly StreamFieldError[]>([]);
/**
 * The fields typed in that another screen changed too, found when the stream
 * was read again (`fieldsOnReload`). Each is a whole field: the performances
 * clash as one list, so no single performance is marked for it.
 */
const clashes = ref<readonly StreamFieldSection[]>([]);

/** `clashes` as the field errors they mark. */
const clashErrors = computed<StreamFieldError[]>(() =>
  clashes.value.map((section) => ({ section, performanceIndex: null, sceneIndex: null })),
);

function invalid(section: StreamFieldSection, performanceIndex: number | null = null): boolean {
  return (
    invalidFields.value.some(
      (f) => f.section === section && (performanceIndex === null || f.performanceIndex === performanceIndex),
    ) ||
    (performanceIndex === null && clashes.value.includes(section))
  );
}

function reasonIds(section: StreamFieldSection, performanceIndex: number | null = null): string | undefined {
  return streamBandReasonIds(
    band.value,
    [...invalidFields.value, ...clashErrors.value],
    (f) => f.section === section && (performanceIndex === null || f.performanceIndex === performanceIndex),
  );
}

/** A refusal for a stream with no tune at all, which the tune search box takes. */
const noTuneRefused = computed(() =>
  invalidFields.value.some((f) => f.section === 'performances' && f.performanceIndex === null),
);

function clearBand(): void {
  band.value = null;
  invalidFields.value = [];
  clashes.value = [];
}

/** A new stream's id while its 保存 reads the list, so that opening it keeps the tunes typed into while it was new. */
let createdVideoId: string | null = null;
/** What the last request sent, when it saved it (`sentFieldsSaved`): the read after it follows the stream as the worker saved it (`fieldsAfterSave`). */
let savedSent: StreamFormFields | null = null;
/** How many times the fields were thrown away (`discardEdits`): a request's answer that lands after one is not theirs. */
let discards = 0;
/**
 * The stream the fields stand on: its fields, what a read is put together
 * against (`fieldsAfterSave`), and its version, what a write sends back
 * (#307). Behind `selected` while a read the fields did not take in is
 * declined (`replaceStreamFields`): the next read is put together against
 * it again, and a 保存 meanwhile is refused rather than sending fields that
 * `selected`'s version does not hold.
 */
let standOn: { fields: StreamFormFields; version: number } | null = null;

/** The fields now stand on `stream`, as it was read. */
function standOnStream(stream: GenetStream | null): void {
  standOn = stream === null ? null : { fields: toStreamFormFields(stream), version: stream.version };
}

watch(selected, (stream, previous) => {
  if (stream === null || previous === null || stream.videoId !== previous.videoId) {
    savedSent = null;
    clearBand();
    streamFields.value = stream === null ? emptyStreamFields() : toStreamFormFields(stream);
    standOnStream(stream);
    if (stream === null || stream.videoId !== createdVideoId) closeTunes();
    return;
  }

  // The open stream read again - after a request about it, or a filter that
  // keeps it - keeps what is typed, and takes the rest as saved now (#304):
  // a save another screen's change refused would otherwise lose it, and a
  // 保存 pressed again would turn back that change. After a request that
  // saved the fields (`savedSent`), they are the stream as saved, but for
  // what was typed since. Both hold until a read is taken in (`standOn`).
  // The band is left alone: it is the answer to the request that read it
  // again.
  const before = standOn?.fields ?? toStreamFormFields(previous);
  const reloaded = sameFields(streamFields.value, savedSent ?? before)
    ? { fields: toStreamFormFields(stream), clashes: [] }
    : fieldsAfterSave(streamFields.value, before, toStreamFormFields(stream), savedSent);

  if (!replaceStreamFields(reloaded.fields)) return;

  savedSent = null;
  standOnStream(stream);
  clashes.value = reloaded.clashes;
});

/**
 * Puts `next` in place of the stream's fields. The tunes stay open with
 * whatever is typed into them - no 保存 of the stream sends them. When `next`
 * orders the performances differently (saved elsewhere meanwhile), each
 * tune's fields move with its tune (lib/genet-streams.ts `performanceMoves`).
 * A tune `next` no longer holds would take its unsaved changes with it, so
 * that is asked first; declining keeps the fields as they are, which then
 * show as unsaved against the stream read. False when declined.
 */
function replaceStreamFields(next: StreamFormFields): boolean {
  const before = streamFields.value.performances.map((p) => p.tuneId);
  const after = next.performances.map((p) => p.tuneId);

  if (sameFields(before, after)) {
    streamFields.value = next;

    return true;
  }

  const moves = performanceMoves(before, after);
  const losesTyped = [...tuneFieldsByIndex.value.keys()].some((index) => !moves.has(index) && isTuneDirty(index));

  if (losesTyped && !window.confirm(EDITING_TEXT.confirmDiscard)) return false;

  streamFields.value = next;
  tuneFieldsByIndex.value = moveEntries(tuneFieldsByIndex.value, moves);
  tuneSavedByIndex.value = moveEntries(tuneSavedByIndex.value, moves);
  tuneClashesByIndex.value = moveEntries(tuneClashesByIndex.value, moves);
  // A read on its way names its old index, so its answer is dropped.
  latestTuneRead.clear();

  const open = openIndex.value === null ? undefined : moves.get(openIndex.value);

  // A tune still being read when the order changed has no fields to move, so
  // it stays open and its read is sent again (#284).
  openIndex.value = open ?? null;
  readOpenTuneAgain();

  return true;
}

/** Closes the tunes and forgets them; each is read again when opened. */
function closeTunes(): void {
  openIndex.value = null;
  tuneFieldsByIndex.value = new Map();
  tuneSavedByIndex.value = new Map();
  tuneClashesByIndex.value = new Map();
  latestTuneRead.clear();
}

// Generations of the pending reads: the latest one sent, and the one `pending` holds. An
// older answer that lands later is dropped. The message above the list stays hidden after a
// 「本番に反映」 through the read the press starts (RepublishBand.vue).
let pendingSent = 0;
const pendingHeld = ref(0);

async function loadPending(): Promise<void> {
  const generation = ++pendingSent;

  try {
    const body = await getJson<GenetPendingResponse>('/genet/pending');

    if (generation === pendingSent) pending.value = body;
  } catch {
    if (generation === pendingSent) pending.value = null;
  } finally {
    if (generation === pendingSent) pendingHeld.value = generation;
  }
}

/** RepublishBand.vue's `reload`: reads the pending state again, and answers the generation of that read. */
function reloadPending(): number {
  void loadPending();

  return pendingSent;
}

// A filter changed mid-request starts a second, overlapping GET; only the
// latest one's answer is kept, so a slower earlier one cannot draw the list
// for a filter that is no longer selected.
let loadGeneration = 0;

/**
 * The open stream as it is now, null when it is gone, or `shown` - the one
 * on screen - when it cannot be read.
 */
async function readKeptStream(videoId: string, shown: GenetStream): Promise<GenetStream | null> {
  try {
    return (await getJson<{ stream: GenetStream }>(`/genet/streams/${encodeURIComponent(videoId)}`)).stream;
  } catch (error) {
    return error instanceof AdminApiError && error.status === 404 ? null : shown;
  }
}

/**
 * Resolves true when the list it read was put on screen: not failed, and not
 * overtaken by a later load. `keep` names the open stream after its own
 * request was refused: it stays in the list though the filter no longer
 * takes it (`withKeptStream`).
 */
async function load(keep: string | null = null): Promise<boolean> {
  loading.value = true;
  loadError.value = null;
  void loadPending();

  const generation = ++loadGeneration;

  try {
    const body = await getJson<{ streams: GenetStream[] }>(
      `/genet/streams${streamsQuery(statusFilter.value, q.value)}`,
    );

    if (generation !== loadGeneration) return false;

    let rows = body.streams;
    const shown = selected.value;

    if (keep !== null && shown !== null && shown.videoId === keep && !rows.some((s) => s.videoId === keep)) {
      const kept = await readKeptStream(keep, shown);

      if (generation !== loadGeneration) return false;
      if (kept !== null) rows = withKeptStream(rows, kept, streams.value.indexOf(shown));
    }

    streams.value = rows;
    ticked.value = ticksAfterReload(ticked.value, streams.value, keyOf);
    listTotal.update(body.streams.length, filtered.value);

    // A stream the filter now leaves out closes its editor, and the first
    // one in the list takes its place, as on あしあと.
    if (selectedVideoId.value !== null && selected.value === null) {
      selectedVideoId.value = null;
      detail.value = false;
    }

    // Not while a new stream is being entered in the editor.
    if (selectedVideoId.value === null && !adding.value && streams.value.length > 0) {
      const requested = streams.value.find((s) => s.videoId === requestedVideoId);

      selectedVideoId.value = (requested ?? streams.value[0]!).videoId;
      // A stream asked for by name is opened, so a narrow screen lands on its
      // editor rather than on the list.
      if (requested !== undefined) detail.value = true;
    }

    requestedVideoId = null;

    return true;
  } catch (error) {
    if (generation !== loadGeneration) return false;

    loadError.value = error instanceof AdminApiError ? error.message : String(error);

    return false;
  } finally {
    if (generation === loadGeneration) loading.value = false;
  }
}

async function loadPeople(): Promise<void> {
  peopleLoadError.value = null;

  try {
    const body = await getJson<{ people: GenetPerson[] }>('/genet/people');

    people.value = body.people;
  } catch (error) {
    // Leaves `people` as it was rather than clearing it to [] - an empty
    // picker here reads as "nobody is registered yet" and invites a
    // duplicate via 新しい人物を登録, when the truth is this request failed.
    peopleLoadError.value = error instanceof AdminApiError ? error.message : String(error);
  }
}

/** Whether anything about the stream, or a tune, is on its way: the list and the filters wait for it. */
const busy = computed(() => sending.value || tuneSaving.value);
/**
 * The bottom buttons wait for the list too: a reload may close the stream or
 * put its saved fields back. They wait for a まとめて公開 as well, which
 * reads the list again when it ends: `inert` on the editor does not reach them.
 */
const footBusy = computed(() => busy.value || loading.value || bulkProgress.value !== null);
/** Neither the filters nor the selection move while the editor's request or a まとめて公開 is on its way. */
const locked = computed(() => busy.value || bulkProgress.value !== null);
const bulkTargets = computed(() =>
  loading.value || loadError.value !== null ? [] : tickedRows(ticked.value, streams.value, keyOf),
);

/** A stream clicked in the list: asks first when the open one has changes that would be lost. */
function selectStream(videoId: string): void {
  if (locked.value) return;
  if ((adding.value || videoId !== selectedVideoId.value) && !confirmDiscard()) return;

  adding.value = false;
  selectedVideoId.value = videoId;
  detail.value = true;
}

/** ＋ 追加: the editor holds a blank stream, created only when it is saved. */
function startAdding(): void {
  if (locked.value) return;
  // A new stream being typed is unsaved too, and starting again would clear it.
  if (!confirmDiscard()) return;

  adding.value = true;
  newVideoId.value = '';
  selectedVideoId.value = null;
  // `selected` may already have been null, which the watch on it would not see.
  streamFields.value = emptyStreamFields();
  standOnStream(null);
  closeTunes();
  clearBand();
  detail.value = true;
}

/** A new stream's キャンセル. */
function stopAdding(): void {
  if (!confirmDiscard()) return;

  adding.value = false;
  detail.value = false;
  selectedVideoId.value = streams.value[0]?.videoId ?? null;
}

// A filter can leave the open stream out of the list, which closes its
// editor, so changing one asks first, as selecting another stream does.
function setStatusFilter(value: string): void {
  if (locked.value) return;
  if (value !== statusFilter.value && confirmDiscard()) statusFilter.value = value;
}

function setQuery(event: Event): void {
  const input = event.target as HTMLInputElement;

  if (!locked.value && confirmDiscard()) q.value = input.value;
  else input.value = q.value;
}

/**
 * まとめて公開: each ticked draft through 「公開」, one at a time, with the
 * fields it has saved when its turn comes (lib/bulk-publish.ts), as
 * SubscribersPage.vue does. The list is read again afterwards, which puts
 * the open stream's saved fields back, so its unsaved changes are asked
 * about first.
 */
async function publishTicked(): Promise<void> {
  const targets = bulkTargets.value;

  if (targets.length === 0 || locked.value || !confirmDiscard()) return;

  bulkOutcome.value = null;
  bulkProgress.value = { done: 0, total: targets.length };

  try {
    bulkOutcome.value = await publishInTurn(
      targets,
      async ({ videoId }) => {
        // Read again just before: the list can be older than the stream.
        const { stream: saved } = await getJson<{ stream: GenetStream }>(
          `/genet/streams/${encodeURIComponent(videoId)}`,
        );

        // Left while the read was on its way: no publish starts after that.
        if (left) return ABANDONED;

        if (saved.status !== 'draft') return ALREADY_PUBLISHED;

        await postJson(
          `/genet/streams/${encodeURIComponent(videoId)}/publish`,
          writeBody(toStreamFormFields(saved), saved),
        );
      },
      (done) => {
        bulkProgress.value = { done, total: targets.length };
      },
      () => left,
    );
  } finally {
    bulkProgress.value = null;
    void refreshSidebarDrafts();
    if (!left) await reload();
  }
}

// Whether the page was left: a run on its way sends no row after that, so it
// does not go on unseen (lib/bulk-publish.ts's `publishInTurn`).
let left = false;

onUnmounted(() => {
  left = true;
});

function streamLine(s: GenetStream): string {
  return `${s.publishedAt.slice(0, 10)} ${s.shortTitle || s.title}`;
}

/** After a request that may have changed the streams: the list and which of them the public JSON is behind. */
async function reload(keep: string | null = null): Promise<boolean> {
  listTotal.invalidate();

  return await load(keep);
}

/**
 * 「公開」, 「保存」 or 「非公開に戻す」 on the open stream. Each sends the
 * fields as they stand, and the worker saves them in the same request
 * (#277's 6-2); the open tunes are not sent, and keep what is typed into
 * them. A stream the status filter then leaves out closes its editor and the
 * tunes in it, so that is asked first when a tune has unsaved changes.
 */
async function act(action: PublishAction): Promise<void> {
  if (selected.value === null || footBusy.value) return;

  const { videoId, status } = selected.value;
  const next = action === 'publish' ? 'published' : action === 'withdraw' ? 'draft' : status;

  if (
    leavesFilter(statusFilter.value, next, q.value, streamFields.value.title) &&
    tunesDirty.value &&
    !window.confirm(EDITING_TEXT.confirmDiscard)
  ) {
    return;
  }

  const path = `/genet/streams/${encodeURIComponent(videoId)}`;
  const sent = structuredClone(toRaw(streamFields.value));
  const discardsBefore = discards;
  let error: unknown = null;

  sending.value = true;
  clearBand();

  try {
    const body = writeBody(streamFields.value, standOn ?? selected.value);

    if (action === 'save') await putJson(path, body);
    else await postJson(`${path}/${action}`, body);
  } catch (caught) {
    error = caught;
  }

  try {
    const answer = streamAnswerFor(action, status, error);

    // One that saved nothing keeps the last save's: no read may have answered
    // it yet. Fields thrown away meanwhile are not what is on screen.
    if (sentFieldsSaved(error) && discards === discardsBefore) savedSent = sent;

    if (answer.kind === 'done') {
      void refreshSidebarDrafts();
      showToast(answer.toast);
      await reload();

      return;
    }

    band.value = answer.band;
    invalidFields.value = answer.fields;

    if (answer.changed) {
      void refreshSidebarDrafts();
      // Fields that were not saved stay as typed over the stream read again,
      // and the stream stays open even when the filter no longer takes it.
      await reload(videoId);

      // A publish is refused too when a tune it performs was saved
      // elsewhere (#303): the tunes read are read again, over what is typed.
      if (error instanceof AdminApiError && error.changedElsewhere) readTunesAgain();
    }
  } finally {
    sending.value = false;
  }
}

/** Reads every tune already read again, keeping what is typed into each (`takeInTuneRead`). */
function readTunesAgain(): void {
  for (const index of tuneFieldsByIndex.value.keys()) void readTune(index, true);
}

/** A new stream's 保存: creates it as a draft, and opens it once the list has it. */
async function create(): Promise<void> {
  if (footBusy.value) return;

  const videoId = newVideoId.value.trim();

  if (
    leavesFilter(statusFilter.value, 'draft', q.value, streamFields.value.title) &&
    tunesDirty.value &&
    !window.confirm(EDITING_TEXT.confirmDiscard)
  ) {
    return;
  }

  // A scene added before the video ID was typed carries what the field held then.
  const fields = {
    ...streamFields.value,
    performances: streamFields.value.performances.map((p) => ({
      ...p,
      scenes: p.scenes.map((s) => ({ ...s, videoId })),
    })),
  };

  sending.value = true;
  clearBand();

  try {
    await postJson('/genet/streams', { videoId, ...fields });
  } catch (error) {
    const answer = streamAnswerFor('save', 'draft', error);

    if (answer.kind === 'band') {
      band.value = answer.band;
      invalidFields.value = answer.fields;
    }

    sending.value = false;

    return;
  }

  try {
    // The tunes typed into while it was new stay open with it (see the watch on `selected`).
    createdVideoId = videoId;
    selectedVideoId.value = videoId;
    adding.value = false;
    void refreshSidebarDrafts();
    await reload();
    createdVideoId = null;

    // A list that could not be read says nothing about the filter.
    if (loadError.value !== null) {
      detail.value = false;
      showToast(SAVE_TOAST.saveDraft);

      return;
    }

    // A new stream is always a draft - the status or title filter can leave
    // it out of the list, and the list then opens its first stream instead.
    if (selectedVideoId.value === videoId) {
      showToast(SAVE_TOAST.saveDraft);
    } else {
      detail.value = false;
      showToast(`${SAVE_TOAST.saveDraft}（現在の絞り込みでは非表示）`);
    }
  } finally {
    sending.value = false;
  }
}

/** 削除: a published stream cannot be, and its button cannot be pressed. */
async function remove(): Promise<void> {
  if (selected.value === null || footBusy.value) return;

  const { videoId, status } = selected.value;

  sending.value = true;
  clearBand();

  try {
    await deleteJson(removePath(`/genet/streams/${encodeURIComponent(videoId)}`, standOn ?? selected.value));
  } catch (error) {
    const answer = streamAnswerFor('delete', status, error);

    if (answer.kind === 'band') {
      band.value = answer.band;
      invalidFields.value = answer.fields;

      // Kept open even when another screen's change takes it out of the
      // filter, as a refused save does: closing it would throw away what is
      // typed into its tunes.
      if (answer.changed) await reload(videoId);
    }

    sending.value = false;

    return;
  }

  try {
    selectedVideoId.value = null;
    detail.value = false;
    showToast(EDITING_TEXT.removed);
    void refreshSidebarDrafts();
    await reload();
  } finally {
    sending.value = false;
  }
}

function addChip(list: string[], label: string): void {
  const value = window.prompt(`${label}を入力してください`);

  if (value === null || value.trim() === '') return;

  list.push(value.trim());
}

/* ---- 曲（tune）: 配信の performances[] とは別の資源 --------------------- */

const openIndex = ref<number | null>(null);
const tuneFieldsByIndex = ref<Map<number, TuneFormFields>>(new Map());
/**
 * Each open tune as last read from the worker, to tell what is unsaved in
 * `tuneFieldsByIndex`, and the version its 保存 sends back (#303). Replaced,
 * never changed in place.
 */
const tuneSavedByIndex = shallowRef<Map<number, { fields: TuneFormFields; version: number }>>(new Map());
/**
 * The latest read of each open tune, by index. A tune closed and opened again
 * before its first read lands starts a second one; whichever lands last must
 * not be the older one, or it replaces what was typed into the newer one.
 */
const latestTuneRead = new Map<number, number>();
let tuneReadCount = 0;
/** The open tune's band when it could not be read: the words the list uses when it cannot be. */
const TUNE_READ_FAILED = '読み込みに失敗しました';

function rememberSavedTune(index: number, tune: GenetTune): void {
  tuneFieldsByIndex.value.set(index, toTuneFormFields(tune));
  savedTuneAs(index, toTuneFormFields(tune), tune.version);
}

function savedTuneAs(index: number, fields: TuneFormFields, version: number): void {
  tuneSavedByIndex.value = new Map(tuneSavedByIndex.value).set(index, { fields, version });
}

/**
 * Takes in `tune`, read again after its 保存 was refused, keeping what is
 * typed (`fieldsOnReload`, #304): the fields not typed take what is saved
 * now, and the ones another screen changed too are marked (`tuneClashes`).
 */
function takeInTuneRead(index: number, tune: GenetTune): void {
  const fields = tuneFieldsByIndex.value.get(index);
  const saved = tuneSavedByIndex.value.get(index);

  if (fields === undefined || saved === undefined) {
    rememberSavedTune(index, tune);

    return;
  }

  const after = toTuneFormFields(tune);
  const reloaded = fieldsOnReload(fields, saved.fields, after);

  tuneFieldsByIndex.value.set(index, reloaded.fields);
  savedTuneAs(index, after, tune.version);

  // A read with nothing new from another screen - after the stream's 保存 was
  // refused, say - finds no clash of its own: the marks stay until 保存 or discard.
  setTuneClashes(index, clashesKept(tuneClashesByIndex.value.get(index) ?? [], reloaded, after));
}

function isTuneDirty(index: number): boolean {
  const fields = tuneFieldsByIndex.value.get(index);
  const saved = tuneSavedByIndex.value.get(index);

  return fields !== undefined && saved !== undefined && !sameFields(fields, saved.fields);
}

/** Against the saved stream, or a new stream's blank fields. */
const streamDirty = computed(() =>
  adding.value
    ? newVideoId.value !== '' || !sameFields(streamFields.value, emptyStreamFields())
    : selected.value !== null && !sameFields(streamFields.value, toStreamFormFields(selected.value)),
);
const tunesDirty = computed(() => [...tuneFieldsByIndex.value.keys()].some(isTuneDirty));
// The tunes' own 保存 is separate from the stream's, so either can be unsaved.
const dirty = computed(() => streamDirty.value || tunesDirty.value);

/** Puts the stream's saved fields back and closes the tunes, which are read again when opened. */
function discardEdits(): void {
  // What was thrown away was typed over the stream as shown, not over a save
  // the next read would answer (`savedSent`) - nor over one still on its way.
  savedSent = null;
  discards += 1;

  if (adding.value) {
    newVideoId.value = '';
    streamFields.value = emptyStreamFields();
    standOnStream(null);
  } else if (selected.value !== null) {
    streamFields.value = toStreamFormFields(selected.value);
    standOnStream(selected.value);
  }

  closeTunes();
}

useUnsavedGuard(() => dirty.value, discardEdits);

/** ← 一覧: on a narrow screen the editor stays behind the list, so what is let go here is thrown away. */
function back(): void {
  if (confirmDiscard()) detail.value = false;
}

/**
 * Whether performance `index` of the open stream is still the tune it was
 * when a request for it was sent. A stream switched, or a tune taken off
 * above it, moves what an index names while the request is on its way.
 */
function stillAt(index: number, videoId: string, tuneId: number): boolean {
  return currentVideoId.value === videoId && streamFields.value.performances[index]?.tuneId === tuneId;
}
const tuneSaving = ref(false);
const tuneBand = ref<PublishBand | null>(null);
const tuneInvalid = ref<readonly TuneFieldError[]>([]);
/**
 * Each tune's fields typed in that another screen changed too, by index,
 * found when it was read again after a refused 保存. Each is a whole field.
 * Kept until that tune is saved or its changes are discarded, as the other
 * tune caches are. Replaced, never changed in place.
 */
const tuneClashesByIndex = shallowRef<Map<number, readonly TuneFieldSection[]>>(new Map());
/** The open tune's clashes. */
const tuneClashes = computed<readonly TuneFieldSection[]>(() =>
  openIndex.value === null ? [] : (tuneClashesByIndex.value.get(openIndex.value) ?? []),
);
/** `tuneClashes` as the field errors they mark. */
const tuneClashErrors = computed<TuneFieldError[]>(() =>
  tuneClashes.value.map((section) => ({ section, index: null })),
);
const tuneQuery = ref('');
const tuneSearchResults = ref<{ tuneId: number; title: string }[]>([]);
const tuneSearchError = ref<string | null>(null);

function clearTuneBand(): void {
  tuneBand.value = null;
  tuneInvalid.value = [];
}

function setTuneClashes(index: number, clashes: readonly TuneFieldSection[]): void {
  const next = new Map(tuneClashesByIndex.value);

  if (clashes.length === 0) next.delete(index);
  else next.set(index, clashes);

  tuneClashesByIndex.value = next;
}

function tuneInvalidAt(section: TuneFieldError['section'], index: number | null = null): boolean {
  return (
    tuneInvalid.value.some((f) => f.section === section && (index === null || f.index === index)) ||
    (index === null && tuneClashes.value.includes(section))
  );
}

function tuneReasonIds(section: TuneFieldError['section'], index: number | null = null): string | undefined {
  return tuneBandReasonIds(
    tuneBand.value,
    [...tuneInvalid.value, ...tuneClashErrors.value],
    (f) => f.section === section && (index === null || f.index === index),
  );
}

/** `GET /admin/api/genet/tunes/:tuneId` and the `PUT`'s answer. */
interface TuneAnswer {
  tune: GenetTune;
  /** Whether a published stream performs the tune. */
  live: boolean;
}

function openTune(index: number): void {
  if (openIndex.value === index) {
    openIndex.value = null;

    return;
  }

  openIndex.value = index;
  clearTuneBand();

  if (!tuneFieldsByIndex.value.has(index)) void readTune(index);
}

/** Whether a failed request says it saved what it sent all the same. */
function savedAnyway(error: unknown): boolean {
  if (!(error instanceof AdminApiError)) return false;

  const body = error.body;

  return typeof body === 'object' && body !== null && 'saved' in body && body.saved === true;
}

/**
 * Reads the tune performance `index` names. A tune already read - read
 * again after its 保存 was refused, `afterRefusal` - keeps what is typed
 * (`takeInTuneRead`), and a read that fails leaves the refusal's band.
 */
async function readTune(index: number, afterRefusal = false): Promise<void> {
  const performance = streamFields.value.performances[index];

  if (performance === undefined) return;

  const videoId = currentVideoId.value;
  const read = ++tuneReadCount;

  latestTuneRead.set(index, read);

  try {
    const body = await getJson<TuneAnswer>(`/genet/tunes/${performance.tuneId}`);

    // A newer read for the same index, or performances that moved since,
    // which sent a read of their own if one was needed.
    if (latestTuneRead.get(index) !== read) return;

    latestTuneRead.delete(index);

    if (stillAt(index, videoId, performance.tuneId)) {
      takeInTuneRead(index, body.tune);
    } else {
      readOpenTuneAgain();
    }
  } catch (error) {
    if (latestTuneRead.get(index) !== read) return;

    latestTuneRead.delete(index);

    if (afterRefusal) return;

    tuneBand.value = {
      title: TUNE_READ_FAILED,
      lines: [],
      note: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Sends a read for the open tune when it has nothing read and none on its way (#284). */
function readOpenTuneAgain(): void {
  if (openTuneUnread(openIndex.value, tuneFieldsByIndex.value, latestTuneRead)) void readTune(openIndex.value!);
}

/** The tune open in the editor, with what the プレビュー needs to draw it - null until one is open and read. */
const previewTune = computed(() => {
  if (openIndex.value === null) return null;

  const performance = streamFields.value.performances[openIndex.value];
  const fields = tuneFieldsByIndex.value.get(openIndex.value);

  return performance === undefined || fields === undefined ? null : { tuneId: performance.tuneId, fields };
});

function tuneTitleFor(index: number): string {
  return tuneFieldsByIndex.value.get(index)?.title ?? `曲 #${streamFields.value.performances[index]?.tuneId ?? ''}`;
}

/**
 * この曲を保存. A tune a published stream performs reaches the public JSON in
 * the same request, or is refused, and nothing saved, when it would not pass
 * publishing (#284's 6-5). The streams are not read again: that would put the
 * saved stream back into the fields over anything typed there.
 */
async function saveTune(index: number): Promise<void> {
  const performance = streamFields.value.performances[index];
  const fields = tuneFieldsByIndex.value.get(index);

  if (performance === undefined || fields === undefined || busy.value) return;

  const version = tuneSavedByIndex.value.get(index)?.version;

  if (version === undefined) return;

  const videoId = currentVideoId.value;
  const sent = structuredClone(toRaw(fields));
  let answered: TuneAnswer | null = null;
  let error: unknown = null;

  tuneSaving.value = true;
  clearTuneBand();
  setTuneClashes(index, []);

  try {
    answered = await putJson<TuneAnswer>(`/genet/tunes/${performance.tuneId}`, writeBody(sent, { version }));
  } catch (caught) {
    error = caught;
  } finally {
    tuneSaving.value = false;
  }

  const live = answered?.live === true;
  const answer = tuneAnswerFor(live, error);

  if (answer.kind === 'done') {
    showToast(answer.toast);

    if (live) {
      void refreshSidebarDrafts();
      void loadPending();
    }

    if (answered !== null && stillAt(index, videoId, performance.tuneId)) {
      forgetTuneReads(performance.tuneId);

      if (!holdsNewerTune(index, answered.tune.version)) rememberSavedTune(index, answered.tune);

      followSavedTune(index, answered.tune);
    }

    return;
  }

  tuneBand.value = answer.band;
  tuneInvalid.value = answer.fields;

  if (answer.changed) {
    void refreshSidebarDrafts();
    void loadPending();

    if (!stillAt(index, videoId, performance.tuneId)) return;

    // Saved, though the public JSON could not be written: what was sent is
    // what is saved, at the version the answer says, and the tune's other
    // performances follow as after a save that reached it. A 404 changed nothing
    // here - the tune is gone. Anything else may be another screen's save
    // (#303), read again over what is typed.
    if (savedAnyway(error)) {
      const saved = savedTuneOf(error);
      const savedVersion = saved?.version ?? version;

      forgetTuneReads(performance.tuneId);

      if (!holdsNewerTune(index, savedVersion)) savedTuneAs(index, structuredClone(sent), savedVersion);

      if (saved !== null) followSavedTune(index, saved);
    } else if (!(error instanceof AdminApiError && error.status === 404)) {
      void readTune(index, true);
    }
  }
}

/** The tune a failed request says it saved, when its answer has the tune. */
function savedTuneOf(error: unknown): GenetTune | null {
  if (!(error instanceof AdminApiError)) return null;

  const body = error.body as { tune?: { version?: unknown } } | null;
  const tune = body?.tune;

  return typeof tune?.version === 'number' ? (tune as GenetTune) : null;
}

/**
 * A read sent before a save would answer an older version, for any
 * performance of the tune: one not read yet reads again when opened.
 */
function forgetTuneReads(tuneId: number): void {
  streamFields.value.performances.forEach((performance, at) => {
    if (performance.tuneId === tuneId) latestTuneRead.delete(at);
  });
}

/**
 * The same tune performed again further on is the same row, now at the
 * version saved: its fields follow, keeping what is typed there.
 */
function followSavedTune(index: number, tune: GenetTune): void {
  const tuneId = streamFields.value.performances[index]?.tuneId;

  for (const other of tuneFieldsByIndex.value.keys()) {
    if (
      other !== index &&
      streamFields.value.performances[other]?.tuneId === tuneId &&
      !holdsNewerTune(other, tune.version)
    ) {
      takeInTuneRead(other, tune);
    }
  }
}

/**
 * Whether performance `index` already holds a version of its tune newer than
 * `version`. Another screen's save can land between a save and its answer,
 * and a read since may have brought it: the answer must not take it back.
 */
function holdsNewerTune(index: number, version: number): boolean {
  const saved = tuneSavedByIndex.value.get(index);

  return saved !== undefined && saved.version > version;
}

// Every keystroke starts its own request - without this, an older one that
// resolves after a newer one can overwrite tuneSearchResults with results
// for a query the search box no longer shows, offering a stale "add" list.
let tuneSearchRequestId = 0;

async function searchTunes(): Promise<void> {
  tuneSearchError.value = null;

  const requestId = ++tuneSearchRequestId;

  if (tuneQuery.value.trim() === '') {
    tuneSearchResults.value = [];

    return;
  }

  try {
    const body = await getJson<{ tunes: { tuneId: number; title: string }[] }>(
      `/genet/tunes?q=${encodeURIComponent(tuneQuery.value.trim())}`,
    );

    if (requestId !== tuneSearchRequestId) return;

    tuneSearchResults.value = body.tunes;
  } catch (error) {
    if (requestId !== tuneSearchRequestId) return;

    // No results left standing, but tuneSearchError below keeps the template
    // from reading a failed search as "genuinely no such tune" and offering
    // 新しく作る over one that already exists.
    tuneSearchResults.value = [];
    tuneSearchError.value = error instanceof AdminApiError ? error.message : String(error);
  }
}

watch(tuneQuery, searchTunes);

function addPerformance(tuneId: number): void {
  streamFields.value.performances.push({ tuneId, description: null, scenes: [] });
  tuneQuery.value = '';
  tuneSearchResults.value = [];
}

async function addNewTune(): Promise<void> {
  const title = tuneQuery.value.trim();

  if (title === '') return;

  try {
    const body = await postJson<{ tune: GenetTune }>('/genet/tunes', emptyTuneFieldsWithTitle(title));

    rememberSavedTune(streamFields.value.performances.length, body.tune);
    addPerformance(body.tune.tuneId);
  } catch (error) {
    showToast(error instanceof AdminApiError ? error.message : String(error));
  }
}

function emptyTuneFieldsWithTitle(title: string): TuneFormFields {
  return { ...emptyTuneFields(), title };
}

function removePerformance(index: number): void {
  // The tune itself is not deleted, but what is typed into it goes with the row.
  if (isTuneDirty(index) && !window.confirm(EDITING_TEXT.confirmDiscardTune)) return;

  streamFields.value.performances.splice(index, 1);
  // A read on its way names an index that may now be another tune's, so its
  // answer is dropped; the open tune is read again below.
  latestTuneRead.clear();

  // Every cached entry after the removed one now belongs to the performance
  // that shifted into its old index - reindexing the whole map, rather than
  // only dropping the removed index, is what keeps openTune/saveTune reading
  // and writing the tune an index actually names after the splice.
  tuneFieldsByIndex.value = withoutIndex(tuneFieldsByIndex.value, index);
  tuneSavedByIndex.value = withoutIndex(tuneSavedByIndex.value, index);
  tuneClashesByIndex.value = withoutIndex(tuneClashesByIndex.value, index);

  if (openIndex.value === index) openIndex.value = null;
  else if (openIndex.value !== null && openIndex.value > index) openIndex.value -= 1;

  readOpenTuneAgain();
}

/* ---- 曲ごとの行編集: 小曲・作曲/作詞など・参考の動画・外部の資料 --------- */

function addSubtune(fields: TuneFormFields): void {
  fields.subtunes.push('');
}

function addAttribute(fields: TuneFormFields): void {
  fields.attributes.push({ name: null, text: '', people: [] });
}

function attributeMode(attr: Attribute): 'text' | 'people' {
  return attr.people.length > 0 ? 'people' : 'text';
}

// people.value[0] is only a placeholder for "the first real person" - when
// the list is pending, failed, or genuinely empty, there is no person to
// fall back to, and pushing personId: 0 would add a row this tune can never
// save (0 names no one).
function firstAvailablePerson(): GenetPerson | null {
  const person = people.value[0];

  if (person !== undefined) return person;

  showToast('人物が登録されていません');

  return null;
}

function toggleAttributeMode(attr: Attribute): void {
  if (attributeMode(attr) === 'text') {
    const person = firstAvailablePerson();

    if (person === null) return;

    attr.text = null;
    attr.people.push({ personId: person.personId, creditedAs: null, note: null });
  } else {
    attr.people = [];
    attr.text = '';
  }
}

function addAttributePerson(attr: Attribute): void {
  const person = firstAvailablePerson();

  if (person === null) return;

  attr.people.push({ personId: person.personId, creditedAs: null, note: null });
}

function onAttributeNameChange(attr: Attribute, value: string): void {
  if (value === 'その他…') {
    const name = window.prompt('項目名を入力してください');

    if (name === null || name.trim() === '') return;

    attr.name = name.trim();
    learnName(name.trim());

    return;
  }

  attr.name = value === '（名前なし）' ? null : value;
}

async function addNewPerson(): Promise<void> {
  const name = window.prompt('新しい人物の名前を入力してください');

  if (name === null || name.trim() === '') return;

  try {
    const body = await postJson<{ person: GenetPerson }>('/genet/people', {
      name: name.trim(),
      link: null,
      memo: null,
    });

    people.value.push(body.person);
    showToast('人物を登録しました');
  } catch (error) {
    showToast(error instanceof AdminApiError ? error.message : String(error));
  }
}

function addVideo(fields: TuneFormFields): void {
  fields.videos.push({ videoId: '', title: '', startSeconds: null, description: null });
}

function addScore(fields: TuneFormFields): void {
  fields.scores.push({ url: '', title: '' });
}

function addScene(performanceIndex: number): void {
  const performance = streamFields.value.performances[performanceIndex];

  if (performance === undefined) return;

  performance.scenes.push({ style: 'play', videoId: currentVideoId.value, startSeconds: null });
}

/* ---- Markdown の欄: 書く欄とすぐ下のプレビュー、4つの挿入ボタン ---------- */

interface PickerState {
  kind: MdLinkKind;
  target: HTMLTextAreaElement | HTMLInputElement;
  label: string;
  articleOrUrl: string;
  seconds: number;
  playLabel: string;
}

const PLAY_LABELS = ['ヴァイオリン演奏', '歌唱', 'ウクレレ演奏', 'フィドル演奏', '歌唱およびヴァイオリン演奏'];

const picker = ref<PickerState | null>(null);

function openPicker(kind: MdLinkKind, event: MouseEvent): void {
  const bar = (event.currentTarget as HTMLElement).closest('.md');
  const target = bar?.querySelector<HTMLTextAreaElement | HTMLInputElement>('textarea, input[type="text"]');

  if (!target) return;

  picker.value = {
    kind,
    target,
    label: '',
    articleOrUrl: '',
    seconds: 0,
    playLabel: PLAY_LABELS[0]!,
  };
}

function closePicker(): void {
  picker.value = null;
}

function confirmPicker(): void {
  if (picker.value === null) return;

  // The seconds field is free text (inputmode="numeric" only hints at a
  // keyboard, it does not reject input) - without this, a negative,
  // fractional, or non-numeric value would still be written into the `?t=`
  // this snippet inserts, which ytParts() elsewhere only ever reads back as
  // a decimal integer. Zero stays valid: it is a real position, the start of
  // the video.
  if (picker.value.kind === 'yt' && !(Number.isSafeInteger(picker.value.seconds) && picker.value.seconds >= 0)) {
    return;
  }

  const { kind, target, label } = picker.value;
  const snippetTarget =
    kind === 'yt'
      ? `${currentVideoId.value}?t=${picker.value.seconds}`
      : kind === 'url'
        ? picker.value.articleOrUrl
        : picker.value.articleOrUrl;
  const snippetLabel = kind === 'yt' ? picker.value.playLabel : label;

  if (snippetTarget.trim() === '' || snippetLabel.trim() === '') return;

  const snippet = mdSnippet(kind, snippetLabel, snippetTarget);
  const start = target.selectionStart ?? target.value.length;
  const end = target.selectionEnd ?? target.value.length;
  const { text, cursor } = insertAt(target.value, start, end, snippet);

  target.value = text;
  target.dispatchEvent(new Event('input'));
  requestAnimationFrame(() => target.setSelectionRange(cursor, cursor));

  closePicker();
}

function pickerTitle(kind: MdLinkKind): string {
  return kind === 'wiki' ? 'Wikipedia' : kind === 'wikien' ? '英語版 Wikipedia' : kind === 'yt' ? '配信の時刻' : 'URL';
}

onMounted(async () => {
  await Promise.all([load(), loadPeople()]);
});

watch([statusFilter, q], () => load());

useCrumbDetail(() =>
  adding.value
    ? streamFields.value.shortTitle || streamFields.value.title || UNTITLED
    : selected.value
      ? selected.value.shortTitle || selected.value.title
      : null,
);
</script>

<template>
  <div class="main sets" :class="{ detail }">
    <div class="setlist">
      <div class="toolbar">
        <h2>配信</h2>
        <HelpLink section="common" />
        <span class="grow"></span>
        <span class="sub num">{{ countText(streams.length, listTotal.total.value, filtered) }}</span>
        <button class="btn" type="button" @click="startAdding">＋ 追加</button>
      </div>
      <div class="setlist-filter">
        <input
          type="checkbox"
          :checked="allTicked(ticked, streams, keyOf)"
          :disabled="bulkProgress !== null || !streams.some(isTickable)"
          :aria-label="BULK_TEXT.selectAll"
          @change="ticked = toggleAll(ticked, streams, keyOf)"
        />
        <div class="seg" role="group" aria-label="状態で絞り込み">
          <button
            v-for="opt in STATUS_OPTIONS"
            :key="opt.value"
            type="button"
            :aria-pressed="statusFilter === opt.value"
            @click="setStatusFilter(opt.value)"
          >
            {{ opt.label }}
          </button>
        </div>
        <input
          :value="q"
          type="text"
          class="btn"
          placeholder="タイトルで絞り込み"
          aria-label="タイトルで絞り込み"
          @input="setQuery"
        />
      </div>
      <div class="setlist-items">
        <RepublishBand target="genet" :text="bandText" :held="pendingHeld" :reload="reloadPending" />
        <div v-if="loadError" class="empty-note">
          <b>読み込みに失敗しました</b>
          <div class="sub">{{ loadError }}</div>
          <button class="btn quiet" type="button" :disabled="loading" @click="confirmDiscard() && load()">
            再読み込み
          </button>
        </div>
        <div v-for="s in streams" :key="s.videoId" class="setlist-row">
          <span class="tick">
            <input
              v-if="isTickable(s)"
              type="checkbox"
              :checked="ticked.has(s.videoId)"
              :disabled="bulkProgress !== null"
              :aria-label="BULK_TEXT.select"
              @change="ticked = toggleTick(ticked, s.videoId)"
            />
          </span>
          <button
            class="setlist-item"
            type="button"
            :aria-current="s.videoId === selectedVideoId"
            @click="selectStream(s.videoId)"
          >
            <span class="t">{{ s.shortTitle || s.title }}</span>
            <span class="meta">
              <span class="num sub">{{ s.publishedAt.slice(0, 10) }}</span>
              <span class="sub">{{ s.performances.length }} 曲</span>
              <span class="chip" :class="liveMarkFor(s.status).tone">{{ liveMarkFor(s.status).label }}</span>
            </span>
          </button>
        </div>
      </div>
      <BulkPublishOutcome
        v-if="bulkOutcome && !bulkProgress"
        :outcome="bulkOutcome"
        :describe="streamLine"
        :key-of="keyOf"
        @close="bulkOutcome = null"
      />
      <BulkPublishBar
        :count="bulkTargets.length"
        :progress="bulkProgress"
        :disabled="busy"
        @publish="publishTicked"
        @clear="ticked = new Set()"
      />
    </div>

    <div v-if="selected || adding" class="editor">
      <SplitHandle />
      <div class="toolbar">
        <h2>
          {{
            adding ? streamFields.shortTitle || streamFields.title || UNTITLED : selected!.shortTitle || selected!.title
          }}
        </h2>
        <span v-if="selected" class="chip" :class="liveMarkFor(selected.status).tone">{{
          liveMarkFor(selected.status).label
        }}</span>
        <span v-if="dirty" class="chip waiting">{{ EDITING_TEXT.unsaved }}</span>
        <span class="grow"></span>
        <PreviewButton />
      </div>

      <!-- inert while the list is read, or a request is on its way: the answer puts saved fields back, or leaves the stream out of the list and closes the editor, over anything typed meanwhile. -->
      <div
        class="inspector-main"
        :class="{ 'with-preview': previewOpen }"
        :inert="loading || sending || tuneSaving || bulkProgress !== null || undefined"
      >
        <div class="scroller">
          <div v-if="band" class="editor-notice">
            <div class="panel flag" role="alert">
              <h4>{{ band.title }}</h4>
              <ul v-if="band.lines.length > 0" class="reasons">
                <li v-for="(line, i) in band.lines" :id="streamReasonId(i)" :key="i">{{ line }}</li>
              </ul>
              <div v-if="band.note" :id="STREAM_NOTE_ID" class="hint">{{ band.note }}</div>
            </div>
          </div>

          <div v-if="selectedChanged" class="editor-notice">
            <div class="panel flag">
              <h4>{{ PUBLISH_TEXT.changedTitle }}</h4>
            </div>
          </div>

          <div class="editor-section">
            <h3>配信</h3>
            <div class="field">
              <label for="f-video">動画 ID</label>
              <input
                id="f-video"
                type="text"
                :value="currentVideoId"
                :readonly="!adding"
                :aria-invalid="invalid('videoId')"
                :aria-describedby="reasonIds('videoId')"
                @input="newVideoId = ($event.target as HTMLInputElement).value"
              />
            </div>
            <div class="field">
              <label for="f-title">タイトル</label>
              <input
                id="f-title"
                v-model="streamFields.title"
                type="text"
                :aria-invalid="invalid('title')"
                :aria-describedby="reasonIds('title')"
              />
            </div>
            <div class="field">
              <label for="f-short">短いタイトル</label>
              <input
                id="f-short"
                type="text"
                :value="streamFields.shortTitle ?? ''"
                placeholder="省略時はタイトル"
                :aria-invalid="invalid('shortTitle')"
                @input="streamFields.shortTitle = ($event.target as HTMLInputElement).value || null"
              />
            </div>
            <div class="md">
              <div class="md-bar"><span id="f-categories-label" class="lab">カテゴリ</span></div>
              <div
                class="chipset"
                role="group"
                aria-labelledby="f-categories-label"
                :aria-invalid="invalid('categories')"
                :aria-describedby="reasonIds('categories')"
              >
                <span v-for="(c, i) in streamFields.categories" :key="c" class="chip-x"
                  >{{ c
                  }}<button
                    type="button"
                    :aria-label="`${c} を削除`"
                    @click="streamFields.categories = withoutItem(streamFields.categories, i)"
                  >
                    &times;
                  </button></span
                >
                <button class="md-ins" type="button" @click="addChip(streamFields.categories, 'カテゴリ')">＋</button>
              </div>
            </div>
            <div class="md">
              <div class="md-bar"><span id="f-keywords-label" class="lab">キーワード</span></div>
              <div
                class="chipset"
                role="group"
                aria-labelledby="f-keywords-label"
                :aria-invalid="invalid('keywords')"
                :aria-describedby="reasonIds('keywords')"
              >
                <span v-for="(k, i) in streamFields.keywords" :key="k" class="chip-x"
                  >{{ k
                  }}<button
                    type="button"
                    :aria-label="`${k} を削除`"
                    @click="streamFields.keywords = withoutItem(streamFields.keywords, i)"
                  >
                    &times;
                  </button></span
                >
                <button class="md-ins" type="button" @click="addChip(streamFields.keywords, 'キーワード')">＋</button>
              </div>
            </div>
            <div class="row2">
              <div class="field">
                <label for="f-vtype">種別</label>
                <select id="f-vtype" v-model="streamFields.videoType" :aria-invalid="invalid('videoType')">
                  <option v-for="t in VIDEO_TYPES" :key="t" :value="t">{{ t }}</option>
                </select>
              </div>
              <div class="field">
                <label for="f-platform">プラットフォーム</label>
                <select id="f-platform" v-model="streamFields.platform" :aria-invalid="invalid('platform')">
                  <option v-for="p in PLATFORMS" :key="p" :value="p">{{ p }}</option>
                </select>
              </div>
            </div>
            <div class="row2">
              <div class="field">
                <label for="f-pub">公開日時</label>
                <input
                  id="f-pub"
                  v-model="streamFields.publishedAt"
                  type="text"
                  :aria-invalid="invalid('publishedAt')"
                />
              </div>
              <div v-if="streamFields.platform !== 'youtube'" class="field">
                <label for="f-url">URL</label>
                <input
                  id="f-url"
                  type="text"
                  :value="streamFields.url ?? ''"
                  :aria-invalid="invalid('url')"
                  @input="streamFields.url = ($event.target as HTMLInputElement).value || null"
                />
              </div>
            </div>
            <div class="field">
              <label for="f-memo">メモ（非公開）</label>
              <textarea
                id="f-memo"
                :value="streamFields.memo ?? ''"
                :aria-invalid="invalid('memo')"
                :aria-describedby="reasonIds('memo')"
                @input="streamFields.memo = ($event.target as HTMLTextAreaElement).value || null"
              ></textarea>
            </div>
          </div>

          <div
            class="editor-section"
            role="group"
            aria-labelledby="f-performances-title"
            :aria-invalid="clashes.includes('performances')"
            :aria-describedby="clashes.includes('performances') ? reasonIds('performances') : undefined"
          >
            <h3 id="f-performances-title">曲 {{ streamFields.performances.length }} 件</h3>

            <div
              v-for="(perf, pi) in streamFields.performances"
              :key="pi"
              class="tune"
              :class="{ invalid: invalid('performances', pi) }"
            >
              <button
                class="tune-head"
                type="button"
                :aria-expanded="openIndex === pi"
                :aria-describedby="reasonIds('performances', pi)"
                @click="openTune(pi)"
              >
                <span class="no">{{ pi + 1 }}</span>
                <span class="t">{{ tuneTitleFor(pi) }}</span>
                <span class="sub num">tune_id {{ perf.tuneId }}</span>
                <span v-if="isTuneDirty(pi)" class="chip waiting">{{ EDITING_TEXT.unsaved }}</span>
                <span v-if="!perf.description" class="chip alarm">時刻なし</span>
                <span class="sub" aria-hidden="true">{{ openIndex === pi ? '▲' : '▼' }}</span>
              </button>

              <div v-if="openIndex === pi" class="tune-body">
                <div v-if="tuneBand" class="panel flag" role="alert">
                  <h4>{{ tuneBand.title }}</h4>
                  <ul v-if="tuneBand.lines.length > 0" class="reasons">
                    <li v-for="(line, i) in tuneBand.lines" :id="tuneReasonId(i)" :key="i">{{ line }}</li>
                  </ul>
                  <div v-if="tuneBand.note" :id="TUNE_NOTE_ID" class="hint">{{ tuneBand.note }}</div>
                </div>

                <div class="md">
                  <div class="md-bar">
                    <span class="lab">演奏方法と時刻</span>
                    <button class="md-ins" type="button" @click="openPicker('wiki', $event)">Wikipedia</button>
                    <button class="md-ins" type="button" @click="openPicker('wikien', $event)">英語版</button>
                    <button class="md-ins" type="button" @click="openPicker('yt', $event)">配信の時刻</button>
                    <button class="md-ins" type="button" @click="openPicker('url', $event)">URL</button>
                  </div>
                  <textarea
                    rows="2"
                    :value="perf.description ?? ''"
                    @input="perf.description = ($event.target as HTMLTextAreaElement).value || null"
                  ></textarea>
                  <div class="md-prev">
                    <span v-if="!perf.description" class="sub">（空）</span>
                    <span v-else v-html="markdownHtml(perf.description, [])"></span>
                  </div>
                </div>

                <div class="md">
                  <div class="md-bar">
                    <span class="lab">場面</span
                    ><button class="md-ins" type="button" @click="addScene(pi)">＋ 追加</button>
                  </div>
                  <div class="rows">
                    <span v-if="perf.scenes.length === 0" class="sub">なし</span>
                    <div v-for="(scene, si) in perf.scenes" :key="si" class="row-item two">
                      <select v-model="scene.style" aria-label="場面の種類">
                        <option v-for="st in SCENE_STYLES" :key="st" :value="st">{{ SCENE_STYLE_LABEL[st] }}</option>
                      </select>
                      <input
                        type="text"
                        :value="scene.startSeconds ?? ''"
                        placeholder="秒"
                        aria-label="秒"
                        @input="
                          scene.startSeconds =
                            ($event.target as HTMLInputElement).value === ''
                              ? null
                              : Number(($event.target as HTMLInputElement).value)
                        "
                      />
                      <button class="row-del" type="button" aria-label="場面を削除" @click="perf.scenes.splice(si, 1)">
                        &times;
                      </button>
                    </div>
                  </div>
                </div>

                <template v-if="tuneFieldsByIndex.get(pi)">
                  <div class="md">
                    <div class="md-bar">
                      <span class="lab">曲名</span>
                      <button class="md-ins" type="button" @click="openPicker('wiki', $event)">Wikipedia</button>
                      <button class="md-ins" type="button" @click="openPicker('wikien', $event)">英語版</button>
                      <button class="md-ins" type="button" @click="openPicker('yt', $event)">配信の時刻</button>
                      <button class="md-ins" type="button" @click="openPicker('url', $event)">URL</button>
                    </div>
                    <input
                      type="text"
                      v-model="tuneFieldsByIndex.get(pi)!.title"
                      :aria-invalid="tuneInvalidAt('title')"
                      :aria-describedby="tuneReasonIds('title')"
                    />
                    <div class="md-prev">
                      <span v-if="!tuneFieldsByIndex.get(pi)!.title" class="sub">（空）</span>
                      <span v-else v-html="markdownHtml(tuneFieldsByIndex.get(pi)!.title, [])"></span>
                    </div>
                  </div>

                  <div class="md">
                    <div class="md-bar">
                      <span class="lab">原題</span>
                      <button class="md-ins" type="button" @click="openPicker('wiki', $event)">Wikipedia</button>
                      <button class="md-ins" type="button" @click="openPicker('wikien', $event)">英語版</button>
                      <button class="md-ins" type="button" @click="openPicker('yt', $event)">配信の時刻</button>
                      <button class="md-ins" type="button" @click="openPicker('url', $event)">URL</button>
                    </div>
                    <input
                      type="text"
                      :value="tuneFieldsByIndex.get(pi)!.originalTitle ?? ''"
                      :aria-invalid="tuneInvalidAt('originalTitle')"
                      :aria-describedby="tuneReasonIds('originalTitle')"
                      @input="
                        tuneFieldsByIndex.get(pi)!.originalTitle = ($event.target as HTMLInputElement).value || null
                      "
                    />
                    <div class="md-prev">
                      <span v-if="!tuneFieldsByIndex.get(pi)!.originalTitle" class="sub">（空）</span>
                      <span v-else>{{ unescapeHtml(tuneFieldsByIndex.get(pi)!.originalTitle ?? '') }}</span>
                    </div>
                  </div>

                  <div class="md">
                    <div class="md-bar">
                      <span id="f-tune-subtunes-title" class="lab">小曲</span
                      ><button class="md-ins" type="button" @click="addSubtune(tuneFieldsByIndex.get(pi)!)">
                        ＋ 追加
                      </button>
                    </div>
                    <div
                      class="rows"
                      role="group"
                      aria-labelledby="f-tune-subtunes-title"
                      :aria-invalid="tuneClashes.includes('subtunes')"
                      :aria-describedby="tuneClashes.includes('subtunes') ? tuneReasonIds('subtunes') : undefined"
                    >
                      <span v-if="tuneFieldsByIndex.get(pi)!.subtunes.length === 0" class="sub">なし</span>
                      <div v-for="(_, si) in tuneFieldsByIndex.get(pi)!.subtunes" :key="si" class="row-item">
                        <input type="text" v-model="tuneFieldsByIndex.get(pi)!.subtunes[si]" aria-label="小曲" />
                        <button
                          class="row-del"
                          type="button"
                          aria-label="小曲を削除"
                          @click="tuneFieldsByIndex.get(pi)!.subtunes.splice(si, 1)"
                        >
                          &times;
                        </button>
                      </div>
                    </div>
                  </div>

                  <div class="md">
                    <div class="md-bar">
                      <span id="f-tune-attributes-title" class="lab">作曲・作詞など</span
                      ><button class="md-ins" type="button" @click="addAttribute(tuneFieldsByIndex.get(pi)!)">
                        ＋ 追加
                      </button>
                    </div>
                    <div
                      class="rows"
                      role="group"
                      aria-labelledby="f-tune-attributes-title"
                      :aria-invalid="tuneClashes.includes('attributes')"
                      :aria-describedby="tuneClashes.includes('attributes') ? tuneReasonIds('attributes') : undefined"
                    >
                      <span v-if="tuneFieldsByIndex.get(pi)!.attributes.length === 0" class="sub">なし</span>
                      <div
                        v-for="(attr, ai) in tuneFieldsByIndex.get(pi)!.attributes"
                        :key="ai"
                        class="attr-block"
                        :class="{ invalid: tuneInvalidAt('attributes', ai) }"
                      >
                        <div class="row-item">
                          <select
                            :value="attr.name ?? '（名前なし）'"
                            aria-label="項目の名前"
                            :aria-invalid="tuneInvalidAt('attributes', ai)"
                            :aria-describedby="tuneReasonIds('attributes', ai)"
                            @change="onAttributeNameChange(attr, ($event.target as HTMLSelectElement).value)"
                          >
                            <option>（名前なし）</option>
                            <option v-for="n in attrNameOptions(attr.name)" :key="n">{{ n }}</option>
                            <option>その他…</option>
                          </select>
                          <button
                            class="row-del"
                            type="button"
                            aria-label="項目を削除"
                            @click="tuneFieldsByIndex.get(pi)!.attributes.splice(ai, 1)"
                          >
                            &times;
                          </button>
                        </div>
                        <div class="switch-row">
                          <button
                            class="toggle"
                            type="button"
                            :aria-pressed="attributeMode(attr) === 'people'"
                            aria-label="人物から選択"
                            @click="toggleAttributeMode(attr)"
                          ></button>
                          <span class="sub">{{
                            attributeMode(attr) === 'people' ? '人物から選択' : 'テキストで入力'
                          }}</span>
                        </div>
                        <input
                          v-if="attributeMode(attr) === 'text'"
                          type="text"
                          :value="attr.text ?? ''"
                          aria-label="項目の中身"
                          @input="attr.text = ($event.target as HTMLInputElement).value || null"
                        />
                        <template v-else>
                          <div v-if="peopleLoadError" class="panel flag">
                            <h4>人物の一覧の読み込みに失敗しました</h4>
                            <div class="hint">{{ peopleLoadError }}</div>
                            <button class="btn" type="button" @click="loadPeople">再読み込み</button>
                          </div>
                          <div v-for="(person, pj) in attr.people" :key="pj" class="row-item two">
                            <select v-model="person.personId" aria-label="人">
                              <option v-for="p in people" :key="p.personId" :value="p.personId">{{ p.name }}</option>
                            </select>
                            <input
                              type="text"
                              :value="person.creditedAs ?? ''"
                              placeholder="表示名（省略時は人物名）"
                              aria-label="表示名"
                              @input="person.creditedAs = ($event.target as HTMLInputElement).value || null"
                            />
                            <button
                              class="row-del"
                              type="button"
                              aria-label="人物を削除"
                              @click="attr.people.splice(pj, 1)"
                            >
                              &times;
                            </button>
                            <span class="sub num full">person_id {{ person.personId }}</span>
                          </div>
                          <div class="row-actions">
                            <button class="md-ins" type="button" @click="addAttributePerson(attr)">
                              ＋ 人物を追加
                            </button>
                            <button class="md-ins" type="button" @click="addNewPerson">＋ 新しい人物を登録</button>
                          </div>
                        </template>
                      </div>
                    </div>
                  </div>

                  <div class="md">
                    <div class="md-bar">
                      <span id="f-tune-videos-title" class="lab">参考動画</span
                      ><button class="md-ins" type="button" @click="addVideo(tuneFieldsByIndex.get(pi)!)">
                        ＋ 追加
                      </button>
                    </div>
                    <div
                      class="rows"
                      role="group"
                      aria-labelledby="f-tune-videos-title"
                      :aria-invalid="tuneClashes.includes('videos')"
                      :aria-describedby="tuneClashes.includes('videos') ? tuneReasonIds('videos') : undefined"
                    >
                      <span v-if="tuneFieldsByIndex.get(pi)!.videos.length === 0" class="sub">なし</span>
                      <div v-for="(v, vi) in tuneFieldsByIndex.get(pi)!.videos" :key="vi" class="row-item two">
                        <input type="text" v-model="v.videoId" aria-label="動画 ID" />
                        <input type="text" v-model="v.title" aria-label="動画のタイトル" />
                        <button
                          class="row-del"
                          type="button"
                          aria-label="動画を削除"
                          @click="tuneFieldsByIndex.get(pi)!.videos.splice(vi, 1)"
                        >
                          &times;
                        </button>
                      </div>
                    </div>
                  </div>

                  <div class="md">
                    <div class="md-bar">
                      <span id="f-tune-scores-title" class="lab">外部資料</span
                      ><button class="md-ins" type="button" @click="addScore(tuneFieldsByIndex.get(pi)!)">
                        ＋ 追加
                      </button>
                    </div>
                    <div
                      class="rows"
                      role="group"
                      aria-labelledby="f-tune-scores-title"
                      :aria-invalid="tuneClashes.includes('scores')"
                      :aria-describedby="tuneClashes.includes('scores') ? tuneReasonIds('scores') : undefined"
                    >
                      <span v-if="tuneFieldsByIndex.get(pi)!.scores.length === 0" class="sub">なし</span>
                      <div v-for="(sc, si) in tuneFieldsByIndex.get(pi)!.scores" :key="si" class="row-item two">
                        <input type="text" v-model="sc.url" placeholder="https://imslp.org/..." aria-label="リンク" />
                        <input type="text" v-model="sc.title" aria-label="題" />
                        <button
                          class="row-del"
                          type="button"
                          aria-label="資料を削除"
                          @click="tuneFieldsByIndex.get(pi)!.scores.splice(si, 1)"
                        >
                          &times;
                        </button>
                      </div>
                    </div>
                  </div>

                  <div class="actions">
                    <button class="btn primary" type="button" :disabled="busy" @click="saveTune(pi)">
                      この曲を保存
                    </button>
                    <span class="grow"></span>
                    <button class="btn danger" type="button" @click="removePerformance(pi)">この配信から除外</button>
                  </div>
                </template>
              </div>
            </div>

            <div class="field">
              <label for="f-tune-q">曲の検索・新規作成</label>
              <input
                id="f-tune-q"
                v-model="tuneQuery"
                type="text"
                placeholder="曲名で絞り込み"
                :aria-invalid="noTuneRefused"
                :aria-describedby="noTuneRefused ? reasonIds('performances') : undefined"
              />
            </div>
            <div v-if="tuneSearchError" class="panel flag">
              <h4>曲の検索に失敗しました</h4>
              <div class="hint">{{ tuneSearchError }}</div>
              <button class="btn" type="button" @click="searchTunes">再読み込み</button>
            </div>
            <div v-else-if="tuneSearchResults.length > 0" class="rows">
              <button
                v-for="t in tuneSearchResults"
                :key="t.tuneId"
                class="setlist-item"
                type="button"
                @click="addPerformance(t.tuneId)"
              >
                <span class="t">{{ t.title }}</span>
              </button>
            </div>
            <div v-else-if="tuneQuery.trim() !== ''">
              <button class="btn" type="button" @click="addNewTune">「{{ tuneQuery }}」を新規作成</button>
            </div>
          </div>
        </div>
        <PreviewPane v-if="previewOpen" palette="genet">
          <GenetSongPreview
            v-if="previewTune"
            :tune="previewTune.fields"
            :tune-id="previewTune.tuneId"
            :stream="streamFields"
            :video-id="currentVideoId"
            :people="people"
          />
          <p v-else-if="openIndex !== null" class="preview-label">
            {{ tuneBand ? '曲の読み込みに失敗しました' : '読み込み中…' }}
          </p>
          <p v-else class="preview-label">曲が選択されていません</p>
        </PreviewPane>
      </div>

      <div v-if="adding" class="inspector-foot">
        <button class="btn primary" type="button" :disabled="footBusy" @click="create">{{ FOOT_TEXT.save }}</button>
        <span class="grow"></span>
        <button class="btn quiet" type="button" :disabled="busy" @click="stopAdding">キャンセル</button>
      </div>
      <div v-else class="inspector-foot">
        <button
          v-for="(button, i) in foot.actions"
          :key="button.action"
          class="btn"
          :class="{ primary: i === 0 }"
          type="button"
          :disabled="footBusy"
          @click="act(button.action)"
        >
          {{ button.label }}
        </button>
        <button class="btn back quiet" type="button" @click="back">← 一覧</button>
        <span class="grow"></span>
        <span class="foot-sep" aria-hidden="true"></span>
        <DeleteButton :disabled="footBusy || foot.deleteDisabled" @remove="remove" />
        <span v-if="foot.deleteReason" class="hint">{{ foot.deleteReason }}</span>
      </div>
    </div>
  </div>

  <div v-if="picker" class="picker" @click.self="closePicker">
    <div class="picker-box">
      <div class="picker-head">{{ pickerTitle(picker.kind) }}</div>
      <div class="picker-body">
        <template v-if="picker.kind === 'yt'">
          <div class="field">
            <label for="p-play">演奏方法</label>
            <select id="p-play" v-model="picker.playLabel">
              <option v-for="l in PLAY_LABELS" :key="l">{{ l }}</option>
            </select>
          </div>
          <div class="field">
            <label for="p-sec">秒（{{ clock(picker.seconds) }}）</label>
            <input id="p-sec" v-model.number="picker.seconds" type="text" inputmode="numeric" />
          </div>
        </template>
        <template v-else>
          <div class="field">
            <label for="p-label">表示テキスト</label>
            <input id="p-label" v-model="picker.label" type="text" />
          </div>
          <div class="field">
            <label for="p-target">{{ picker.kind === 'url' ? 'URL' : '記事名' }}</label>
            <input id="p-target" v-model="picker.articleOrUrl" type="text" />
          </div>
        </template>
        <div class="hint">
          挿入すると「{{
            mdSnippet(
              picker.kind,
              picker.kind === 'yt' ? picker.playLabel : picker.label || '…',
              picker.kind === 'yt' ? `${currentVideoId}?t=${picker.seconds}` : picker.articleOrUrl || '…',
            )
          }}」になります
        </div>
      </div>
      <div class="picker-foot">
        <button class="btn primary" type="button" @click="confirmPicker">挿入</button>
        <button class="btn quiet" type="button" @click="closePicker">キャンセル</button>
      </div>
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

/* Chips, performances or a tune's rows another screen changed too (`clashes`, `tuneClashes`): the global rule colours a border these have none of. */
.chipset[aria-invalid='true'],
.editor-section[aria-invalid='true'],
.rows[aria-invalid='true'] {
  border: 1px solid;
  border-radius: 6px;
}

.chipset[aria-invalid='true'],
.rows[aria-invalid='true'] {
  padding: 4px;
}

/* A tune, or one of its attributes, a refusal names. */
.tune.invalid {
  border-color: var(--a-danger);
}

.attr-block.invalid {
  outline: 1px solid var(--a-danger);
  outline-offset: 2px;
}
</style>
