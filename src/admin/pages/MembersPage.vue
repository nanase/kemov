<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';

import MemberAvatar from '@/parts/MemberAvatar.vue';

import HelpLink from '../components/HelpLink.vue';
import SplitHandle from '../components/SplitHandle.vue';
import { AdminApiError, deleteJson, errorDetail, getJson, putJson } from '../lib/api';
import {
  LOOKUP_TEXT,
  blocksAdding,
  createRequestGate,
  isChannelIdShape,
  lookupFailure,
  lookupFound,
  lookupView,
  type ChannelLookup,
  type ChannelLookupBody,
} from '../lib/channel-lookup';
import { useCrumbDetail } from '../lib/crumb';
import {
  COLOR_KEYS,
  MEMBER_TEXT,
  blankNewMember,
  editWouldBeLost,
  fieldForSaveError,
  fieldsOnReload,
  isHexColor,
  memberOfListSaveError,
  moveId,
  normalizeColor,
  pickerValue,
  reconcileOrder,
  sameOrder,
  toFormFields,
  type ColorKey,
  type Member,
  type MemberFieldKey,
  type MemberFormFields,
  type NewMemberFields,
} from '../lib/members';
import { clearDraft, draft } from '../lib/members-draft';
import { forgetPublicData, previewOpen } from '../lib/preview';
import { showToast } from '../lib/toast';
import { EDITING_TEXT } from '../lib/editing';
import { confirmDiscard, useUnsavedGuard } from '../lib/unsaved-guard';

/**
 * メンバー (#144's data screens task, #211) - #158's `GET`/`PUT
 * /admin/api/members/:id`, and #211's add, order and delete.
 *
 * Adding a member and moving one are edits to the list, kept in `draft` until
 * the toolbar's 保存 sends them together (`PUT /admin/api/members`): the
 * public site never reads a half-moved list. Editing one member's own fields
 * and deleting one still save at once, as before.
 */

const saved = ref<Member[]>([]);
const loading = ref(false);
const loadError = ref<string | null>(null);
const selectedId = ref<string | null>(null);
const detail = ref(false);

/** The blank form 「＋ メンバーを追加」 opens; it joins the list only through 一覧に追加. */
const newForm = ref<NewMemberFields | null>(null);
const fields = ref<MemberFormFields | null>(null);
const saving = ref(false);
const listSaving = ref(false);

/**
 * A row's 保存 or 削除, or the list's 保存, is under way. Nothing starts another
 * request or changes what the panel shows until it is answered, so the answer
 * (an error, the panel closing, a read of the list) lands on the member it was
 * asked for; the buttons that would are disabled and their handlers return.
 */
const busy = computed(() => listSaving.value || saving.value);
const confirmingRemove = ref(false);
const errorMessage = ref<string | null>(null);
const errorField = ref<MemberFieldKey | null>(null);
const listError = ref<string | null>(null);

/**
 * A list save's 400 about an added member, kept over the list instead of
 * shown in the edit panel: set only when showing that member would throw away
 * what is typed there (`editWouldBeLost`). 該当の行を表示 shows it then.
 */
const rowError = ref<{ channelId: string; message: string; detail: string } | null>(null);
const shownRowError = computed(() => {
  const error = rowError.value;
  const member = error === null ? undefined : draft.added.find((a) => a.channelId === error.channelId);

  return error === null || member === undefined ? null : { ...error, name: member.name };
});

/** The id the edit panel's 保存できません banner has, for the fields it names to point at. */
const SAVE_ERROR_ID = 'members-save-error';

/** `aria-describedby` for `key`'s field: the banner, while the banner is about that field. */
function describedBy(key: MemberFieldKey): string | undefined {
  return errorField.value === key ? SAVE_ERROR_ID : undefined;
}

/**
 * What YouTube said about the channel_id typed in the new member's form (#276).
 * It is only drawn for the id it was asked for (`lookupView`), and a request
 * that is no longer the latest never writes here (`lookupGate`).
 */
const lookup = ref<ChannelLookup | null>(null);
const lookupGate = createRequestGate();
const lookupShown = computed(() => lookupView(newForm.value?.channelId ?? '', lookup.value));
const addBlocked = computed(() => blocksAdding(lookupShown.value));
/** The answer to draw while the view is `found`; `lookupView` has already checked it is for the id typed now. */
const foundLookup = computed(() =>
  lookupShown.value === 'found' && lookup.value?.status === 'found' ? lookup.value : null,
);

