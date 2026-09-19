<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';

import { AdminApiError, getJson, putJson } from '../lib/api';
import {
  fieldForSaveError,
  toFormFields,
  type Member,
  type MemberFieldKey,
  type MemberFormFields,
} from '../lib/members';
import { showToast } from '../lib/toast';

/**
 * メンバー (#144's data screens task) - #158's `GET`/`PUT /admin/api/members`
 * alone; there is no route to create one (a new member arrives through the
 * channel seed, #152) or delete one.
 */

const members = ref<Member[]>([]);
const loading = ref(false);
const loadError = ref<string | null>(null);
const selectedId = ref<string | null>(null);
const detail = ref(false);

const fields = ref<MemberFormFields | null>(null);
const saving = ref(false);
const errorMessage = ref<string | null>(null);
const errorField = ref<MemberFieldKey | null>(null);

const selected = computed(() => members.value.find((m) => m.channelId === selectedId.value) ?? null);

watch(selected, (member) => {
  fields.value = member === null ? null : toFormFields(member);
  errorMessage.value = null;
  errorField.value = null;
});

async function load(): Promise<void> {
  loading.value = true;
  loadError.value = null;

  try {
    const body = await getJson<{ members: Member[] }>('/members');

    members.value = body.members;

    if (selectedId.value === null && members.value.length > 0) {
      selectedId.value = members.value[0]!.channelId;
    }
  } catch (error) {
    loadError.value = error instanceof AdminApiError ? error.message : String(error);
  } finally {
    loading.value = false;
  }
}

function selectRow(channelId: string): void {
  selectedId.value = channelId;
  detail.value = true;
}

function back(): void {
  detail.value = false;
}

function addMember(): void {
  showToast('メンバーの追加は seed で行います');
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

onMounted(load);
</script>

<template>
  <div class="main" :class="{ detail }">
    <div class="pane">
      <div class="toolbar">
        <h2>メンバー</h2>
        <span class="grow"></span>
        <span class="sub num">{{ members.length }} 人</span>
        <button class="btn" type="button" @click="addMember">＋ メンバーを足す</button>
      </div>
      <div class="scroller">
        <div v-if="loadError" class="empty">
          <b>読み込めません</b>
          <div class="sub">{{ loadError }}</div>
        </div>
        <table class="grid">
          <thead>
            <tr>
              <th>順</th>
              <th>色</th>
              <th>名前</th>
              <th>活動開始</th>
              <th>活動終了</th>
              <th>channel_id</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="m in members"
              :key="m.channelId"
              :aria-selected="m.channelId === selectedId"
              tabindex="0"
              @click="selectRow(m.channelId)"
              @keydown.enter="selectRow(m.channelId)"
              @keydown.space.prevent="selectRow(m.channelId)"
            >
              <td class="num">{{ m.displayOrder }}</td>
              <td>
                <span class="who-chip"><i :style="{ background: m.colorKey }"></i></span>
              </td>
              <td>{{ m.name }}</td>
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

    <div v-if="selected && fields" class="inspector">
      <div class="inspector-head">
        <div style="flex: 1 1 auto; min-width: 0">
          <h3>{{ selected.name }}</h3>
          <div class="stack" style="margin-top: 4px">
            <span class="chip" :class="{ published: selected.activityEndDate === null }">{{
              selected.activityEndDate === null ? '活動中' : '活動終了'
            }}</span>
          </div>
        </div>
      </div>

      <div class="inspector-body">
        <div v-if="errorMessage" class="panel flag">
          <h4>保存できません</h4>
          <div class="hint">{{ errorMessage }}</div>
        </div>

        <div class="row2">
          <div class="field">
            <label for="f-order">表示順</label>
            <input
              id="f-order"
              type="text"
              :value="fields.displayOrder"
              :aria-invalid="errorField === 'displayOrder'"
              @input="fields.displayOrder = Number(($event.target as HTMLInputElement).value)"
            />
          </div>
          <div class="field">
            <label for="f-name">名前</label>
            <input id="f-name" v-model="fields.name" type="text" :aria-invalid="errorField === 'name'" />
          </div>
        </div>

        <div class="field">
          <label for="f-cid">channel_id</label>
          <input id="f-cid" type="text" :value="selected.channelId" readonly />
        </div>

        <div class="row2">
          <div class="field">
            <label for="f-start">活動開始</label>
            <input
              id="f-start"
              v-model="fields.activityStartDate"
              type="text"
              :aria-invalid="errorField === 'activityStartDate'"
            />
          </div>
          <div class="field">
            <label for="f-end">活動終了</label>
            <input
              id="f-end"
              type="text"
              :value="fields.activityEndDate ?? ''"
              placeholder="活動中"
              :aria-invalid="errorField === 'activityEndDate'"
              @input="fields.activityEndDate = ($event.target as HTMLInputElement).value || null"
            />
          </div>
        </div>

        <div class="panel" :class="{ flag: errorField === 'colorKey' || errorField === 'colorSub' }">
          <h4>色</h4>
          <div class="row2">
            <div class="field">
              <label for="f-color-key">key</label>
              <div style="display: flex; align-items: center; gap: 7px">
                <input id="f-color-key" v-model="fields.colorKey" type="text" />
                <span class="who-chip"
                  ><i :style="{ background: fields.colorKey, width: '16px', height: '16px' }"></i
                ></span>
              </div>
            </div>
            <div class="field">
              <label for="f-color-sub">sub</label>
              <div style="display: flex; align-items: center; gap: 7px">
                <input id="f-color-sub" v-model="fields.colorSub" type="text" />
                <span class="who-chip"
                  ><i :style="{ background: fields.colorSub, width: '16px', height: '16px' }"></i
                ></span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="inspector-foot">
        <button class="btn primary" type="button" :disabled="saving" @click="save">保存</button>
        <button class="btn back quiet" type="button" @click="back">← 一覧</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
[aria-invalid='true'] {
  border-color: var(--a-danger) !important;
}
</style>
