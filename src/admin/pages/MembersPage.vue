<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

import { AdminApiError, deleteJson, getJson, putJson } from '../lib/api';
import {
  MEMBER_TEXT,
  blankNewMember,
  fieldForSaveError,
  moveId,
  reconcileOrder,
  sameOrder,
  toFormFields,
  type Member,
  type MemberFieldKey,
  type MemberFormFields,
  type NewMemberFields,
} from '../lib/members';
import { clearDraft, draft } from '../lib/members-draft';
import { showToast } from '../lib/toast';

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

/** The blank form 「＋ メンバーを足す」 opens; it joins the list only through 一覧に足す. */
const newForm = ref<NewMemberFields | null>(null);
const fields = ref<MemberFormFields | null>(null);
const saving = ref(false);
const listSaving = ref(false);
const confirmingRemove = ref(false);
const errorMessage = ref<string | null>(null);
const errorField = ref<MemberFieldKey | null>(null);
const listError = ref<string | null>(null);

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

watch(selected, (member) => {
  fields.value = member === null ? null : toFormFields(member);
  errorMessage.value = null;
  errorField.value = null;
  confirmingRemove.value = false;
});

async function load(): Promise<void> {
  loading.value = true;
  loadError.value = null;

  try {
    const body = await getJson<{ members: Member[] }>('/members');

    saved.value = body.members;

    // Unsaved changes survive a reload: the order is reconciled with whoever
    // joined or left meanwhile rather than replaced by the saved one. A member
    // somebody else has since added under the same id is the saved one now, so
    // the unsaved copy goes - it would only be refused again.
    const taken = new Set(savedIds.value);

    draft.added = draft.added.filter((a) => !taken.has(a.channelId));

    if (draft.order !== null) {
      draft.order = reconcileOrder(draft.order, [...savedIds.value, ...draft.added.map((a) => a.channelId)]);
    }

    if (selectedId.value === null && rows.value.length > 0) {
      selectedId.value = rows.value[0]!.channelId;
    }
  } catch (error) {
    loadError.value = error instanceof AdminApiError ? error.message : String(error);
  } finally {
    loading.value = false;
  }
}

function selectRow(channelId: string): void {
  // The edit panel is inert while 保存 is in flight; so is the choice of what it shows.
  if (listSaving.value) return;

  newForm.value = null;
  selectedId.value = channelId;
  detail.value = true;
}

function back(): void {
  detail.value = false;
}

function addMember(): void {
  newForm.value = blankNewMember();
  selectedId.value = null;
  errorMessage.value = null;
  errorField.value = null;
  detail.value = true;
}

/** Puts the blank form's member at the end of the list. Nothing is written until 保存. */
function addToList(): void {
  const member = newForm.value;

  if (member === null) return;

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
  detail.value = false;
}

function move(channelId: string, delta: -1 | 1): void {
  draft.order = moveId(orderedIds.value, channelId, delta);
}

function discard(): void {
  clearDraft();
  listError.value = null;

  if (selectedAdded.value === null && selected.value === null) selectedId.value = rows.value[0]?.channelId ?? null;
}