/** The id of the box that asks, for the 一覧に追加 button to point at while it is refused. */
const LOOKUP_ID = 'members-channel-lookup';

async function checkChannel(channelId: string): Promise<void> {
  const ticket = lookupGate.start();

  lookup.value = { status: 'loading', channelId };

  try {
    const body = await getJson<ChannelLookupBody>(`/channel-lookup/${encodeURIComponent(channelId)}`);

    if (lookupGate.isCurrent(ticket)) lookup.value = lookupFound(body);
  } catch (error) {
    if (lookupGate.isCurrent(ticket)) lookup.value = lookupFailure(error, channelId);
  }
}

// Asked once the id is 24 characters, not on every key: each question is a
// YouTube API call. Any other value - shorter, longer, or the form gone -
// drops the answer in flight as well as the one shown.
watch(
  () => newForm.value?.channelId.trim() ?? '',
  (channelId) => {
    if (isChannelIdShape(channelId)) {
      void checkChannel(channelId);
    } else {
      lookupGate.cancel();
      lookup.value = null;
    }
  },
);

const savedIds = computed(() => saved.value.map((m) => m.channelId));
const orderedIds = computed(() => draft.order ?? savedIds.value);
const dirty = computed(() => draft.added.length > 0 || !sameOrder(orderedIds.value, savedIds.value));

interface Row {
  channelId: string;
  name: string;
  colorKey: string;
  activityStartDate: string;
  activityEndDate: string | null;
  isNew: boolean;
}

const rows = computed<Row[]>(() => {
  const byId = new Map<string, Row>();

  for (const m of saved.value) byId.set(m.channelId, { ...m, isNew: false });
  for (const a of draft.added) byId.set(a.channelId, { ...a, isNew: true });

  return orderedIds.value.flatMap((id) => byId.get(id) ?? []);
});

const selected = computed(() => saved.value.find((m) => m.channelId === selectedId.value) ?? null);
const selectedAdded = computed(() => draft.added.find((a) => a.channelId === selectedId.value) ?? null);
const activeFields = computed<MemberFormFields | null>(() => newForm.value ?? selectedAdded.value ?? fields.value);
const activeName = computed(() =>
  newForm.value === null ? (selected.value?.name ?? selectedAdded.value?.name ?? '') : '',
);
const activeEnded = computed(() => (selected.value ?? selectedAdded.value)?.activityEndDate);

/**
 * What is typed in the edit panel and not yet kept (#286): a 「新しいメンバー」
 * form that is not blank, or a saved member's fields that differ from the saved
 * ones. An added member's own fields are not it: they are the draft's, and
 * `dirty` covers the draft.
 */
const editDirty = computed(() => editWouldBeLost(newForm.value, fields.value, selected.value));

/** What 変更を捨てる does: the panel shows what it showed before anything was typed. */
function discardEdit(): void {
  if (newForm.value !== null) {
    newForm.value = blankNewMember();
  } else if (selected.value !== null) {
    fields.value = toFormFields(selected.value);
  }

  errorMessage.value = null;
  errorField.value = null;
}

useUnsavedGuard(() => editDirty.value, discardEdit);

// The one place a response writes `fields`: every read of the list (a save, the
// list's 保存, 再読み込み, a delete) replaces `saved`, and so `selected`. What is
// typed stays over the new values (`fieldsOnReload`); the only other writers
// are the user's own typing and `discardEdit`, which they confirmed.
watch(selected, (member, previous) => {
  fields.value = fieldsOnReload(fields.value, previous, member);
  errorMessage.value = null;
  errorField.value = null;
  confirmingRemove.value = false;
});

/** Only the latest `load` writes: a slower, older one must not put its list over a newer one's (and so reset the fields a list save put back). */
const loadGate = createRequestGate();

