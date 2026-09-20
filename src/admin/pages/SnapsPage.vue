<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';

import { AdminApiError, deleteJson, getJson, putJson } from '../lib/api';
import {
  defaultDayRange,
  jstClock,
  snapshotsQuery,
  todayJst,
  type SnapshotDay,
  type SnapshotTick,
} from '../lib/snapshots';
import { showToast } from '../lib/toast';

/**
 * 統計 (#144's data screens task). One channel at a time, matching the
 * mock's own channel `<select>` - `GET /admin/api/snapshots` (added
 * alongside this screen) answers for one `channelId` or every channel at
 * once, and a day-by-day history mixing every channel's own ticks together
 * would not read as anything. The day-level list opens into a tick-level
 * one for a single day, the same two-level drill-down the mock's own
 * `snapsTable`/`state.snap.day` gives it.
 */

interface Member {
  channelId: string;
  name: string;
}

const members = ref<Member[]>([]);
const channelId = ref<string | null>(null);

const days = ref<SnapshotDay[]>([]);
const ticks = ref<SnapshotTick[]>([]);
const openDay = ref<string | null>(null);
const selectedFetchedAt = ref<string | null>(null);
const detail = ref(false);

const loading = ref(false);
const loadError = ref<string | null>(null);
const memberLoadError = ref<string | null>(null);
const saving = ref(false);

const reasonDraft = ref('');

const selectedTick = computed(() => ticks.value.find((t) => t.fetchedAt === selectedFetchedAt.value) ?? null);
const troubleDays = computed(() => days.value.filter((d) => d.excluded > 0).length);

watch(selectedTick, (tick) => {
  reasonDraft.value = tick?.reason ?? '';
});

async function loadMembers(): Promise<void> {
  memberLoadError.value = null;

  try {
    const body = await getJson<{ members: Member[] }>('/members');

    members.value = body.members;

    if (channelId.value === null && members.value.length > 0) {
      channelId.value = members.value[0]!.channelId;
    }
  } catch (error) {
    // loadDays below never runs without a channelId, so a silent failure
    // here left the whole screen blank with nothing saying why.
    memberLoadError.value = error instanceof AdminApiError ? error.message : String(error);
  }
}

// Switching channels mid-request starts a second, overlapping GET
// /snapshots - without this, a slower earlier response can resolve after a
// faster later one and overwrite the day list with another channel's rows.
let daysRequestId = 0;

async function loadDays(): Promise<void> {
  if (channelId.value === null) return;

  loading.value = true;
  loadError.value = null;

  const requestId = ++daysRequestId;

  try {
    const { from, to } = defaultDayRange(todayJst());
    const body = await getJson<{ days: SnapshotDay[] }>(`/snapshots${snapshotsQuery(channelId.value, from, to)}`);

    if (requestId !== daysRequestId) return;

    days.value = [...body.days].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  } catch (error) {
    if (requestId !== daysRequestId) return;

    loadError.value = error instanceof AdminApiError ? error.message : String(error);
  } finally {
    if (requestId === daysRequestId) loading.value = false;
  }
}

// Same race as loadDays above, for opening a different day before the first
// one's ticks have come back.
let ticksRequestId = 0;

async function openDayView(date: string): Promise<void> {
  if (channelId.value === null) return;

  loading.value = true;
  loadError.value = null;

  const requestId = ++ticksRequestId;

  try {
    const body = await getJson<{ ticks: SnapshotTick[] }>(`/snapshots${snapshotsQuery(channelId.value, date, date)}`);

    if (requestId !== ticksRequestId) return;

    ticks.value = [...body.ticks].sort((a, b) => (a.fetchedAt < b.fetchedAt ? 1 : -1));
    openDay.value = date;
    selectedFetchedAt.value = null;
    detail.value = false;
  } catch (error) {
    if (requestId !== ticksRequestId) return;

    loadError.value = error instanceof AdminApiError ? error.message : String(error);
  } finally {
    if (requestId === ticksRequestId) loading.value = false;
  }
}

function backToDays(): void {
  openDay.value = null;
  ticks.value = [];
}

function selectTick(fetchedAt: string): void {
  selectedFetchedAt.value = fetchedAt;
  detail.value = true;
}

