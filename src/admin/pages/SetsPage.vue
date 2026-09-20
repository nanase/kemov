<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';

import MarkDown from '../../components/genet/MarkDown.vue';
import { AdminApiError, getJson, postJson, putJson } from '../lib/api';
import { insertAt, mdSnippet, clock, type MdLinkKind } from '../lib/genet-markdown';
import { type GenetPerson } from '../lib/genet-people';
import {
  attrNameOptions,
  emptyFormFields as emptyTuneFields,
  fieldForSaveError as fieldForTuneSaveError,
  learnName,
  toFormFields as toTuneFormFields,
  type Attribute,
  type GenetTune,
  type TuneFormFields,
} from '../lib/genet-tunes';
import {
  emptyFormFields as emptyStreamFields,
  fieldForSaveError as fieldForStreamSaveError,
  PLATFORMS,
  SCENE_STYLE_LABEL,
  SCENE_STYLES,
  toFormFields as toStreamFormFields,
  VIDEO_TYPES,
  withoutItem,
  type GenetStream,
  type StreamFormFields,
} from '../lib/genet-streams';
import { showToast } from '../lib/toast';

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
 */

const STATUS_OPTIONS = [
  { value: 'all', label: 'すべて' },
  { value: 'draft', label: '下書き' },
  { value: 'review', label: '確認中' },
  { value: 'published', label: '公開' },
] as const;

function statusLabel(status: string): string {
  return STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status;
}

const streams = ref<GenetStream[]>([]);
const people = ref<GenetPerson[]>([]);
const loading = ref(false);
const loadError = ref<string | null>(null);
const peopleLoadError = ref<string | null>(null);

const statusFilter = ref<(typeof STATUS_OPTIONS)[number]['value']>('all');
const selectedVideoId = ref<string | null>(null);
const detail = ref(false);

const filteredStreams = computed(() =>
  statusFilter.value === 'all' ? streams.value : streams.value.filter((s) => s.status === statusFilter.value),
);
const selected = computed(() => streams.value.find((s) => s.videoId === selectedVideoId.value) ?? null);

const streamFields = ref<StreamFormFields>(emptyStreamFields());
const streamSaving = ref(false);
const streamError = ref<string | null>(null);
const streamErrorField = ref<ReturnType<typeof fieldForStreamSaveError>>(null);

watch(selected, (stream) => {
  streamFields.value = stream === null ? emptyStreamFields() : toStreamFormFields(stream);
  streamError.value = null;
  streamErrorField.value = null;
  openIndex.value = null;
  // Keyed by performance index, which means nothing once the stream changes
  // - the new stream's own performances start at the same indices, and a
  // stale entry here would let openTune skip fetching and saveTune send the
  // previous stream's tune fields to a different tune's ID.
  tuneFieldsByIndex.value = new Map();
});