async function load(): Promise<void> {
  const ticket = loadGate.start();

  loading.value = true;
  loadError.value = null;

  try {
    const body = await getJson<{ members: Member[] }>('/members');

    if (!loadGate.isCurrent(ticket)) return;

    saved.value = body.members;

    // Unsaved changes survive a reload: the order is reconciled with whoever
    // joined or left meanwhile rather than replaced by the saved one. A member
    // somebody else has since added under the same id is the saved one now, so
    // the unsaved copy goes - it would only be refused again.
    const taken = new Set(savedIds.value);

    draft.added = draft.added.filter((a) => !taken.has(a.channelId));

    if (rowError.value !== null && !draft.added.some((a) => a.channelId === rowError.value?.channelId)) {
      rowError.value = null;
    }

    if (draft.order !== null) {
      draft.order = reconcileOrder(draft.order, [...savedIds.value, ...draft.added.map((a) => a.channelId)]);
    }

    // Not while 「新しいメンバー」 is open: that form is what the panel shows, and no row is chosen.
    if (selectedId.value === null && newForm.value === null && rows.value.length > 0) {
      selectedId.value = rows.value[0]!.channelId;
    }
  } catch (error) {
    if (loadGate.isCurrent(ticket)) loadError.value = error instanceof AdminApiError ? error.message : String(error);
  } finally {
    if (loadGate.isCurrent(ticket)) loading.value = false;
  }
}

/** Reads the list again for 再読み込み. Returns while a read or `busy` is under way, as the button is disabled then. */
function reload(): void {
  if (loading.value || busy.value) return;

  if (confirmDiscard()) void load();
}

function selectRow(channelId: string): void {
  if (busy.value) return;

  // A click on the row the banner is about shows the error there, as the
  // banner's own button does: the banner has said all it had to. Only a click
  // does this - the selection also moves when a row is deleted.
  if (rowError.value?.channelId === channelId) {
    openErrorRow();
    return;
  }

  // Another row replaces what the edit panel shows; unsaved typing goes only if the user says so (#286).
  // The open 「新しいメンバー」 form goes too, even for the row that looks selected: 元に戻す
  // and a reload select the first row while the form is still open.
  if ((channelId !== selectedId.value || newForm.value !== null) && !confirmDiscard()) return;

  // What a failed save said is about the member it was shown for.
  if (channelId !== selectedId.value) {
    errorMessage.value = null;
    errorField.value = null;
  }

  newForm.value = null;
  selectedId.value = channelId;
  detail.value = true;
}

function back(): void {
  if (confirmDiscard()) detail.value = false;
}

function addMember(): void {
  if (busy.value) return;

  // A form already open is replaced by a blank one, and a member's typed changes go with it.
  if (!confirmDiscard()) return;

  newForm.value = blankNewMember();
  selectedId.value = null;
  errorMessage.value = null;
  errorField.value = null;
  detail.value = true;
}

/** Puts the blank form's member at the end of the list. Nothing is written until 保存. */
function addToList(): void {
  const member = newForm.value;

  if (member === null || addBlocked.value) return;

  member.channelId = member.channelId.trim();

  // Refused here rather than at 保存: a repeated id would show twice in the
  // list, and the server's 409 for it would read as "somebody else changed
  // the list" and come back on every later save.
  if (member.channelId === '') {
    showToast(MEMBER_TEXT.channelIdEmpty);
    return;
  }

  if (orderedIds.value.includes(member.channelId)) {
    showToast(MEMBER_TEXT.channelIdTaken);
    return;
  }

  normalizeColors(member);
  draft.order = [...orderedIds.value, member.channelId];
  draft.added.push(member);
  newForm.value = null;
  selectedId.value = member.channelId;
}

function removeAdded(): void {
  const id = selectedId.value;

  if (id === null) return;

  draft.added = draft.added.filter((a) => a.channelId !== id);
  draft.order = orderedIds.value.filter((other) => other !== id);
  selectedId.value = rows.value[0]?.channelId ?? null;
  if (rowError.value?.channelId === id) rowError.value = null;
  errorMessage.value = null;
  errorField.value = null;
  detail.value = false;
}

function move(channelId: string, delta: -1 | 1): void {
  draft.order = moveId(orderedIds.value, channelId, delta);
}

function discard(): void {
  if (busy.value) return;

  clearDraft();
  listError.value = null;
  rowError.value = null;
  errorMessage.value = null;
  errorField.value = null;

  if (newForm.value === null && selectedAdded.value === null && selected.value === null) {
    selectedId.value = rows.value[0]?.channelId ?? null;
  }
}

/**
 * Puts a list save's 400 where a one-member save's goes: the member it is
 * about is selected and the edit panel says why. The worker names the member;
 * which field is read from the worker's detail, as `save` does, so this screen does
 * not hold a second copy of the worker's checks.
 */
