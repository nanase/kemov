<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';

import FootprintsInspector from '../components/FootprintsInspector.vue';
import { AdminApiError, getJson } from '../lib/api';
import { kindLabel, type FootprintsEvent, type FootprintsMember } from '../lib/footprints';
import { footprintsMarkFor, type FootprintsPending } from '../lib/footprints-publish';
import { selectionAfterReload } from '../lib/inbox';

/**
 * やること > 出典の確認待ち (#141): every あしあと row still marked so, whether
 * or not it is published. The panel is あしあと's own; its main button saves
 * the sources and clears the mark once they back the event.
 */

const events = ref<FootprintsEvent[]>([]);
const members = ref<FootprintsMember[]>([]);
const pending = ref<FootprintsPending | null>(null);
const loading = ref(false);
const loaded = ref(false);
const loadError = ref<string | null>(null);
const selectedId = ref<number | null>(null);
const detail = ref(false);

const selected = computed(() => events.value.find((e) => e.eventId === selectedId.value) ?? null);

function member(channelId: string): FootprintsMember | undefined {
  return members.value.find((m) => m.channelId === channelId);
}

let loadGeneration = 0;

async function load(): Promise<void> {
  loading.value = true;
  loadError.value = null;

  const generation = ++loadGeneration;
  const before = events.value.map((e) => String(e.eventId));

  try {
    const [body, waiting] = await Promise.all([
      getJson<{ events: FootprintsEvent[] }>('/inbox/source'),
      getJson<FootprintsPending>('/footprints/pending').catch(() => null),
    ]);

    if (generation !== loadGeneration) return;

    events.value = body.events;
    pending.value = waiting;
    loaded.value = true;

    const next = selectionAfterReload(
      before,
      body.events.map((e) => String(e.eventId)),
      selectedId.value === null ? null : String(selectedId.value),
    );

    selectedId.value = next === null ? null : Number(next);

    if (selectedId.value === null) detail.value = false;
  } catch (error) {
    if (generation !== loadGeneration) return;

    loadError.value = error instanceof AdminApiError ? error.message : String(error);
  } finally {
    if (generation === loadGeneration) loading.value = false;
  }
}

async function loadMembers(): Promise<void> {
  try {
    members.value = (await getJson<{ members: FootprintsMember[] }>('/members')).members;
  } catch {
    // The table falls back to the raw channelId when this fails.
  }
}

function selectRow(eventId: number): void {
  selectedId.value = eventId;
  detail.value = true;
}

onMounted(() => {
  load();
  loadMembers();
});
</script>

<template>
  <div class="main" :class="{ detail }">
    <div class="pane">
      <div class="toolbar">
        <h2>出典の確認待ち</h2>
        <span class="chip alarm num">{{ events.length }} 件</span>
      </div>
      <div class="scroller">
        <div v-if="loadError" class="empty-note">
          <b>読み込めません</b>
          <div class="sub">{{ loadError }}</div>
          <button class="btn quiet" type="button" :disabled="loading" @click="load">再読み込み</button>
        </div>
        <table v-else class="grid">
          <thead>
            <tr>
              <th>状態</th>
              <th>日付</th>
              <th>種類</th>
              <th>題</th>
              <th>メンバー</th>
              <th>出典</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="loaded && events.length === 0">
              <td colspan="6">
                <div class="empty-note"><b>出典の確認を待っている行はありません</b></div>
              </td>
            </tr>
            <tr
              v-for="e in events"
              :key="e.eventId"
              :aria-selected="e.eventId === selectedId"
              tabindex="0"
              @click="selectRow(e.eventId)"
              @keydown.enter="selectRow(e.eventId)"
            >
              <td>
                <span class="chip" :class="footprintsMarkFor(e.status, e.eventId, pending).tone">{{
                  footprintsMarkFor(e.status, e.eventId, pending).label
                }}</span>
              </td>
              <td class="num">{{ e.startDate }}</td>
              <td>
                <span class="chip kind">{{ kindLabel(e.kind) }}</span>
              </td>
              <td>
                <span class="clip">{{ e.title || '（無題）' }}</span>
              </td>
              <td>
                <span class="stack">
                  <span v-if="e.channelIds.length === 0" class="sub">—</span>
                  <span v-for="id in e.channelIds" v-else :key="id" class="who-chip">
                    <i :style="{ background: member(id)?.colorKey ?? '#9b9289' }"></i
                    ><span class="sub">{{ member(id)?.name ?? id }}</span>
                  </span>
                </span>
              </td>
              <td class="sub num">{{ e.sources.length }} 件</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
    <FootprintsInspector
      v-if="selected"
      :key="selected.eventId"
      :event="selected"
      :members="members"
      :pending="pending"
      mode="source"
      @changed="load"
      @back="detail = false"
    />
  </div>
</template>