async function saveList(): Promise<void> {
  listSaving.value = true;
  listError.value = null;

  try {
    await putJson('/members', { add: draft.added, order: orderedIds.value });
    clearDraft();
    await load();
    showToast('保存しました');
  } catch (error) {
    if (error instanceof AdminApiError && error.status === 409) {
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

  try {
    await putJson(`/members/${encodeURIComponent(selectedId.value)}`, fields.value);
    await load();
    showToast('保存しました');
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

async function removeSaved(): Promise<void> {
  if (selectedId.value === null) return;

  saving.value = true;
  errorMessage.value = null;

  try {
    await deleteJson(`/members/${encodeURIComponent(selectedId.value)}`);
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
</script>

<template>
  <div class="main" :class="{ detail }">
    <div class="pane">
      <div class="toolbar">
        <h2>メンバー</h2>
        <span v-if="dirty" class="chip waiting">{{ MEMBER_TEXT.unsaved }}</span>
        <span class="grow"></span>
        <span class="sub num">{{ rows.length }} 人</span>
        <!-- Always there, unsaved changes or not: a 409 from 保存 says to reload, and the draft is kept across it. -->
        <button class="btn quiet" type="button" :disabled="loading || listSaving" @click="load">再読み込み</button>
        <template v-if="dirty">
          <button class="btn quiet" type="button" :disabled="listSaving" @click="discard">
            {{ MEMBER_TEXT.discard }}
          </button>
          <button class="btn primary" type="button" :disabled="listSaving" @click="saveList">保存</button>
        </template>
        <button class="btn" type="button" :disabled="listSaving" @click="addMember">＋ メンバーを足す</button>
      </div>
      <div class="scroller">
        <div v-if="loadError" class="empty">
          <b>読み込めません</b>
          <div class="sub">{{ loadError }}</div>
        </div>
        <div v-if="listError" class="panel flag">
          <h4>保存できません</h4>
          <div class="hint">{{ listError }}</div>
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
                <span v-if="m.isNew" class="chip waiting">{{ MEMBER_TEXT.unsaved }}</span>
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

    <!-- inert while 保存 is in flight: the request already carries the draft as it was, and what is typed meanwhile would be cleared with it. -->
    <div v-if="activeFields" class="inspector" :inert="listSaving || undefined">
      <div class="inspector-head">
        <div style="flex: 1 1 auto; min-width: 0">
          <h3>{{ newForm ? MEMBER_TEXT.addHeading : activeName }}</h3>
          <div v-if="!newForm" class="stack" style="margin-top: 4px">
            <span class="chip" :class="{ published: activeEnded === null }">{{
              activeEnded === null ? '活動中' : '活動終了'
            }}</span>
            <span v-if="selectedAdded" class="chip waiting">{{ MEMBER_TEXT.unsaved }}</span>
          </div>
        </div>
      </div>

      <div class="inspector-body">
        <div v-if="errorMessage" class="panel flag">
          <h4>保存できません</h4>
          <div class="hint">{{ errorMessage }}</div>
        </div>

        <div class="field">
          <label for="f-cid">channel_id</label>
          <input v-if="newForm" id="f-cid" v-model="newForm.channelId" type="text" placeholder="UC…" />
          <input v-else id="f-cid" type="text" :value="selectedId" readonly />
        </div>

        <div class="row2">
          <div class="field">
            <label for="f-name">名前</label>
            <input id="f-name" v-model="activeFields.name" type="text" :aria-invalid="errorField === 'name'" />
          </div>
          <div class="field">
            <label for="f-fullname">fullname</label>
            <input
              id="f-fullname"
              v-model="activeFields.fullname"
              type="text"
              :aria-invalid="errorField === 'fullname'"
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
            <div class="field">
              <label for="f-color-key">key</label>
              <div style="display: flex; align-items: center; gap: 7px">
                <input id="f-color-key" v-model="activeFields.colorKey" type="text" placeholder="#RRGGBB" />
                <span class="who-chip"
                  ><i :style="{ background: activeFields.colorKey, width: '16px', height: '16px' }"></i
                ></span>
              </div>
            </div>
            <div class="field">
              <label for="f-color-sub">sub</label>
              <div style="display: flex; align-items: center; gap: 7px">
                <input id="f-color-sub" v-model="activeFields.colorSub" type="text" placeholder="#RRGGBB" />
                <span class="who-chip"
                  ><i :style="{ background: activeFields.colorSub, width: '16px', height: '16px' }"></i
                ></span>
              </div>
            </div>
          </div>
          <div class="row2">
            <div class="field">
              <label for="f-color-light">light</label>
              <div style="display: flex; align-items: center; gap: 7px">
                <input id="f-color-light" v-model="activeFields.colorLight" type="text" placeholder="#RRGGBB" />
                <span class="who-chip"
                  ><i :style="{ background: activeFields.colorLight, width: '16px', height: '16px' }"></i
                ></span>
              </div>
            </div>
            <div class="field">
              <label for="f-color-back">back</label>
              <div style="display: flex; align-items: center; gap: 7px">
                <input id="f-color-back" v-model="activeFields.colorBack" type="text" placeholder="#RRGGBB" />
                <span class="who-chip"
                  ><i :style="{ background: activeFields.colorBack, width: '16px', height: '16px' }"></i
                ></span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="inspector-foot">
        <template v-if="newForm">
          <button class="btn primary" type="button" @click="addToList">{{ MEMBER_TEXT.addToList }}</button>
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
[aria-invalid='true'] {
  border-color: var(--a-danger) !important;
}

.move {
  white-space: nowrap;
}

.move .btn {
  padding: 2px 8px;
  color: inherit;
}
</style>