async function showAddedMemberError(channelId: string, message: string, refusedDetail: string): Promise<void> {
  newForm.value = null;
  selectedId.value = channelId;
  detail.value = true;

  // Changing the selection clears the edit panel's error (`watch(selected)`
  // above), and that runs after this line: set the error once it has.
  await nextTick();

  errorMessage.value = message;
  errorField.value = fieldForSaveError(refusedDetail);
}

/**
 * The button over the list, and a click on that row: the user chose to move,
 * so what is typed in the edit panel goes - once they have said it may (#286).
 * Only the move the save's 400 would have made itself is automatic and asks
 * nothing; that one stays over the list instead (`rowError`).
 */
function openErrorRow(): void {
  const error = rowError.value;

  if (error === null || busy.value || !confirmDiscard()) return;

  rowError.value = null;

  // The banner, and the button in it that may have had focus, is gone; the
  // field the error is about is where the user goes next.
  void showAddedMemberError(error.channelId, error.message, error.detail).then(async () => {
    await nextTick();
    document.querySelector<HTMLElement>('.inspector [aria-invalid="true"]')?.focus();
  });
}

async function saveList(): Promise<void> {
  if (busy.value) return;

  listSaving.value = true;
  listError.value = null;
  rowError.value = null;
  errorMessage.value = null;
  errorField.value = null;

  for (const member of draft.added) normalizeColors(member);

  try {
    await putJson('/members', { add: draft.added, order: orderedIds.value });
    forgetPublicData();
    clearDraft();
    await load();

    showToast('保存しました');
  } catch (error) {
    const channelId =
      error instanceof AdminApiError && error.status === 400
        ? memberOfListSaveError(
            error.body,
            draft.added.map((a) => a.channelId),
          )
        : null;

    if (error instanceof AdminApiError && channelId !== null) {
      // Moving to the member would replace what is typed in the edit panel;
      // say so over the list and leave the panel as it is.
      if (editWouldBeLost(newForm.value, fields.value, selected.value)) {
        rowError.value = { channelId, message: error.message, detail: errorDetail(error) };
      } else {
        await showAddedMemberError(channelId, error.message, errorDetail(error));
      }
    } else if (error instanceof AdminApiError && error.status === 409) {
      showToast(MEMBER_TEXT.listChanged);
    } else {
      listError.value = error instanceof AdminApiError ? error.message : String(error);
    }
  } finally {
    listSaving.value = false;
  }
}

async function save(): Promise<void> {
  if (selectedId.value === null || fields.value === null) return;

  saving.value = true;
  errorMessage.value = null;
  errorField.value = null;

  normalizeColors(fields.value);

  try {
    await putJson(`/members/${encodeURIComponent(selectedId.value)}`, fields.value);
    forgetPublicData();
    await load();
    showToast('保存しました');
  } catch (error) {
    if (error instanceof AdminApiError) {
      errorMessage.value = error.message;
      errorField.value = fieldForSaveError(errorDetail(error));
    } else {
      errorMessage.value = String(error);
    }
  } finally {
    saving.value = false;
  }
}

async function removeSaved(): Promise<void> {
  if (selectedId.value === null) return;

  saving.value = true;
  errorMessage.value = null;

  try {
    await deleteJson(`/members/${encodeURIComponent(selectedId.value)}`);
    forgetPublicData();
    selectedId.value = null;
    detail.value = false;
    await load();
    showToast(MEMBER_TEXT.removed);
  } catch (error) {
    confirmingRemove.value = false;

    if (error instanceof AdminApiError && error.status === 409) {
      showToast(MEMBER_TEXT.hasRecords);
    } else {
      errorMessage.value = error instanceof AdminApiError ? error.message : String(error);
    }
  } finally {
    saving.value = false;
  }
}

/** A nullable text column: an empty box is null, not the empty string the server would refuse. */
function setNullable(key: 'globalname' | 'twitter' | 'twitch' | 'activityEndDate', event: Event): void {
  if (activeFields.value === null) return;

  activeFields.value[key] = (event.target as HTMLInputElement).value || null;
}

/** A colour written without its `#` ("1a2b3c") is given one; anything else is left for the server to judge. */
function normalizeColors(target: MemberFormFields): void {
  for (const key of COLOR_KEYS) target[key] = normalizeColor(target[key]);
}

const COLOR_BOXES: readonly { key: ColorKey; id: string; label: string }[] = [
  { key: 'colorKey', id: 'f-color-key', label: 'key' },
  { key: 'colorSub', id: 'f-color-sub', label: 'sub' },
  { key: 'colorLight', id: 'f-color-light', label: 'light' },
  { key: 'colorBack', id: 'f-color-back', label: 'back' },
];