async function load(): Promise<void> {
  loading.value = true;
  loadError.value = null;

  try {
    const query = statusFilter.value === 'all' ? '' : `?status=${statusFilter.value}`;
    const body = await getJson<{ streams: GenetStream[] }>(`/genet/streams${query}`);

    streams.value = body.streams;

    if (selectedVideoId.value === null && streams.value.length > 0) {
      selectedVideoId.value = streams.value[0]!.videoId;
    }
  } catch (error) {
    loadError.value = error instanceof AdminApiError ? error.message : String(error);
  } finally {
    loading.value = false;
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

function selectStream(videoId: string): void {
  selectedVideoId.value = videoId;
  detail.value = true;
}

async function saveStream(): Promise<void> {
  if (selected.value === null) return;

  streamSaving.value = true;
  streamError.value = null;
  streamErrorField.value = null;

  try {
    await putJson(`/genet/streams/${encodeURIComponent(selected.value.videoId)}`, streamFields.value);
    showToast('配信を保存しました');
    await load();
  } catch (error) {
    if (error instanceof AdminApiError) {
      streamError.value = error.message;
      streamErrorField.value = fieldForStreamSaveError(error.message);
    } else {
      streamError.value = String(error);
    }
  } finally {
    streamSaving.value = false;
  }
}

async function publishStream(): Promise<void> {
  if (selected.value === null) return;

  try {
    await postJson(`/genet/streams/${encodeURIComponent(selected.value.videoId)}/publish`, {});
    showToast('公開にしました');
    await load();
  } catch (error) {
    if (error instanceof AdminApiError && Array.isArray((error.body as { errors?: unknown })?.errors)) {
      showToast((error.body as { errors: string[] }).errors.join(' / '));
    } else {
      showToast(error instanceof AdminApiError ? error.message : String(error));
    }
  }
}

async function withdrawStream(): Promise<void> {
  if (selected.value === null) return;

  try {
    await postJson(`/genet/streams/${encodeURIComponent(selected.value.videoId)}/withdraw`, {});
    showToast('下書きに戻しました');
    await load();
  } catch (error) {
    showToast(error instanceof AdminApiError ? error.message : String(error));
  }
}

function addChip(list: string[], label: string): void {
  const value = window.prompt(`${label}を書いてください`);

  if (value === null || value.trim() === '') return;

  list.push(value.trim());
}

/* ---- 曲（tune）: 配信の performances[] とは別の資源 --------------------- */

const openIndex = ref<number | null>(null);
const tuneFieldsByIndex = ref<Map<number, TuneFormFields>>(new Map());
const tuneSaving = ref(false);
const tuneError = ref<string | null>(null);
const tuneErrorField = ref<ReturnType<typeof fieldForTuneSaveError>>(null);
const tuneQuery = ref('');
const tuneSearchResults = ref<{ tuneId: number; title: string }[]>([]);
const tuneSearchError = ref<string | null>(null);

async function openTune(index: number): Promise<void> {
  if (openIndex.value === index) {
    openIndex.value = null;

    return;
  }

  openIndex.value = index;
  tuneError.value = null;
  tuneErrorField.value = null;

  const performance = streamFields.value.performances[index];

  if (performance === undefined || tuneFieldsByIndex.value.has(index)) return;

  try {
    const body = await getJson<{ tune: GenetTune }>(`/genet/tunes/${performance.tuneId}`);

    tuneFieldsByIndex.value.set(index, toTuneFormFields(body.tune));
  } catch (error) {
    tuneError.value = error instanceof AdminApiError ? error.message : String(error);
  }
}

function tuneTitleFor(index: number): string {
  return tuneFieldsByIndex.value.get(index)?.title ?? `曲 #${streamFields.value.performances[index]?.tuneId ?? ''}`;
}

async function saveTune(index: number): Promise<void> {
  const performance = streamFields.value.performances[index];
  const fields = tuneFieldsByIndex.value.get(index);

  if (performance === undefined || fields === undefined) return;

  tuneSaving.value = true;
  tuneError.value = null;
  tuneErrorField.value = null;

  try {
    await putJson(`/genet/tunes/${performance.tuneId}`, fields);
    showToast('曲を保存しました');
    await load();

    const refreshed = await getJson<{ tune: GenetTune }>(`/genet/tunes/${performance.tuneId}`);

    tuneFieldsByIndex.value.set(index, toTuneFormFields(refreshed.tune));
  } catch (error) {
    if (error instanceof AdminApiError) {
      tuneError.value = error.message;
      tuneErrorField.value = fieldForTuneSaveError(error.message);
    } else {
      tuneError.value = String(error);
    }
  } finally {
    tuneSaving.value = false;
  }
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

    tuneFieldsByIndex.value.set(streamFields.value.performances.length, toTuneFormFields(body.tune));
    addPerformance(body.tune.tuneId);
  } catch (error) {
    showToast(error instanceof AdminApiError ? error.message : String(error));
  }
}

function emptyTuneFieldsWithTitle(title: string): TuneFormFields {
  return { ...emptyTuneFields(), title };
}

function removePerformance(index: number): void {
  streamFields.value.performances.splice(index, 1);

  // Every cached entry after the removed one now belongs to the performance
  // that shifted into its old index - reindexing the whole map, rather than
  // only dropping the removed index, is what keeps openTune/saveTune reading
  // and writing the tune an index actually names after the splice.
  const reindexed = new Map<number, TuneFormFields>();

  for (const [i, fields] of tuneFieldsByIndex.value) {
    if (i < index) reindexed.set(i, fields);
    else if (i > index) reindexed.set(i - 1, fields);
  }

  tuneFieldsByIndex.value = reindexed;

  if (openIndex.value === index) openIndex.value = null;
  else if (openIndex.value !== null && openIndex.value > index) openIndex.value -= 1;
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

  showToast('人がいません。先に「＋ 新しい人を登録」で登録してください');

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
    const name = window.prompt('項目の名前を書いてください');

    if (name === null || name.trim() === '') return;

    attr.name = name.trim();
    learnName(name.trim());

    return;
  }

  attr.name = value === '（名前なし）' ? null : value;
}