async function toggleExcluded(): Promise<void> {
  const tick = selectedTick.value;

  if (tick === null || channelId.value === null) return;

  saving.value = true;

  try {
    if (tick.excluded) {
      await deleteJson(
        `/snapshot-exclusions/${encodeURIComponent(channelId.value)}/${encodeURIComponent(tick.fetchedAt)}`,
      );
      showToast('集計から除くのをやめました');
    } else {
      if (reasonDraft.value.trim() === '') {
        showToast('除く理由を書いてください');

        return;
      }

      await putJson(
        `/snapshot-exclusions/${encodeURIComponent(channelId.value)}/${encodeURIComponent(tick.fetchedAt)}`,
        {
          reason: reasonDraft.value,
        },
      );
      showToast('集計から除きました');
    }

    if (openDay.value !== null) await openDayView(openDay.value);
    await loadDays();
  } catch (error) {
    showToast(error instanceof AdminApiError ? error.message : String(error));
  } finally {
    saving.value = false;
  }
}

watch(channelId, () => {
  backToDays();
  loadDays();
});

onMounted(async () => {
  await loadMembers();
  await loadDays();
});
</script>

<template>
  <div class="main" :class="{ detail }">
    <div v-if="openDay === null" class="pane">
      <div class="toolbar">
        <h2>統計</h2>
        <select v-model="channelId" aria-label="チャンネル">
          <option v-for="m in members" :key="m.channelId" :value="m.channelId">{{ m.name }}</option>
        </select>
        <span class="grow"></span>
        <span class="sub num">{{ days.length }} 日</span>
        <span v-if="troubleDays > 0" class="chip alarm">処置が必要な日 {{ troubleDays }} 日</span>
      </div>
      <div class="scroller">
        <div v-if="loadError || memberLoadError" class="empty">
          <b>読み込めません</b>
          <div class="sub">{{ loadError ?? memberLoadError }}</div>
        </div>
        <table v-if="!memberLoadError" class="grid">
          <thead>
            <tr>
              <th>扱い</th>
              <th>日</th>
              <th>tick</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="d in days"
              :key="d.date"
              tabindex="0"
              @click="openDayView(d.date)"
              @keydown.enter="openDayView(d.date)"
              @keydown.space.prevent="openDayView(d.date)"
            >
              <td>
                <span v-if="d.excluded > 0" class="chip alarm">除く {{ d.excluded }}</span>
                <span v-else class="chip published">使う</span>
              </td>
              <td class="num">{{ d.date }}</td>
              <td class="num sub">{{ d.ticks }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-else class="pane">
      <div class="toolbar">
        <button class="btn quiet" type="button" @click="backToDays">← 日ごとへ</button>
        <h2>{{ openDay }}</h2>
        <span class="grow"></span>
        <span class="sub num">{{ ticks.length }} tick</span>
      </div>
      <div class="scroller">
        <table class="grid">
          <thead>
            <tr>
              <th>扱い</th>
              <th>tick (JST)</th>
              <th>登録者</th>
              <th>再生</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="t in ticks"
              :key="t.fetchedAt"
              :aria-selected="t.fetchedAt === selectedFetchedAt"
              tabindex="0"
              @click="selectTick(t.fetchedAt)"
              @keydown.enter="selectTick(t.fetchedAt)"
              @keydown.space.prevent="selectTick(t.fetchedAt)"
            >
              <td>
                <span v-if="t.excluded" class="chip alarm">集計から除く</span>
                <span v-else class="chip published">使う</span>
              </td>
              <td class="num">{{ jstClock(t.fetchedAt) }}</td>
              <td class="num">{{ t.subscriberCount ?? '—' }}</td>
              <td class="num">{{ t.viewCount }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-if="selectedTick" class="inspector">
      <div class="inspector-head">
        <div>
          <h3>{{ jstClock(selectedTick.fetchedAt) }}</h3>
          <div class="sub">{{ ticks.length }} tick 中の1件</div>
        </div>
      </div>

      <div class="inspector-body">
        <div class="panel">
          <h4>取得値</h4>
          <div class="kv">
            <dt>登録者</dt>
            <dd class="num">{{ selectedTick.subscriberCount ?? '—' }}</dd>
            <dt>再生</dt>
            <dd class="num">{{ selectedTick.viewCount }}</dd>
            <dt>動画</dt>
            <dd class="num">{{ selectedTick.videoCount }}</dd>
          </div>
        </div>

        <div style="display: flex; align-items: center; gap: 9px">
          <button
            class="toggle"
            type="button"
            :aria-pressed="selectedTick.excluded"
            aria-label="集計から除く"
            :disabled="saving"
            @click="toggleExcluded"
          ></button>
          <span class="sub">集計から除く</span>
        </div>

        <div class="field">
          <label for="f-reason">除く理由（公開されません）</label>
          <textarea id="f-reason" v-model="reasonDraft"></textarea>
        </div>
      </div>

      <div class="inspector-foot">
        <button class="btn back quiet" type="button" @click="detail = false">← 一覧</button>
      </div>
    </div>
  </div>
</template>