function colorText(key: ColorKey): string {
  return activeFields.value?.[key] ?? '';
}

function fixColor(key: ColorKey): void {
  if (activeFields.value === null) return;

  activeFields.value[key] = normalizeColor(activeFields.value[key]);
}

function pickColor(key: ColorKey, event: Event): void {
  if (activeFields.value === null) return;

  activeFields.value[key] = (event.target as HTMLInputElement).value;
}

// Closing or reloading the tab loses `draft`; only the browser's own
// confirmation is shown, so this screen adds no sentence of its own.
function warnBeforeUnload(event: BeforeUnloadEvent): void {
  if (dirty.value) event.preventDefault();
}

onMounted(() => {
  window.addEventListener('beforeunload', warnBeforeUnload);
  void load();
});

onBeforeUnmount(() => window.removeEventListener('beforeunload', warnBeforeUnload));

useCrumbDetail(() => (newForm.value ? MEMBER_TEXT.addHeading : activeFields.value ? activeName.value : null));

import PreviewButton from '../components/PreviewButton.vue';
import PreviewPane from '../components/PreviewPane.vue';

const MemberPreview = defineAsyncComponent(() => import('../components/previews/MemberPreview.vue'));
</script>

<template>
  <div class="main" :class="{ detail }">
    <div class="pane">
      <div class="toolbar">
        <h2>メンバー</h2>
        <HelpLink section="members" />
        <span v-if="dirty" class="chip waiting">{{ EDITING_TEXT.unsaved }}</span>
        <span class="grow"></span>
        <span class="sub num">{{ rows.length }} 人</span>
        <!-- Always there, unsaved changes or not: a 409 from 保存 says to reload, and the draft is kept across it. -->
        <button class="btn quiet" type="button" :disabled="loading || busy" @click="reload">再読み込み</button>
        <template v-if="dirty">
          <button class="btn quiet" type="button" :disabled="busy" @click="discard">
            {{ MEMBER_TEXT.discard }}
          </button>
          <button class="btn primary" type="button" :disabled="busy" @click="saveList">保存</button>
        </template>
        <button class="btn" type="button" :disabled="busy" @click="addMember">＋ メンバーを追加</button>
      </div>
      <div class="scroller">
        <div v-if="loadError" class="empty-note">
          <b>読み込みに失敗しました</b>
          <div class="sub">{{ loadError }}</div>
        </div>
        <div v-if="listError" class="panel flag">
          <h4>保存できません</h4>
          <div class="hint">{{ listError }}</div>
        </div>
        <div v-if="shownRowError" class="panel flag" role="alert">
          <h4>保存できません</h4>
          <div class="hint">{{ MEMBER_TEXT.rowErrorLead(shownRowError.name, shownRowError.channelId) }}</div>
          <div class="hint">{{ shownRowError.message }}</div>
          <div class="stack">
            <button class="btn" type="button" :disabled="busy" @click="openErrorRow">
              {{ MEMBER_TEXT.openErrorRow }}
            </button>
          </div>
        </div>
        <table class="grid">
          <thead>
            <tr>
              <th>順</th>
              <th></th>
              <th>色</th>
              <th>名前</th>
              <th>活動開始</th>
              <th>活動終了</th>
              <th>channel_id</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(m, index) in rows"
              :key="m.channelId"
              :aria-selected="m.channelId === selectedId"
              tabindex="0"
              @click="selectRow(m.channelId)"
              @keydown.enter="selectRow(m.channelId)"
              @keydown.space.prevent="selectRow(m.channelId)"
            >
              <td class="num">{{ index }}</td>
              <td class="move" @click.stop @keydown.stop>
                <button
                  class="btn quiet"
                  type="button"
                  :aria-label="MEMBER_TEXT.moveUp(m.name)"
                  :title="MEMBER_TEXT.moveUp(m.name)"
                  :disabled="listSaving || index === 0"
                  @click="move(m.channelId, -1)"
                >
                  ↑
                </button>
                <button
                  class="btn quiet"
                  type="button"
                  :aria-label="MEMBER_TEXT.moveDown(m.name)"
                  :title="MEMBER_TEXT.moveDown(m.name)"
                  :disabled="listSaving || index === rows.length - 1"
                  @click="move(m.channelId, 1)"
                >
                  ↓
                </button>
              </td>
              <td>
                <span class="who-chip"><i :style="{ background: m.colorKey }"></i></span>
              </td>
              <td>
                {{ m.name }}
                <span v-if="m.isNew" class="chip waiting">{{ EDITING_TEXT.unsaved }}</span>
              </td>
              <td class="num sub">{{ m.activityStartDate }}</td>
              <td class="num sub">{{ m.activityEndDate ?? '—' }}</td>
              <td class="num sub">
                <span class="clip">{{ m.channelId }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- inert while a request is in flight: the list's 保存 already carries the draft as it was, and what is typed meanwhile would be cleared with it; a row's 保存, a 削除 or a read of the list is answered with saved values, which would meet a field typed in just then. -->
    <div v-if="activeFields" class="inspector" :inert="loading || busy || undefined">
      <SplitHandle />
      <div class="inspector-head">
        <div>
          <h3>{{ newForm ? MEMBER_TEXT.addHeading : activeName }}</h3>
          <div v-if="!newForm" class="stack">
            <span class="chip" :class="{ published: activeEnded === null }">{{
              activeEnded === null ? '活動中' : '活動終了'
            }}</span>
            <span v-if="selectedAdded || editDirty" class="chip waiting">{{ EDITING_TEXT.unsaved }}</span>
          </div>
          <div v-else-if="editDirty" class="stack">
            <span class="chip waiting">{{ EDITING_TEXT.unsaved }}</span>
          </div>
        </div>
        <PreviewButton />
      </div>

      <div class="inspector-main" :class="{ 'with-preview': previewOpen }">
        <div class="inspector-body">
          <div v-if="errorMessage" :id="SAVE_ERROR_ID" class="panel flag">
            <h4>保存できません</h4>
            <div class="hint">{{ errorMessage }}</div>
          </div>

          <div class="field">
            <label for="f-cid">channel_id</label>
            <input v-if="newForm" id="f-cid" v-model="newForm.channelId" type="text" placeholder="UC…" />
            <input v-else id="f-cid" type="text" :value="selectedId" readonly />
            <div v-if="newForm" :id="LOOKUP_ID" class="lookup" aria-live="polite">
              <p v-if="lookupShown === 'loading'" class="lookup-row hint">
                <span class="lookup-icon" aria-hidden="true"></span>
                {{ LOOKUP_TEXT.loading }}
              </p>
              <div v-else-if="foundLookup" class="lookup-row">
                <MemberAvatar
                  :src="foundLookup.iconDataUrl"
                  :name="foundLookup.title"
                  :color="null"
                  :size="40"
                  :dark="false"
                />
                <div>
                  <div class="lookup-title">{{ foundLookup.title }}</div>
                </div>
              </div>
              <div v-else-if="lookupShown === 'notFound'" class="panel flag">
                <h4>{{ LOOKUP_TEXT.notFoundHeading }}</h4>
              </div>
              <div v-else-if="lookupShown === 'failed'" class="panel">
                <h4>{{ LOOKUP_TEXT.failedHeading }}</h4>
                <div class="stack">
                  <button class="btn" type="button" @click="checkChannel(newForm.channelId.trim())">
                    {{ LOOKUP_TEXT.retry }}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div class="row2">
            <div class="field">
              <label for="f-name">名前</label>
              <input
                id="f-name"
                v-model="activeFields.name"
                type="text"
                :aria-invalid="errorField === 'name'"
                :aria-describedby="describedBy('name')"
              />
            </div>
            <div class="field">
              <label for="f-fullname">fullname</label>
              <input
                id="f-fullname"
                v-model="activeFields.fullname"
                type="text"
                :aria-invalid="errorField === 'fullname'"
                :aria-describedby="describedBy('fullname')"
              />
            </div>
          </div>

          <div class="row2">
            <div class="field">
              <label for="f-globalname">globalname</label>
              <input
                id="f-globalname"
                type="text"
                :value="activeFields.globalname ?? ''"
                :aria-invalid="errorField === 'globalname'"
                :aria-describedby="describedBy('globalname')"
                @input="setNullable('globalname', $event)"
              />
            </div>
            <div class="field">
              <label for="f-twitter">twitter</label>
              <input
                id="f-twitter"
                type="text"
                :value="activeFields.twitter ?? ''"
                :aria-invalid="errorField === 'twitter'"
                :aria-describedby="describedBy('twitter')"
                @input="setNullable('twitter', $event)"
              />
            </div>
          </div>

          <div class="field">
            <label for="f-twitch">twitch</label>
            <input
              id="f-twitch"
              type="text"
              :value="activeFields.twitch ?? ''"
              :aria-invalid="errorField === 'twitch'"
              :aria-describedby="describedBy('twitch')"
              @input="setNullable('twitch', $event)"
            />
          </div>

          <div class="row2">
            <div class="field">
              <label for="f-start">活動開始</label>
              <input
                id="f-start"
                v-model="activeFields.activityStartDate"
                type="text"
                placeholder="YYYY-MM-DD"
                :aria-invalid="errorField === 'activityStartDate'"
                :aria-describedby="describedBy('activityStartDate')"
              />
            </div>
            <div class="field">
              <label for="f-end">活動終了</label>
              <input
                id="f-end"
                type="text"
                :value="activeFields.activityEndDate ?? ''"
                placeholder="活動中"
                :aria-invalid="errorField === 'activityEndDate'"
                :aria-describedby="describedBy('activityEndDate')"
                @input="setNullable('activityEndDate', $event)"
              />
            </div>
          </div>

          <div
            class="panel"
            :class="{
              flag:
                errorField === 'colorKey' ||
                errorField === 'colorSub' ||
                errorField === 'colorLight' ||
                errorField === 'colorBack',
            }"
          >
            <h4>色</h4>
            <div class="row2">
              <div v-for="box in COLOR_BOXES" :key="box.key" class="field">
                <label :for="box.id">{{ box.label }}</label>
                <div class="color-input">
                  <input
                    :id="box.id"
                    type="text"
                    placeholder="#RRGGBB"
                    :value="colorText(box.key)"
                    :aria-invalid="errorField === box.key"
                    :aria-describedby="describedBy(box.key)"
                    @input="activeFields[box.key] = ($event.target as HTMLInputElement).value"
                    @change="fixColor(box.key)"
                  />
                  <input
                    class="color-pick"
                    :class="{ unset: !isHexColor(colorText(box.key)) }"
                    type="color"
                    :value="pickerValue(colorText(box.key))"
                    :aria-label="MEMBER_TEXT.pickColor(box.label)"
                    :title="MEMBER_TEXT.pickColor(box.label)"
                    @input="pickColor(box.key, $event)"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
        <PreviewPane v-if="previewOpen">
          <MemberPreview
            :fields="activeFields"
            :channel-id="newForm ? newForm.channelId : (selectedId ?? '')"
            :has-icon="(selected?.thumbnailUrl ?? null) !== null"
          />
        </PreviewPane>
      </div>

      <div class="inspector-foot">
        <template v-if="newForm">
          <button
            class="btn primary"
            type="button"
            :disabled="addBlocked"
            :aria-describedby="addBlocked ? LOOKUP_ID : undefined"
            @click="addToList"
          >
            {{ MEMBER_TEXT.addToList }}
          </button>
        </template>
        <template v-else-if="selectedAdded">
          <button class="btn danger" type="button" @click="removeAdded">{{ MEMBER_TEXT.removeAdded }}</button>
        </template>
        <template v-else>
          <button class="btn primary" type="button" :disabled="saving" @click="save">保存</button>
        </template>
        <button class="btn back quiet" type="button" @click="back">← 一覧</button>
        <template v-if="selected && !newForm">
          <span class="grow"></span>
          <span class="foot-sep" aria-hidden="true"></span>
          <template v-if="confirmingRemove">
            <button class="btn danger" type="button" :disabled="saving" @click="removeSaved">
              {{ MEMBER_TEXT.removeConfirm }}
            </button>
            <button class="btn quiet" type="button" @click="confirmingRemove = false">
              {{ MEMBER_TEXT.removeCancel }}
            </button>
          </template>
          <button v-else class="btn danger" type="button" :disabled="saving" @click="confirmingRemove = true">
            {{ MEMBER_TEXT.remove }}
          </button>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.move {
  white-space: nowrap;
}

.lookup p {
  margin: 0;
}

.lookup-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.lookup-title {
  font-weight: 700;
  overflow-wrap: anywhere;
}

/* The same size as the avatar it becomes, so the form does not move when the answer comes. */
.lookup-icon {
  flex: none;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--k-line);
}

.move .btn {
  padding: 2px 8px;
  color: inherit;
}
</style>