async function addNewPerson(): Promise<void> {
  const name = window.prompt('新しく登録する人の名前を書いてください');

  if (name === null || name.trim() === '') return;

  try {
    const body = await postJson<{ person: GenetPerson }>('/genet/people', {
      name: name.trim(),
      link: null,
      memo: null,
    });

    people.value.push(body.person);
    showToast('人を登録しました');
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

  performance.scenes.push({ style: 'play', videoId: selected.value?.videoId ?? '', startSeconds: null });
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
      ? `${selected.value?.videoId ?? ''}?t=${picker.value.seconds}`
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

watch(statusFilter, load);
</script>

<template>
  <div class="main sets" :class="{ detail }">
    <div class="setlist">
      <div class="toolbar">
        <h2>配信</h2>
        <span class="grow"></span>
        <span class="sub num">{{ filteredStreams.length }} / {{ streams.length }}</span>
      </div>
      <div style="padding: 8px 12px; border-bottom: 1px solid var(--k-line)">
        <div class="seg" role="group" aria-label="状態で絞る">
          <button
            v-for="opt in STATUS_OPTIONS"
            :key="opt.value"
            type="button"
            :aria-pressed="statusFilter === opt.value"
            @click="statusFilter = opt.value"
          >
            {{ opt.label }}
          </button>
        </div>
      </div>
      <div style="overflow: auto; min-height: 0">
        <div v-if="loadError" class="empty">
          <b>読み込めません</b>
          <div class="sub">{{ loadError }}</div>
        </div>
        <button
          v-for="s in filteredStreams"
          :key="s.videoId"
          class="setlist-item"
          type="button"
          :aria-current="s.videoId === selectedVideoId"
          @click="selectStream(s.videoId)"
        >
          <span class="t">{{ s.shortTitle || s.title }}</span>
          <span class="meta">
            <span class="num sub">{{ s.publishedAt.slice(0, 10) }}</span>
            <span class="sub">{{ s.performances.length }} 曲</span>
            <span class="chip" :class="{ published: s.status === 'published', review: s.status === 'review' }">{{
              statusLabel(s.status)
            }}</span>
          </span>
        </button>
      </div>
    </div>

    <div v-if="selected" class="editor">
      <div class="toolbar">
        <button class="btn quiet back" type="button" @click="detail = false">← 一覧</button>
        <h2 style="min-width: 0; overflow: hidden; text-overflow: ellipsis">
          {{ selected.shortTitle || selected.title }}
        </h2>
        <span
          class="chip"
          :class="{ published: selected.status === 'published', review: selected.status === 'review' }"
          >{{ statusLabel(selected.status) }}</span
        >
        <span class="grow"></span>
        <button class="btn primary" type="button" :disabled="streamSaving" @click="saveStream">保存</button>
        <button v-if="selected.status !== 'published'" class="btn" type="button" @click="publishStream">
          公開する
        </button>
        <button v-else class="btn" type="button" @click="withdrawStream">下書きに戻す</button>
      </div>

      <div class="scroller">
        <div v-if="streamError" style="padding: 12px 18px 0">
          <div class="panel flag">
            <h4>保存できません</h4>
            <div class="hint">{{ streamError }}</div>
          </div>
        </div>

        <div class="editor-section">
          <h3>配信</h3>
          <div class="field">
            <label for="f-title">タイトル</label>
            <input
              id="f-title"
              v-model="streamFields.title"
              type="text"
              :aria-invalid="streamErrorField?.section === 'title'"
            />
          </div>
          <div class="field">
            <label for="f-short">短いタイトル</label>
            <input
              id="f-short"
              type="text"
              :value="streamFields.shortTitle ?? ''"
              placeholder="省くと上のタイトルを使います"
              :aria-invalid="streamErrorField?.section === 'shortTitle'"
              @input="streamFields.shortTitle = ($event.target as HTMLInputElement).value || null"
            />
          </div>
          <div class="md">
            <div class="md-bar"><span class="lab">カテゴリ</span></div>
            <div class="chipset">
              <span v-for="(c, i) in streamFields.categories" :key="c" class="chip-x"
                >{{ c
                }}<button
                  type="button"
                  :aria-label="`${c} を外す`"
                  @click="streamFields.categories = withoutItem(streamFields.categories, i)"
                >
                  &times;
                </button></span
              >
              <button class="md-ins" type="button" @click="addChip(streamFields.categories, 'カテゴリ')">＋</button>
            </div>
          </div>
          <div class="md">
            <div class="md-bar"><span class="lab">キーワード</span></div>
            <div class="chipset">
              <span v-for="(k, i) in streamFields.keywords" :key="k" class="chip-x"
                >{{ k
                }}<button
                  type="button"
                  :aria-label="`${k} を外す`"
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
              <select
                id="f-vtype"
                v-model="streamFields.videoType"
                :aria-invalid="streamErrorField?.section === 'videoType'"
              >
                <option v-for="t in VIDEO_TYPES" :key="t" :value="t">{{ t }}</option>
              </select>
            </div>
            <div class="field">
              <label for="f-platform">プラットフォーム</label>
              <select
                id="f-platform"
                v-model="streamFields.platform"
                :aria-invalid="streamErrorField?.section === 'platform'"
              >
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
                :aria-invalid="streamErrorField?.section === 'publishedAt'"
              />
            </div>
            <div v-if="streamFields.platform !== 'youtube'" class="field">
              <label for="f-url">URL</label>
              <input
                id="f-url"
                type="text"
                :value="streamFields.url ?? ''"
                :aria-invalid="streamErrorField?.section === 'url'"
                @input="streamFields.url = ($event.target as HTMLInputElement).value || null"
              />
            </div>
          </div>
          <div class="field">
            <label for="f-memo">メモ（公開されません）</label>
            <textarea
              id="f-memo"
              :value="streamFields.memo ?? ''"
              @input="streamFields.memo = ($event.target as HTMLTextAreaElement).value || null"
            ></textarea>
          </div>
        </div>

        <div class="editor-section">
          <h3>曲 {{ streamFields.performances.length }} 件</h3>

          <div v-for="(perf, pi) in streamFields.performances" :key="pi" class="tune">
            <button class="tune-head" type="button" :aria-expanded="openIndex === pi" @click="openTune(pi)">
              <span class="no">{{ pi + 1 }}</span>
              <span class="t">{{ tuneTitleFor(pi) }}</span>
              <span v-if="!perf.description" class="chip alarm">時刻なし</span>
              <span class="sub" aria-hidden="true">{{ openIndex === pi ? '▲' : '▼' }}</span>
            </button>

            <div v-if="openIndex === pi" class="tune-body">
              <div v-if="tuneError" class="panel flag">
                <h4>曲を保存できません</h4>
                <div class="hint">{{ tuneError }}</div>
              </div>

              <div class="md">
                <div class="md-bar">
                  <span class="lab">演奏のしかたと時刻</span>
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
                  <MarkDown v-else :source="perf.description" />
                </div>
              </div>

              <div class="md">
                <div class="md-bar">
                  <span class="lab">場面</span
                  ><button class="md-ins" type="button" @click="addScene(pi)">＋ 足す</button>
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
                    <button class="row-del" type="button" aria-label="場面を消す" @click="perf.scenes.splice(si, 1)">
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
                    :aria-invalid="tuneErrorField?.section === 'title'"
                  />
                  <div class="md-prev">
                    <span v-if="!tuneFieldsByIndex.get(pi)!.title" class="sub">（空）</span>
                    <MarkDown v-else :source="tuneFieldsByIndex.get(pi)!.title" />
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
                    @input="
                      tuneFieldsByIndex.get(pi)!.originalTitle = ($event.target as HTMLInputElement).value || null
                    "
                  />
                  <div class="md-prev">
                    <span v-if="!tuneFieldsByIndex.get(pi)!.originalTitle" class="sub">（空）</span>
                    <MarkDown v-else :source="tuneFieldsByIndex.get(pi)!.originalTitle ?? ''" />
                  </div>
                </div>

                <div class="md">
                  <div class="md-bar">
                    <span class="lab">小曲</span
                    ><button class="md-ins" type="button" @click="addSubtune(tuneFieldsByIndex.get(pi)!)">
                      ＋ 足す
                    </button>
                  </div>
                  <div class="rows">
                    <span v-if="tuneFieldsByIndex.get(pi)!.subtunes.length === 0" class="sub">なし</span>
                    <div v-for="(_, si) in tuneFieldsByIndex.get(pi)!.subtunes" :key="si" class="row-item">
                      <input type="text" v-model="tuneFieldsByIndex.get(pi)!.subtunes[si]" aria-label="小曲" />
                      <button
                        class="row-del"
                        type="button"
                        aria-label="小曲を消す"
                        @click="tuneFieldsByIndex.get(pi)!.subtunes.splice(si, 1)"
                      >
                        &times;
                      </button>
                    </div>
                  </div>
                </div>

                <div class="md">
                  <div class="md-bar">
                    <span class="lab">作曲・作詞など</span
                    ><button class="md-ins" type="button" @click="addAttribute(tuneFieldsByIndex.get(pi)!)">
                      ＋ 足す
                    </button>
                  </div>
                  <div class="rows">
                    <span v-if="tuneFieldsByIndex.get(pi)!.attributes.length === 0" class="sub">なし</span>
                    <div
                      v-for="(attr, ai) in tuneFieldsByIndex.get(pi)!.attributes"
                      :key="ai"
                      style="display: grid; gap: 6px; padding: 6px 0; border-bottom: 1px solid var(--k-line)"
                    >
                      <div class="row-item">
                        <select
                          :value="attr.name ?? '（名前なし）'"
                          aria-label="項目の名前"
                          @change="onAttributeNameChange(attr, ($event.target as HTMLSelectElement).value)"
                        >
                          <option>（名前なし）</option>
                          <option v-for="n in attrNameOptions(attr.name)" :key="n">{{ n }}</option>
                          <option>その他…</option>
                        </select>
                        <button
                          class="row-del"
                          type="button"
                          aria-label="項目を消す"
                          @click="tuneFieldsByIndex.get(pi)!.attributes.splice(ai, 1)"
                        >
                          &times;
                        </button>
                      </div>
                      <div style="display: flex; align-items: center; gap: 9px">
                        <button
                          class="toggle"
                          type="button"
                          :aria-pressed="attributeMode(attr) === 'people'"
                          aria-label="人物を選んで書く"
                          @click="toggleAttributeMode(attr)"
                        ></button>
                        <span class="sub">{{
                          attributeMode(attr) === 'people' ? '人物を選んで書く' : '文章で書く'
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
                          <h4>人の一覧を取得できません</h4>
                          <div class="hint">{{ peopleLoadError }}</div>
                          <button class="btn" type="button" @click="loadPeople">読み直す</button>
                        </div>
                        <div v-for="(person, pj) in attr.people" :key="pj" class="row-item two">
                          <select v-model="person.personId" aria-label="人">
                            <option v-for="p in people" :key="p.personId" :value="p.personId">{{ p.name }}</option>
                          </select>
                          <input
                            type="text"
                            :value="person.creditedAs ?? ''"
                            placeholder="表示名（省くと人の名前）"
                            aria-label="表示名"
                            @input="person.creditedAs = ($event.target as HTMLInputElement).value || null"
                          />
                          <button
                            class="row-del"
                            type="button"
                            aria-label="人を消す"
                            @click="attr.people.splice(pj, 1)"
                          >
                            &times;
                          </button>
                        </div>
                        <div style="display: flex; gap: 6px">
                          <button class="md-ins" type="button" @click="addAttributePerson(attr)">＋ 人を足す</button>
                          <button class="md-ins" type="button" @click="addNewPerson">＋ 新しい人物を登録</button>
                        </div>
                      </template>
                    </div>
                  </div>
                </div>

                <div class="md">
                  <div class="md-bar">
                    <span class="lab">参考の動画</span
                    ><button class="md-ins" type="button" @click="addVideo(tuneFieldsByIndex.get(pi)!)">＋ 足す</button>
                  </div>
                  <div class="rows">
                    <span v-if="tuneFieldsByIndex.get(pi)!.videos.length === 0" class="sub">なし</span>
                    <div v-for="(v, vi) in tuneFieldsByIndex.get(pi)!.videos" :key="vi" class="row-item two">
                      <input type="text" v-model="v.videoId" aria-label="動画 ID" />
                      <input type="text" v-model="v.title" aria-label="動画のタイトル" />
                      <button
                        class="row-del"
                        type="button"
                        aria-label="動画を消す"
                        @click="tuneFieldsByIndex.get(pi)!.videos.splice(vi, 1)"
                      >
                        &times;
                      </button>
                    </div>
                  </div>
                </div>

                <div class="md">
                  <div class="md-bar">
                    <span class="lab">外部の資料</span
                    ><button class="md-ins" type="button" @click="addScore(tuneFieldsByIndex.get(pi)!)">＋ 足す</button>
                  </div>
                  <div class="rows">
                    <span v-if="tuneFieldsByIndex.get(pi)!.scores.length === 0" class="sub">なし</span>
                    <div v-for="(sc, si) in tuneFieldsByIndex.get(pi)!.scores" :key="si" class="row-item two">
                      <input type="text" v-model="sc.url" placeholder="https://imslp.org/..." aria-label="リンク" />
                      <input type="text" v-model="sc.title" aria-label="題" />
                      <button
                        class="row-del"
                        type="button"
                        aria-label="資料を消す"
                        @click="tuneFieldsByIndex.get(pi)!.scores.splice(si, 1)"
                      >
                        &times;
                      </button>
                    </div>
                  </div>
                </div>

                <div style="display: flex; gap: 8px">
                  <button class="btn primary" type="button" :disabled="tuneSaving" @click="saveTune(pi)">
                    この曲を保存
                  </button>
                  <span class="grow"></span>
                  <button class="btn danger" type="button" @click="removePerformance(pi)">
                    この配信からこの曲を外す
                  </button>
                </div>
              </template>
            </div>
          </div>

          <div class="field">
            <label for="f-tune-q">曲を探す、または曲名を書いて新しく作る</label>
            <input id="f-tune-q" v-model="tuneQuery" type="text" placeholder="曲名で絞り込み" />
          </div>
          <div v-if="tuneSearchError" class="panel flag">
            <h4>曲を探せません</h4>
            <div class="hint">{{ tuneSearchError }}</div>
            <button class="btn" type="button" @click="searchTunes">読み直す</button>
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
            <button class="btn" type="button" @click="addNewTune">「{{ tuneQuery }}」という曲名で新しく作る</button>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div v-if="picker" class="picker" @click.self="closePicker">
    <div class="picker-box">
      <div class="picker-head">{{ pickerTitle(picker.kind) }}</div>
      <div class="picker-body">
        <template v-if="picker.kind === 'yt'">
          <div class="field">
            <label for="p-play">演奏のしかた</label>
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
            <label for="p-label">画面に出す文字</label>
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
              picker.kind === 'yt' ? `${selected?.videoId ?? ''}?t=${picker.seconds}` : picker.articleOrUrl || '…',
            )
          }}」になります
        </div>
      </div>
      <div class="picker-foot">
        <button class="btn primary" type="button" @click="confirmPicker">挿入</button>
        <button class="btn quiet" type="button" @click="closePicker">やめる</button>
      </div>
    </div>
  </div>
</template>
