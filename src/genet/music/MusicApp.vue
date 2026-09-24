<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { unescapeHtml } from '@nanase/alnilam/string';

import ThumbnailFallback from '@/parts/ThumbnailFallback.vue';
import SiteShell from '@/shell/SiteShell.vue';
import UpdatedAt, { type UpdatedAtState } from '@/shell/UpdatedAt.vue';
import { relayVideoThumbnailURL } from '@/lib/relay';
import { channelIconURL } from '@/lib/genet/musicChannelIcon';
import { getEmbedURL } from '@/lib/youtube';
import { expandLink, lexMarkdown, parseYoutubeHref, plainText } from '@/lib/genet/musicMarkdown';
import {
  countText,
  publishedDateText,
  publishedDateTimeText,
  summaryCountText,
  videoTimeText,
} from '@/lib/genet/musicFormat';
import { readGenetMusicData } from '@/lib/genet/musicRead';
import {
  computeResults,
  highlightRanges,
  isFiltering,
  parseQuery,
  prepareStreams,
  snippet,
  yearOf,
  type Filters,
  type PreparedPerformance,
  type PreparedStream,
} from '@/lib/genet/musicSearch';
import type { GenetMusicData, GenetScene, GenetStream } from '@/lib/genet/musicTypes';
import { useSheetDialog } from './useSheetDialog';

/**
 * ジェネット楽曲一覧 (#139, #144's task 15). The confirmed mock
 * (https://claude.ai/code/artifact/f1a5458f-2b6c-4aaa-a38d-e794e70d82cc) is
 * authoritative for look and copy; the shared shell (`src/shell/`) is
 * authoritative for assembly (nav, title, freshness, notes, fonts) - this
 * page only adds its own board below the title and its own colours
 * (`src/shell/palette-genet.css`, opted into by `data-palette="genet"` in
 * this page's own `index.html`).
 */

const FORMS = [
  { id: 'play', name: 'ヴァイオリン演奏', short: '演奏' },
  { id: 'sing', name: '歌唱', short: '歌唱' },
  { id: 'bgm', name: 'BGM', short: 'BGM' },
  { id: 'talk', name: '解説・紹介', short: '解説' },
] as const;

type FormId = (typeof FORMS)[number]['id'];

const SVG_OPEN =
  '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">';

/** The mock's own per-form icons (#139's 演奏のしかた segments) - each button's own visual, not text. */
const FORM_ICON: Record<FormId, string> = {
  play:
    `${SVG_OPEN}<g transform="translate(-1.6 -1) rotate(35 8 8) scale(.86) translate(1.3 1.3)">` +
    '<path d="M8 6C6.2 6 5.5 6.8 5.6 7.8 5.7 8.7 6.5 9 6.4 9.7 6.3 10.2 5 10.7 5 12.4 5 14.2 6.4 15.3 8 15.3S11 14.2 11 12.4C11 10.7 9.7 10.2 9.6 9.7 9.5 9 10.3 8.7 10.4 7.8 10.5 6.8 9.8 6 8 6Z"/>' +
    '<path d="M8 6V2.4"/><circle cx="8" cy="1.7" r=".75"/><path d="M6.9 10.7v1.3M9.1 10.7v1.3" stroke-width="1"/></g>' +
    '<path d="M8.33 14.57 14.13 6.27M8.33 14.57 7.53 13.97" stroke-width="1.1"/></svg>',
  sing: `${SVG_OPEN}<rect x="5.7" y="1.6" width="4.6" height="7.6" rx="2.3"/><path d="M3.5 7.4a4.5 4.5 0 0 0 9 0M8 11.9v2.5M5.7 14.4h4.6"/></svg>`,
  bgm: `${SVG_OPEN}<path d="M2.3 6.1h2.5L8 3.4v9.2L4.8 9.9H2.3z"/><path d="M10.5 5.7a3.3 3.3 0 0 1 0 4.6M12.4 3.9a5.9 5.9 0 0 1 0 8.2"/></svg>`,
  talk: `${SVG_OPEN}<path d="M3 2.9h10a1.2 1.2 0 0 1 1.2 1.2v5.8a1.2 1.2 0 0 1-1.2 1.2H7.4l-2.8 2.3v-2.3H3a1.2 1.2 0 0 1-1.2-1.2V4.1A1.2 1.2 0 0 1 3 2.9z"/><path d="M4.8 5.9h6.4M4.8 8.2h4"/></svg>`,
};

const loadState = ref<UpdatedAtState>('loading');
const updatedAt = ref<number | null>(null);
const data = ref<GenetMusicData | null>(null);

// The title icon is the channel's own picture when the JSON names a channel and
// the relay has it; otherwise, and when the picture fails to load, it stays the
// plain coloured circle the icon's box already draws.
const iconSrc = computed(() => channelIconURL(data.value));
const iconFailed = ref(false);
const preparedStreams = ref<PreparedStream[]>([]);

const query = ref('');
const form = ref<FormId | null>(null);
const year = ref<number | null>(null);
const category = ref<string | null>(null);
const ascending = ref(false);

const filters = computed<Filters>(() => ({
  terms: parseQuery(query.value),
  form: form.value,
  year: year.value,
  category: category.value,
}));
const filtering = computed(() => isFiltering(filters.value));

const orderedStreams = computed(() => (ascending.value ? [...preparedStreams.value].reverse() : preparedStreams.value));
const result = computed(() => computeResults(orderedStreams.value, filters.value));

const years = computed(() => {
  const set = new Set(preparedStreams.value.map((s) => yearOf(s.stream.published_at)));
  return [...set].sort((a, b) => b - a);
});
const categories = computed(() => {
  const count = new Map<string, number>();
  for (const s of preparedStreams.value) for (const c of s.stream.categories) count.set(c, (count.get(c) ?? 0) + 1);
  return [...count.keys()].sort((a, b) => (count.get(b) ?? 0) - (count.get(a) ?? 0));
});

const selectedVideoId = ref<string | null>(null);
const selectedTuneId = ref<number | null>(null);
const pair = ref<'list' | 'song'>('list');
const sheet = ref<'' | 'prog' | 'song'>('');

const selectedStream = computed(
  () => result.value.streams.find((s) => s.stream.video_id === selectedVideoId.value) ?? null,
);
const selectedPerformance = computed<PreparedPerformance | null>(() => {
  if (!selectedStream.value) return null;
  return (
    selectedStream.value.performances.find((p) => p.tune.tune_id === selectedTuneId.value) ??
    selectedStream.value.performances[0] ??
    null
  );
});

/** `2 / 9` - the selected tune's own position among its stream's performances (#139's 数値の書き方). */
const songCountText = computed(() => {
  if (!selectedStream.value || !selectedPerformance.value) return '';
  const no =
    selectedStream.value.performances.findIndex((p) => p.tune.tune_id === selectedPerformance.value!.tune.tune_id) + 1;

  return `${no} / ${selectedStream.value.performances.length}`;
});

/** Keeps the current selection inside the filtered result, jumping to the first match otherwise - the mock's own `ensureSelection`. */
function ensureSelection(): void {
  const streams = result.value.streams;
  let stream = streams.find((s) => s.stream.video_id === selectedVideoId.value);

  if (!stream) {
    stream = streams[0];
    selectedVideoId.value = stream?.stream.video_id ?? null;
    selectedTuneId.value = null;
  }

  if (!stream) return;

  const matched = result.value.matchedTuneIdsByStream.get(stream.stream.video_id);
  const stillMatches = selectedTuneId.value !== null && (matched?.has(selectedTuneId.value) ?? false);

  if (!stillMatches) {
    const first = stream.performances.find((p) => matched?.has(p.tune.tune_id) ?? true);
    selectedTuneId.value = first?.tune.tune_id ?? null;
  }
}

watch([filters, ascending], ensureSelection);

interface PlayState {
  videoId: string;
  seconds: number;
}

const play = ref<PlayState | null>(null);
const zoom = ref<{ videoId: string; title: string; dateText: string } | null>(null);

async function load(): Promise<void> {
  loadState.value = 'loading';

  try {
    const response = await fetch('/api/genet/music');

    if (!response.ok) throw new Error(`${response.status}`);

    const body = readGenetMusicData(await response.json());

    data.value = body;
    preparedStreams.value = prepareStreams(body);
    updatedAt.value = Date.parse(body.published_at);
    loadState.value = 'ok';
    await nextTick();
    ensureSelection();
  } catch {
    loadState.value = 'error';
  }
}

onMounted(load);

/* ---- 選ぶ --------------------------------------------------------- */

function selectStream(videoId: string): void {
  play.value = null;
  selectedVideoId.value = videoId;
  selectedTuneId.value = null;
  ensureSelection();
  pair.value = 'song';
  sheet.value = 'prog';
}

function selectTune(tuneId: number): void {
  play.value = null;
  selectedTuneId.value = tuneId;
  pair.value = 'song';
  sheet.value = 'song';
}

function backToList(): void {
  pair.value = 'list';
  sheet.value = '';
}

function backToProgram(): void {
  sheet.value = 'prog';
}

/** One step back from the front sheet: the song to the program, the program to the list. */
function closeSheet(): void {
  if (sheet.value === 'song') backToProgram();
  else backToList();
}

const shell = ref<HTMLElement | null>(null);
const progPanel = ref<HTMLElement | null>(null);
const songPanel = ref<HTMLElement | null>(null);

const { modal } = useSheetDialog({
  sheet,
  root: shell,
  panels: { prog: progPanel, song: songPanel },
  close: closeSheet,
  suspended: () => zoom.value !== null,
});

/** What makes the front sheet a dialog, while the sheets stack over the list. */
function dialogAttrs(name: 'prog' | 'song'): Record<string, string> {
  if (modal.value !== name) return {};

  return { role: 'dialog', 'aria-modal': 'true', 'aria-label': name === 'prog' ? '曲目' : '楽曲' };
}

/* ---- おまかせ ------------------------------------------------------- */

function pickRandom(): void {
  const streams = result.value.streams;

  if (streams.length === 0) return;

  const stream = streams[Math.floor(Math.random() * streams.length)]!;
  const matched = result.value.matchedTuneIdsByStream.get(stream.stream.video_id);
  const candidates = stream.performances.filter((p) => (matched?.has(p.tune.tune_id) ?? true) && p.scenes.length > 0);
  const pool = candidates.length > 0 ? candidates : stream.performances;
  const chosen = pool[Math.floor(Math.random() * pool.length)] ?? stream.performances[0];

  play.value = null;
  selectedVideoId.value = stream.stream.video_id;
  selectedTuneId.value = chosen?.tune.tune_id ?? null;
  pair.value = 'song';
  sheet.value = 'song';
}

/** A scene with no time (BGM, a talk) has no place to jump to, so it gets no time button. */
function timedScenes(scenes: readonly GenetScene[]): (GenetScene & { start_seconds: number })[] {
  return scenes.filter((sc): sc is GenetScene & { start_seconds: number } => sc.start_seconds !== null);
}

/* ---- 前後の配信 ----------------------------------------------------- */

const streamIndex = computed(() => (selectedStream.value ? result.value.streams.indexOf(selectedStream.value) : -1));
const prevStream = computed(() => (streamIndex.value > 0 ? result.value.streams[streamIndex.value - 1] : null));
const nextStream = computed(() =>
  streamIndex.value >= 0 && streamIndex.value < result.value.streams.length - 1
    ? result.value.streams[streamIndex.value + 1]
    : null,
);

function goToStream(stream: PreparedStream | null): void {
  if (!stream) return;
  selectStream(stream.stream.video_id);
}

/** Opens a stream the 演奏した回 list names, dropping the conditions first when they would hide it - otherwise `ensureSelection` falls back to the first match of an unrelated stream. */
function goToOccurrence(videoId: string, tuneId: number): void {
  if (!result.value.streams.some((s) => s.stream.video_id === videoId)) {
    query.value = '';
    form.value = null;
    year.value = null;
    category.value = null;
  }

  selectStream(videoId);
  selectTune(tuneId);
}

/* ---- 曲を演奏した回 --------------------------------------------------- */

interface Occurrence {
  stream: GenetStream;
  scenes: GenetScene[];
  isCurrent: boolean;
}

const occurrences = computed<Occurrence[]>(() => {
  const tuneId = selectedPerformance.value?.tune.tune_id;
  if (tuneId === undefined || !data.value) return [];

  const seen = new Map<string, Occurrence>();
  const source = ascending.value ? [...data.value.streams].reverse() : data.value.streams;

  for (const stream of source) {
    for (const perf of stream.performances) {
      if (perf.tune_id !== tuneId) continue;
      const isCurrent = stream.video_id === selectedVideoId.value;
      const existing = seen.get(stream.video_id);
      if (!existing || isCurrent) seen.set(stream.video_id, { stream, scenes: perf.scenes, isCurrent });
    }
  }

  return [...seen.values()];
});

/* ---- カテゴリのチップ・演奏のしかたのボタン ------------------------------- */

function toggleCategory(c: string): void {
  category.value = category.value === c ? null : c;
}

function toggleForm(id: FormId): void {
  form.value = form.value === id ? null : id;
}

/* ---- Markdown -------------------------------------------------------- */

interface MdContext {
  videoId: string;
  tuneId: number;
}

function esc(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function renderMarkdown(source: string | null, ctx?: MdContext): string {
  if (!source) return '';

  const terms = filters.value.terms;
  const highlight = (text: string) => highlightRanges(text, terms, esc);

  return lexMarkdown(source)
    .map((token) => {
      if (token.type === 'br') return '<br>';
      if (token.type === 'text') return highlight(token.text);

      const url = expandLink(token.href);

      if (!url) return highlight(token.text);

      let html = `<a href="${esc(url)}" target="_blank" rel="noopener">${highlight(token.text)}</a>`;
      const yt = parseYoutubeHref(token.href);

      if (yt && ctx) {
        const on = play.value?.videoId === yt.videoId && play.value?.seconds === yt.seconds;
        html += ` <button type="button" class="tbtn" data-vid="${esc(yt.videoId)}" data-at="${yt.seconds}" aria-pressed="${on}" aria-label="${videoTimeText(yt.seconds)} から聴く" title="${videoTimeText(yt.seconds)} から聴く">${videoTimeText(yt.seconds)}</button>`;
      }

      return html;
    })
    .join('');
}

function onMarkdownClick(event: MouseEvent): void {
  const target = (event.target as HTMLElement).closest('button.tbtn') as HTMLButtonElement | null;

  if (!target) return;

  const videoId = target.dataset.vid;
  const at = Number(target.dataset.at ?? '0');

  if (!videoId) return;

  play.value = play.value?.videoId === videoId && play.value.seconds === at ? null : { videoId, seconds: at };
}

/* ---- サムネイル -------------------------------------------------------- */

function thumbSrc(videoId: string, size: 'mq' | 'hq' | 'max' = 'mq'): string {
  return relayVideoThumbnailURL(videoId, size);
}

/**
 * Videos whose thumbnail did not arrive even at `hq`. Their `<img>` is
 * replaced by `ThumbnailFallback` (#180): the step down to `hq` below is the
 * only retry, so a failure after it is final for this page.
 */
const failedThumbs = ref<ReadonlySet<string>>(new Set());

function onThumbError(event: Event): void {
  const img = event.target as HTMLImageElement;
  const videoId = img.dataset.videoId ?? '';

  if (img.dataset.fallback) {
    failedThumbs.value = new Set(failedThumbs.value).add(videoId);

    return;
  }

  img.dataset.fallback = '1';
  img.src = thumbSrc(videoId, 'hq');
}

function onZoomImgLoad(event: Event): void {
  const img = event.target as HTMLImageElement;

  if (!img.dataset.fallback && img.naturalWidth <= 120) {
    img.dataset.fallback = '1';
    img.src = thumbSrc(img.dataset.videoId ?? '', 'hq');
  }
}

const zoomCloseButton = ref<HTMLButtonElement | null>(null);
let zoomReturnFocus: HTMLElement | null = null;

function openZoom(videoId: string, title: string, dateText: string): void {
  zoomReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  zoom.value = { videoId, title, dateText };
  // The overlay is a sibling in document order, not a portal at the end of
  // <body> - without moving focus in, a keyboard user's next Tab still walks
  // the page behind it rather than this dialog.
  void nextTick(() => zoomCloseButton.value?.focus());
}

function closeZoom(): void {
  zoom.value = null;
  zoomReturnFocus?.focus();
  zoomReturnFocus = null;
}

// The dialog holds exactly one focusable control (the close button) - Tab
// leaving it would walk into the page behind the overlay, so every Tab
// simply keeps focus where it already belongs rather than tracking a real
// cycle among several controls.
function trapZoomFocus(event: KeyboardEvent): void {
  if (event.key !== 'Tab') return;

  event.preventDefault();
  zoomCloseButton.value?.focus();
}

/* ---- 文言のための小さな整形 -------------------------------------------- */

function unesc(text: string): string {
  return unescapeHtml(text);
}

function decodedPlain(source: string | null): string {
  return source ? plainText(source) : '';
}

function highlightPlain(text: string): string {
  return highlightRanges(text, filters.value.terms, esc);
}

function snippetText(text: string): string {
  return snippet(text, filters.value.terms);
}
</script>

<template>
  <SiteShell page="genet" title="ジェネット楽曲一覧">
    <template #title-icon>
      <!-- The title already says what this icon would, so it stays out of what a screen reader reads. -->
      <img
        v-if="iconSrc && !iconFailed"
        class="gm-icon"
        :src="iconSrc"
        alt=""
        width="30"
        height="30"
        aria-hidden="true"
        @error="iconFailed = true"
      />
      <span v-else class="gm-icon" aria-hidden="true"></span>
    </template>
    <template #title-aside>
      <UpdatedAt :at="updatedAt" :state="loadState" :pulse="false" date-only age="calendar" />
    </template>

    <section ref="shell" class="gm" :data-pair="pair" :data-sheet="sheet">
      <template v-if="loadState === 'error'">
        <div class="gm-err">
          <div class="x1">楽曲の情報を取得できませんでした</div>
          <div class="x2">しばらく時間をおいてから再度お試しください</div>
        </div>
      </template>

      <template v-else-if="loadState === 'loading'">
        <div class="gm-sk">
          <div class="sk-row" v-for="i in 6" :key="i">
            <span class="sk sk-thumb"></span><span class="sk sk-line"></span>
          </div>
        </div>
      </template>

      <template v-else>
        <div class="gm-ctl">
          <div class="find">
            <svg
              viewBox="0 0 16 16"
              aria-hidden="true"
              focusable="false"
              fill="none"
              stroke="currentColor"
              stroke-width="1.3"
            >
              <circle cx="7" cy="7" r="4.4" />
              <path d="M10.3 10.3 14 14" />
            </svg>
            <input
              v-model="query"
              type="search"
              placeholder="曲・作曲者・配信でさがす"
              aria-label="曲・作曲者・配信でさがす"
            />
            <button v-if="query" class="xq" type="button" @click="query = ''">消す</button>
          </div>
          <div class="segs" role="group" aria-label="演奏のしかた">
            <button class="seg" type="button" :aria-pressed="form === null" @click="form = null">すべて</button>
            <button
              v-for="f in FORMS"
              :key="f.id"
              class="seg"
              type="button"
              :aria-pressed="form === f.id"
              :title="f.name"
              @click="toggleForm(f.id)"
            >
              <span class="ic" v-html="FORM_ICON[f.id]"></span>
              {{ f.short }}
            </button>
          </div>
          <select
            class="pick"
            aria-label="年"
            :value="year ?? 'all'"
            @change="
              year =
                ($event.target as HTMLSelectElement).value === 'all'
                  ? null
                  : Number(($event.target as HTMLSelectElement).value)
            "
          >
            <option value="all">すべての年</option>
            <option v-for="y in years" :key="y" :value="y">{{ y }}年</option>
          </select>
          <select
            class="pick"
            aria-label="カテゴリ"
            :value="category ?? 'all'"
            @change="
              category =
                ($event.target as HTMLSelectElement).value === 'all' ? null : ($event.target as HTMLSelectElement).value
            "
          >
            <option value="all">すべてのカテゴリ</option>
            <option v-for="c in categories" :key="c">{{ c }}</option>
          </select>
        </div>

        <div class="board">
          <div
            class="side rail"
            tabindex="0"
            role="button"
            aria-label="配信の一覧を開く"
            @click="backToList"
            @keydown.enter="backToList"
          >
            <svg
              viewBox="0 0 16 16"
              aria-hidden="true"
              focusable="false"
              fill="none"
              stroke="currentColor"
              stroke-width="1.3"
            >
              <path d="M10 3.2 5.2 8l4.8 4.8" />
            </svg>
            <span class="rl">配信</span>
          </div>

          <div class="panel list">
            <div class="ph">
              <b>配信</b>
              <span
                class="counts"
                v-html="
                  summaryCountText(
                    preparedStreams.length,
                    data?.tunes.length ?? 0,
                    filtering,
                    result.streams.length,
                    result.songIds.size,
                  )
                "
              ></span>
              <span class="grow"></span>
              <button class="ibtn" type="button" aria-label="おまかせ" title="おまかせ" @click="pickRandom">
                <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                  <rect x="2.2" y="2.2" width="11.6" height="11.6" rx="2.6" />
                  <circle cx="5.4" cy="5.4" r="1.15" fill="currentColor" stroke="none" />
                  <circle cx="8" cy="8" r="1.15" fill="currentColor" stroke="none" />
                  <circle cx="10.6" cy="10.6" r="1.15" fill="currentColor" stroke="none" />
                </svg>
              </button>
              <button
                class="ibtn"
                type="button"
                :aria-pressed="ascending"
                @click="ascending = !ascending"
                :aria-label="ascending ? '古い順' : '新しい順'"
                :title="ascending ? '古い順' : '新しい順'"
              >
                <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                  <path
                    d="M3.6 2.6 v10.2 M1.6 10.8 l2 2 2-2"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.4"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                  <path
                    :d="ascending ? 'M7.4 4 h3 M7.4 8 h6 M7.4 12 h9' : 'M7.4 4 h9 M7.4 8 h6 M7.4 12 h3'"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.4"
                    stroke-linecap="round"
                  />
                </svg>
              </button>
            </div>
            <div class="pb" @click="onMarkdownClick">
              <template v-if="result.streams.length === 0">
                <div class="rest">
                  <svg viewBox="0 0 110 40" aria-hidden="true" focusable="false">
                    <g stroke="currentColor" stroke-width="1" opacity=".55">
                      <path d="M2 4.5h106M2 12.5h106M2 20.5h106M2 28.5h106M2 36.5h106" />
                    </g>
                    <rect x="47" y="12.5" width="16" height="6" fill="currentColor" />
                  </svg>
                  <span>条件に当てはまる配信がみつかりません</span>
                </div>
              </template>
              <template v-for="(s, i) in result.streams" :key="s.stream.video_id">
                <div
                  class="yh"
                  v-if="i === 0 || yearOf(s.stream.published_at) !== yearOf(result.streams[i - 1]!.stream.published_at)"
                >
                  <b>{{ yearOf(s.stream.published_at) }}年</b>
                  <span>{{
                    countText(
                      result.streams.filter((x) => yearOf(x.stream.published_at) === yearOf(s.stream.published_at))
                        .length,
                      '本',
                    )
                  }}</span>
                </div>
                <button
                  class="srow"
                  type="button"
                  :aria-current="s.stream.video_id === selectedVideoId"
                  @click="selectStream(s.stream.video_id)"
                >
                  <img
                    v-if="s.stream.platform === 'youtube' && !failedThumbs.has(s.stream.video_id)"
                    class="thumb"
                    :src="thumbSrc(s.stream.video_id)"
                    :data-video-id="s.stream.video_id"
                    loading="lazy"
                    decoding="async"
                    alt=""
                    @error="onThumbError"
                  />
                  <ThumbnailFallback v-else class="thumb" />
                  <div class="sbody">
                    <div class="sl1">
                      <span class="n">{{ publishedDateText(s.stream.published_at) }}</span>
                    </div>
                    <div class="stitle" v-html="highlightPlain(unesc(s.stream.title))"></div>
                    <div class="sl3">
                      <span class="cats">{{ s.stream.categories.join(' / ') }}</span>
                      <span class="nt">{{ s.performances.length }} 曲</span>
                    </div>
                    <div v-if="result.hitTuneIdsByStream.get(s.stream.video_id)" class="hits">
                      {{
                        result.hitTuneIdsByStream
                          .get(s.stream.video_id)!
                          .map((tid) =>
                            snippetText(decodedPlain(data!.tunes.find((t) => t.tune_id === tid)?.title ?? '')),
                          )
                          .join(' / ')
                      }}
                    </div>
                  </div>
                </button>
              </template>
              <div class="fine">
                <button
                  class="ibtn dc"
                  type="button"
                  aria-label="一覧の先頭へ"
                  title="一覧の先頭へ"
                  @click="
                    ($event.currentTarget as HTMLElement).closest('.pb')?.scrollTo({ top: 0, behavior: 'smooth' })
                  "
                >
                  D.C.
                </button>
              </div>
            </div>
          </div>

          <div class="sheet s1">
            <div ref="progPanel" class="panel prog" tabindex="-1" v-bind="dialogAttrs('prog')">
              <div class="ph">
                <b>曲目</b>
                <span class="pcount n">{{
                  selectedStream ? countText(selectedStream.performances.length, '曲') : ''
                }}</span>
                <button
                  v-if="sheet !== ''"
                  class="ibtn shut"
                  type="button"
                  aria-label="曲目を閉じる"
                  @click="backToList"
                >
                  <svg
                    viewBox="0 0 16 16"
                    aria-hidden="true"
                    focusable="false"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.3"
                  >
                    <path d="M4 4l8 8M12 4l-8 8" />
                  </svg>
                </button>
              </div>
              <div v-if="!selectedStream" class="pb">
                <div class="quiet">—</div>
              </div>
              <div v-else class="pb" @click="onMarkdownClick">
                <div class="phead">
                  <figure v-if="selectedStream.stream.platform === 'youtube'" class="frame">
                    <button
                      class="zoom"
                      type="button"
                      @click="
                        openZoom(
                          selectedStream.stream.video_id,
                          unesc(selectedStream.stream.title),
                          publishedDateText(selectedStream.stream.published_at),
                        )
                      "
                      aria-label="サムネイルを拡大"
                    >
                      <span class="mat"
                        ><ThumbnailFallback v-if="failedThumbs.has(selectedStream.stream.video_id)" class="fimg" /><img
                          v-else
                          class="fimg"
                          :src="thumbSrc(selectedStream.stream.video_id, 'hq')"
                          :data-video-id="selectedStream.stream.video_id"
                          alt=""
                          @error="onThumbError"
                      /></span>
                    </button>
                  </figure>
                  <figure v-else class="frame">
                    <span class="mat"><span class="fnone">TikTok</span></span>
                  </figure>
                  <div class="pmeta">
                    <div class="pdate">{{ publishedDateTimeText(selectedStream.stream.published_at) }}</div>
                    <h3 class="ptitle" v-html="highlightPlain(unesc(selectedStream.stream.title))"></h3>
                    <div class="chips">
                      <button
                        v-for="c in selectedStream.stream.categories"
                        :key="c"
                        class="chip"
                        type="button"
                        :aria-pressed="category === c"
                        @click="toggleCategory(c)"
                      >
                        {{ c }}
                      </button>
                    </div>
                    <div class="plinks">
                      <a
                        v-if="selectedStream.stream.platform === 'youtube'"
                        class="ibtn"
                        :href="`https://www.youtube.com/watch?v=${selectedStream.stream.video_id}`"
                        target="_blank"
                        rel="noopener"
                        >YouTube で開く</a
                      >
                      <a
                        v-else-if="selectedStream.stream.url"
                        class="ibtn"
                        :href="selectedStream.stream.url"
                        target="_blank"
                        rel="noopener"
                        >TikTok で開く</a
                      >
                    </div>
                  </div>
                </div>

                <ol class="tunes">
                  <li
                    v-for="(perf, ti) in selectedStream.performances"
                    :key="perf.tune.tune_id"
                    class="trow"
                    :class="{
                      sel: perf.tune.tune_id === selectedPerformance?.tune.tune_id,
                      miss:
                        filtering &&
                        !(
                          result.matchedTuneIdsByStream.get(selectedStream.stream.video_id)?.has(perf.tune.tune_id) ??
                          true
                        ),
                    }"
                  >
                    <div class="tr">
                      <button class="tmain" type="button" @click="selectTune(perf.tune.tune_id)">
                        <span class="no n">{{ ti + 1 }}</span>
                        <span class="t1" v-html="highlightPlain(decodedPlain(perf.tune.title))"></span>
                      </button>
                      <div class="tside">
                        <div v-if="timedScenes(perf.scenes).length > 0" class="times">
                          <button
                            v-for="(sc, si) in timedScenes(perf.scenes)"
                            :key="si"
                            type="button"
                            class="tbtn"
                            :aria-pressed="play?.videoId === sc.video_id && play?.seconds === sc.start_seconds"
                            :aria-label="`${videoTimeText(sc.start_seconds)} から聴く`"
                            @click="
                              selectTune(perf.tune.tune_id);
                              play = { videoId: sc.video_id, seconds: sc.start_seconds };
                            "
                          >
                            {{ videoTimeText(sc.start_seconds) }}
                          </button>
                        </div>
                      </div>
                    </div>
                  </li>
                </ol>

                <div class="pnav">
                  <button class="pn" type="button" :disabled="!prevStream" @click="goToStream(prevStream)">
                    <span class="arr"
                      ><svg viewBox="0 0 16 16" aria-hidden="true" focusable="false" fill="none" stroke="currentColor">
                        <path d="M10 3.2 5.2 8l4.8 4.8" /></svg
                    ></span>
                    <span class="pt"
                      ><span class="k">前の配信</span
                      ><span class="v">{{
                        prevStream ? unesc(prevStream.stream.short_title || prevStream.stream.title) : ''
                      }}</span></span
                    >
                  </button>
                  <button class="pn nx" type="button" :disabled="!nextStream" @click="goToStream(nextStream)">
                    <span class="pt"
                      ><span class="k">次の配信</span
                      ><span class="v">{{
                        nextStream ? unesc(nextStream.stream.short_title || nextStream.stream.title) : ''
                      }}</span></span
                    >
                    <span class="arr"
                      ><svg viewBox="0 0 16 16" aria-hidden="true" focusable="false" fill="none" stroke="currentColor">
                        <path d="M6 3.2 10.8 8 6 12.8" /></svg
                    ></span>
                  </button>
                </div>
              </div>
            </div>

            <div class="sheet s2">
              <div ref="songPanel" class="side panel" tabindex="-1" v-bind="dialogAttrs('song')">
                <div class="ph">
                  <b>楽曲</b>
                  <span class="scount n">{{ songCountText }}</span>
                  <span v-if="selectedStream" class="crumb">{{
                    unesc(selectedStream.stream.short_title || selectedStream.stream.title)
                  }}</span>
                  <button
                    v-if="sheet === 'song'"
                    class="ibtn shut"
                    type="button"
                    aria-label="楽曲を閉じる"
                    @click="backToProgram"
                  >
                    <svg
                      viewBox="0 0 16 16"
                      aria-hidden="true"
                      focusable="false"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="1.3"
                    >
                      <path d="M4 4l8 8M12 4l-8 8" />
                    </svg>
                  </button>
                </div>
                <div v-if="!selectedPerformance" class="pb">
                  <div class="quiet">—</div>
                </div>
                <div v-else class="pb" @click="onMarkdownClick">
                  <div class="td">
                    <div class="tdt" v-html="renderMarkdown(selectedPerformance.tune.title)"></div>
                    <div v-if="selectedPerformance.tune.original_title" class="tdo">
                      {{ unesc(selectedPerformance.tune.original_title) }}
                    </div>

                    <dl v-if="selectedPerformance.tune.attributes.length > 0" class="attrs">
                      <template v-for="(a, ai) in selectedPerformance.tune.attributes" :key="ai">
                        <template v-if="a.name">
                          <dt>{{ a.name }}</dt>
                          <dd class="v">
                            <span v-if="a.text" v-html="renderMarkdown(a.text)"></span>
                            <span v-else>{{
                              a.people
                                .map(
                                  (p) =>
                                    unesc(data!.people.find((pp) => pp.person_id === p.person_id)?.name ?? '') +
                                    (p.note ? `（${unesc(p.note)}）` : ''),
                                )
                                .join('、')
                            }}</span>
                          </dd>
                        </template>
                        <dd v-else class="solo" v-html="renderMarkdown(a.text)"></dd>
                      </template>
                    </dl>

                    <ul v-if="selectedPerformance.tune.subtunes.length > 0" class="subs">
                      <li
                        v-for="(s, si) in selectedPerformance.tune.subtunes"
                        :key="si"
                        v-html="renderMarkdown(s)"
                      ></li>
                    </ul>

                    <div
                      v-if="selectedPerformance.description"
                      class="desc"
                      v-html="
                        renderMarkdown(selectedPerformance.description, {
                          videoId: selectedStream!.stream.video_id,
                          tuneId: selectedPerformance.tune.tune_id,
                        })
                      "
                    ></div>

                    <div v-if="play" class="vplay lead">
                      <figure class="frame">
                        <span class="mat"
                          ><iframe
                            class="video-embed"
                            :src="`${getEmbedURL(play.videoId)}?start=${play.seconds}`"
                            allow="
                              accelerometer;
                              autoplay;
                              clipboard-write;
                              encrypted-media;
                              gyroscope;
                              picture-in-picture;
                              web-share;
                            "
                            allowfullscreen
                            frameborder="0"
                          ></iframe
                        ></span>
                        <button class="pclose" type="button" aria-label="閉じる" @click="play = null">
                          <svg
                            viewBox="0 0 16 16"
                            aria-hidden="true"
                            focusable="false"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="1.3"
                          >
                            <path d="M4 4l8 8M12 4l-8 8" />
                          </svg>
                        </button>
                      </figure>
                    </div>

                    <div v-if="selectedPerformance.tune.videos.length > 0" class="sec">
                      <div class="sech">原曲などの動画</div>
                      <div v-for="v in selectedPerformance.tune.videos" :key="v.video_id" class="vrow">
                        <ThumbnailFallback v-if="failedThumbs.has(v.video_id)" class="vthumb" />
                        <img
                          v-else
                          class="vthumb"
                          :src="thumbSrc(v.video_id)"
                          :data-video-id="v.video_id"
                          loading="lazy"
                          decoding="async"
                          alt=""
                          @error="onThumbError"
                        />
                        <div class="vt">{{ unesc(v.title) }}</div>
                        <a
                          class="ibtn"
                          :href="`https://www.youtube.com/watch?v=${v.video_id}`"
                          target="_blank"
                          rel="noopener"
                          >YouTube で開く</a
                        >
                      </div>
                    </div>

                    <div v-if="selectedPerformance.tune.scores.length > 0" class="sec">
                      <div class="sech">楽譜</div>
                      <div v-for="(sc, si) in selectedPerformance.tune.scores" :key="si" class="rrow">
                        <a :href="sc.url" target="_blank" rel="noopener">{{ unesc(sc.title) }}</a>
                      </div>
                    </div>

                    <div class="sec">
                      <div class="sech">演奏した回数: {{ occurrences.length }}</div>
                      <div v-for="o in occurrences" :key="o.stream.video_id" class="orow" :class="{ cur: o.isCurrent }">
                        <span class="od">{{ publishedDateText(o.stream.published_at) }}</span>
                        <button
                          class="ot"
                          type="button"
                          @click="goToOccurrence(o.stream.video_id, selectedPerformance.tune.tune_id)"
                        >
                          {{ unesc(o.stream.short_title || o.stream.title) }}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>

      <div
        v-if="zoom"
        class="zoomback"
        role="dialog"
        aria-modal="true"
        :aria-label="zoom.title"
        @click="closeZoom"
        @keydown.esc.stop="closeZoom"
        @keydown="trapZoomFocus"
      >
        <div class="zoombox" @click.stop>
          <figure class="frame">
            <span class="mat"
              ><ThumbnailFallback v-if="failedThumbs.has(zoom.videoId)" class="fimg" /><img
                v-else
                class="fimg"
                :src="thumbSrc(zoom.videoId, 'max')"
                :data-video-id="zoom.videoId"
                alt=""
                @load="onZoomImgLoad"
                @error="onThumbError"
            /></span>
          </figure>
          <div class="zcap">
            <div class="ztitle">{{ zoom.title }}</div>
            <div class="sub">{{ zoom.dateText }}</div>
          </div>
          <button ref="zoomCloseButton" class="zclose" type="button" @click="closeZoom">
            <svg
              viewBox="0 0 16 16"
              aria-hidden="true"
              focusable="false"
              fill="none"
              stroke="currentColor"
              stroke-width="1.3"
            >
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
            閉じる
          </button>
        </div>
      </div>
    </section>

    <!-- Behind the sheets and over the rest of the page but for the navigation; pressing it closes one sheet. -->
    <template #overlay>
      <div v-if="sheet !== ''" class="gm-scrim" aria-hidden="true" @click="backToList"></div>
      <div v-if="sheet === 'song'" class="gm-scrim gm-scrim-front" aria-hidden="true" @click="backToProgram"></div>
    </template>

    <template #notes>
      <li>
        掲載内容についてのお問い合わせは
        <a href="https://github.com/nanase/kemov/issues" target="_blank" rel="noopener">issue</a> にご連絡ください
      </li>
      <li>このサイトは非公式のファンサイトです</li>
    </template>
  </SiteShell>
</template>

<style scoped>
/*
 * Ported from the confirmed mock (#139, Artifact
 * https://claude.ai/code/artifact/f1a5458f-2b6c-4aaa-a38d-e794e70d82cc) -
 * class names keep the mock's own shorthand so the two stay easy to
 * compare, prefixed `.gm` in place of the mock's own `.gd` root. Colours
 * come from `src/shell/palette-genet.css`'s `--k-*` tokens (already built
 * for this page); `--gm-*` below fills the few things that set - the frame's
 * wood gradient, the arrow accent and the title icon's own fixed colour -
 * which have no shared token because nothing else on the site uses them.
 */

.gm-icon {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  display: block;
  flex: none;
  background: var(--k-accent-soft);
  box-shadow: 0 0 0 2px #dd7278;
  object-fit: cover;
}

.gm {
  --gm-arrow: #c0622b;
  --gm-mat: #1b120c;
  --gm-wood-1: #a86b3c;
  --gm-wood-2: #74401f;
  --gm-wood-3: #93592d;
  --gm-wood-4: #5c3016;

  position: relative;
  display: block;
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) .gm {
    --gm-arrow: #f3b27c;
    --gm-mat: #0b0806;
    --gm-wood-1: #8d5630;
    --gm-wood-2: #5c3119;
    --gm-wood-3: #7a4725;
    --gm-wood-4: #45230f;
  }
}

:root[data-theme='dark'] .gm {
  --gm-arrow: #f3b27c;
  --gm-mat: #0b0806;
  --gm-wood-1: #8d5630;
  --gm-wood-2: #5c3119;
  --gm-wood-3: #7a4725;
  --gm-wood-4: #45230f;
}

.gm * {
  box-sizing: border-box;
}

.gm .n {
  font-variant-numeric: tabular-nums;
}

/* ---- 印 -------------------------------------------------------------- */
.gm .ic {
  display: inline-flex;
  width: 15px;
  height: 15px;
  flex: none;
  color: var(--k-text-2);
}

.gm .ic :deep(svg) {
  width: 100%;
  height: 100%;
  display: block;
}

/* ---- 面ごとの条件（さがす・演奏のしかた・年・カテゴリ） ----------------- */
.gm-ctl {
  display: flex;
  flex-flow: row wrap;
  align-items: center;
  gap: 8px 10px;
  min-width: 0;
  padding: 8px 12px;
  margin-bottom: 10px;
  background: var(--k-surface);
  border: 1px solid var(--k-line);
  border-radius: 8px;
  box-shadow: var(--k-shadow);
}

.gm .find {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1 1 240px;
  max-width: 460px;
  min-width: 0;
  padding: 3px 8px;
  border: 1px solid var(--k-line-2);
  border-radius: 5px;
  background: var(--k-surface-2);
}

.gm .find:focus-within {
  border-color: var(--k-accent);
}

.gm .find svg {
  width: 13px;
  height: 13px;
  flex: none;
  color: var(--k-text-3);
}

.gm .find input {
  flex: 1 1 auto;
  min-width: 0;
  font: inherit;
  font-size: 12px;
  padding: 2px 0;
  border: 0;
  background: none;
  color: var(--k-text);
  outline: none;
}

.gm .find input::-webkit-search-cancel-button {
  appearance: none;
  display: none;
}

.gm .xq {
  font-size: 10.5px;
  line-height: 1.3;
  padding: 0 5px 1px;
  border: 1px solid var(--k-line-2);
  border-radius: 3px;
  background: var(--k-surface);
  color: var(--k-text-3);
  cursor: pointer;
  flex: none;
}

.gm .xq:hover {
  color: var(--k-text);
  border-color: var(--k-accent);
}

.gm .segs {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  min-width: 0;
}

.gm .seg {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  line-height: 1.4;
  padding: 2px 9px 3px 7px;
  border: 1px solid var(--k-line-2);
  border-radius: 999px;
  background: var(--k-surface);
  color: var(--k-text-2);
  cursor: pointer;
  white-space: nowrap;
}

.gm .seg:hover {
  border-color: var(--k-accent);
}

.gm .seg[aria-pressed='true'] {
  background: var(--k-accent);
  border-color: var(--k-accent);
  color: var(--k-on-accent);
}

.gm .seg .ic {
  width: 14px;
  height: 14px;
  color: inherit;
}

.gm .pick {
  font: inherit;
  font-size: 11.5px;
  line-height: 1.4;
  padding: 2px 6px 3px;
  border: 1px solid var(--k-line-2);
  border-radius: 999px;
  background: var(--k-surface);
  color: var(--k-text-2);
  cursor: pointer;
  max-width: 100%;
  min-width: 0;
}

.gm .ibtn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  height: 24px;
  min-width: 26px;
  padding: 0 6px;
  border: 1px solid var(--k-line-2);
  border-radius: 5px;
  background: var(--k-surface);
  color: var(--k-text-2);
  cursor: pointer;
  font-size: 11px;
  text-decoration: none;
  white-space: nowrap;
}

.gm .ibtn:hover {
  border-color: var(--k-accent);
  color: var(--k-text);
}

.gm .ibtn svg {
  width: 13px;
  height: 13px;
  display: block;
  flex: none;
}

/* ---- 盤。配信 → 曲目 → 曲 -------------------------------------------- */
.board {
  display: grid;
  grid-template-columns: 340px 430px minmax(0, 1fr);
  gap: 10px;
  height: 760px;
}

.board > * {
  min-width: 0;
  min-height: 0;
}

.gm .rail,
.gm .shut,
.gm .crumb {
  display: none;
}

.gm .sheet {
  display: contents;
}

.gm-scrim {
  display: none;
}

.gm .panel {
  background: var(--k-surface);
  border: 1px solid var(--k-line);
  border-radius: 8px;
  box-shadow: var(--k-shadow);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
  min-height: 0;
}

.gm .ph {
  display: flex;
  align-items: center;
  gap: 5px 10px;
  flex-wrap: wrap;
  padding: 6px 12px;
  min-height: 35px;
  background: var(--k-surface-2);
  border-bottom: 1px solid var(--k-line);
  font-size: 11px;
  color: var(--k-text-3);
  flex: none;
}

.gm .quiet {
  padding: 40px 14px;
  text-align: center;
  font-size: 12px;
  color: var(--k-text-3);
}

.gm .ph b {
  font-size: 12px;
  font-weight: 600;
  color: var(--k-text-2);
  letter-spacing: 0.02em;
}

.gm .pb {
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden auto;
}

.gm .counts {
  font-size: 11px;
  color: var(--k-text-3);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.gm .counts :deep(b) {
  font-size: 12px;
  color: var(--k-text);
  font-weight: 600;
}

.gm .yh {
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 4px 12px;
  background: var(--k-surface-2);
  border-bottom: 1px solid var(--k-line);
  font-size: 11px;
  color: var(--k-text-3);
  font-variant-numeric: tabular-nums;
}

.gm .yh b {
  font-size: 12px;
  color: var(--k-text-2);
  font-weight: 600;
}

.gm .srow {
  display: grid;
  grid-template-columns: 96px minmax(0, 1fr);
  gap: 10px;
  align-items: start;
  width: 100%;
  padding: 8px 12px;
  margin: 0;
  border: 0;
  border-top: 1px dashed var(--k-line);
  background: none;
  text-align: left;
  cursor: pointer;
}

.gm .yh + .srow {
  border-top: 0;
}

.gm .srow:hover {
  background: var(--k-sunken);
}

.gm .srow[aria-current='true'] {
  background: var(--k-accent-soft);
  box-shadow: inset 3px 0 0 var(--k-accent);
}

.gm .thumb {
  width: 96px;
  height: 54px;
  display: block;
  object-fit: cover;
  border-radius: 3px;
  border: 1px solid var(--k-line);
  background: var(--k-track);
}

.gm .sbody {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.gm .sl1 {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  font-size: 11px;
  color: var(--k-text-3);
  font-variant-numeric: tabular-nums;
}

.gm .stitle {
  font-size: 12.5px;
  font-weight: 600;
  line-height: 1.42;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.gm .sl3 {
  display: flex;
  gap: 8px;
  min-width: 0;
  font-size: 10.5px;
  color: var(--k-text-3);
  font-variant-numeric: tabular-nums;
}

.gm .sl3 .cats {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gm .sl3 .nt {
  margin-left: auto;
  white-space: nowrap;
}

.gm .hits {
  font-size: 11px;
  color: var(--k-text-2);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gm :deep(mark) {
  background: var(--k-accent-soft);
  color: inherit;
  border-radius: 2px;
  padding: 0 1px;
  box-shadow: inset 0 -1px 0 var(--k-accent);
}

.gm .fine {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 22px 12px 26px;
  border-top: 1px solid var(--k-line);
}

.gm .dc {
  font-family: 'Times New Roman', Times, 'Noto Serif', Georgia, serif;
  font-weight: 700;
  font-style: italic;
  font-size: 15px;
  letter-spacing: 0.03em;
  height: 28px;
  padding: 0 10px;
  border: 0;
  background: none;
  color: var(--k-text-2);
}

.gm .dc:hover {
  color: var(--k-accent);
}

.gm .rest {
  display: grid;
  justify-items: center;
  gap: 10px;
  padding: 40px 14px;
  color: var(--k-text-3);
  font-size: 12px;
  text-align: center;
}

.gm .rest svg {
  width: 110px;
  height: 40px;
  display: block;
}

/* ---- 面2 曲目 -------------------------------------------------------- */
.gm .phead {
  display: grid;
  grid-template-columns: 184px minmax(0, 1fr);
  gap: 12px;
  padding: 12px;
  border-bottom: 1px solid var(--k-line);
}

.gm .phead .frame {
  align-self: start;
}

.gm .pmeta {
  display: grid;
  gap: 4px;
  align-content: start;
  min-width: 0;
}

.gm .pdate {
  font-size: 11px;
  color: var(--k-text-3);
  font-variant-numeric: tabular-nums;
}

.gm .ptitle {
  margin: 0;
  font-size: 14.5px;
  font-weight: 700;
  line-height: 1.45;
  text-wrap: pretty;
  overflow-wrap: anywhere;
}

.gm .chips {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
}

.gm .chip {
  font-size: 10.5px;
  line-height: 1.5;
  padding: 0 6px;
  border: 1px solid var(--k-line-2);
  border-radius: 3px;
  background: var(--k-surface);
  color: var(--k-text-2);
  white-space: nowrap;
  cursor: pointer;
}

.gm .chip:hover {
  border-color: var(--k-accent);
  color: var(--k-text);
}

.gm .chip[aria-pressed='true'] {
  background: var(--k-accent);
  border-color: var(--k-accent);
  color: var(--k-on-accent);
}

.gm .plinks {
  display: flex;
  gap: 6px;
  margin-top: 2px;
}

/* 額縁。このページでいちばん強い飾りは、ここだけに置く */
.gm .frame {
  position: relative;
  margin: 0;
  padding: 7px;
  border-radius: 4px;
  background:
    repeating-linear-gradient(
      97deg,
      rgb(30 12 3 / 0%) 0 2px,
      rgb(30 12 3 / 12%) 2px 3px,
      rgb(255 228 196 / 5%) 3px 6px,
      rgb(30 12 3 / 0%) 6px 9px
    ),
    linear-gradient(155deg, var(--gm-wood-1), var(--gm-wood-2) 42%, var(--gm-wood-3) 68%, var(--gm-wood-4));
  box-shadow:
    inset 0 0 0 1px rgb(0 0 0 / 30%),
    inset 0 1px 0 rgb(255 234 208 / 22%),
    0 8px 18px -14px rgb(30 12 3 / 90%);
}

.gm .mat {
  position: relative;
  aspect-ratio: 16 / 9;
  width: 100%;
  display: grid;

  /* The track is the box's own size, not its content's. An `auto` track grows
     to the picture (a 4:3 `hqdefault` is taller than this 16:9 box), so the
     picture's `height: 100%` resolved against that taller track and `cover`
     had nothing to crop: the picture sat at the top with its black bands. */
  grid-template: minmax(0, 1fr) / minmax(0, 1fr);
  place-items: center;
  overflow: hidden;
  background: var(--gm-mat);
  border-radius: 1px;
  box-shadow: inset 0 0 0 1px rgb(0 0 0 / 55%);
}

.gm .mat .fimg {
  display: block;
  max-width: none;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.gm .mat .fnone {
  font-size: 11px;
  color: #cdbeb0;
}

.gm .zoom {
  display: block;
  width: 100%;
  padding: 0;
  margin: 0;
  border: 0;
  background: none;
  cursor: zoom-in;
}

.gm .tunes {
  list-style: none;
  margin: 0;
  padding: 0;
}

.gm .trow {
  border-top: 1px dashed var(--k-line);
}

.gm .trow:first-child {
  border-top: 0;
}

.gm .tr {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 6px;
  align-items: start;
  padding: 0 12px 0 0;
}

.gm .tmain {
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr);
  gap: 0 4px;
  align-items: baseline;
  padding: 8px 0;
  margin: 0;
  border: 0;
  background: none;
  text-align: left;
  cursor: pointer;
  min-width: 0;
}

.gm .tmain .no {
  text-align: right;
  padding-right: 6px;
  font-size: 11px;
  color: var(--k-text-3);
}

.gm .tmain .t1 {
  font-size: 13px;
  font-weight: 600;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.gm .trow:hover .tr {
  background: var(--k-sunken);
}

.gm .trow.sel .tr {
  background: var(--k-accent-soft);
  box-shadow: inset 3px 0 0 var(--k-accent);
}

.gm .trow.miss .t1 {
  font-weight: 500;
  color: var(--k-text-2);
}

.gm .tside {
  display: flex;
  justify-content: flex-end;
  align-items: flex-start;
  gap: 5px;
  padding-top: 8px;
}

.gm .times {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 3px;
}

.gm :deep(.tbtn) {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  height: 20px;
  padding: 0 7px;
  border-radius: 999px;
  border: 1px solid var(--k-line-2);
  background: var(--k-surface);
  color: var(--k-accent);
  font-size: 11px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  white-space: nowrap;
  vertical-align: 1px;
}

.gm :deep(.tbtn:hover) {
  background: var(--k-accent-soft);
  border-color: var(--k-accent);
}

.gm :deep(.tbtn[aria-pressed='true']) {
  background: var(--k-accent);
  border-color: var(--k-accent);
  color: var(--k-on-accent);
}

.gm .pnav {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  padding: 10px 12px 14px;
  border-top: 1px solid var(--k-line);
}

.gm .pn {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr);
  gap: 8px;
  align-items: center;
  padding: 6px 9px 6px 6px;
  min-width: 0;
  border: 1px solid var(--k-line);
  border-radius: 5px;
  background: var(--k-surface-2);
  text-align: left;
  cursor: pointer;
}

.gm .pn.nx {
  grid-template-columns: minmax(0, 1fr) 24px;
  padding: 6px 6px 6px 9px;
  text-align: right;
}

.gm .pn .arr {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  border: 1.5px solid var(--gm-arrow);
  color: var(--gm-arrow);
  background: none;
}

.gm .pn .arr svg {
  width: 13px;
  height: 13px;
  display: block;
  stroke-width: 2.2;
}

.gm .pn:hover .arr {
  background: var(--gm-arrow);
  color: var(--k-surface);
}

.gm .pn.nx .arr {
  grid-column: 2;
  grid-row: 1;
}

.gm .pn .pt {
  display: grid;
  gap: 1px;
  min-width: 0;
}

.gm .pn.nx .pt {
  grid-column: 1;
  grid-row: 1;
}

.gm .pn:hover {
  border-color: var(--k-accent);
  background: var(--k-accent-soft);
}

.gm .pn .k {
  font-size: 10.5px;
  color: var(--k-text-3);
}

.gm .pn .v {
  font-size: 11.5px;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gm .pn[disabled] {
  visibility: hidden;
}

/* ---- 面3 曲 ----------------------------------------------------------- */
.gm .td {
  display: grid;
  gap: 12px;
  padding: 14px 14px 18px;
  min-width: 0;
}

.gm .tdt {
  font-size: 17px;
  font-weight: 700;
  line-height: 1.45;
  text-wrap: pretty;
  overflow-wrap: anywhere;
}

.gm .tdo {
  font-size: 12px;
  color: var(--k-text-2);
  margin-top: 3px;
  overflow-wrap: anywhere;
}

.gm :deep(.td a:not(.ibtn)) {
  color: inherit;
  text-decoration: underline;
  text-decoration-style: dotted;
  text-decoration-color: var(--k-line-2);
  text-underline-offset: 3px;
}

.gm :deep(.td a:not(.ibtn):hover) {
  color: var(--k-accent);
  text-decoration-color: var(--k-accent);
}

.gm .attrs {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: 3px 12px;
  font-size: 12px;
}

.gm .attrs dt {
  font-size: 11px;
  color: var(--k-text-3);
  padding-top: 1px;
  white-space: nowrap;
}

.gm .attrs .v {
  min-width: 0;
  overflow-wrap: anywhere;
}

.gm .attrs .solo {
  grid-column: 1 / -1;
  min-width: 0;
  overflow-wrap: anywhere;
}

.gm .subs {
  margin: 0;
  padding: 0 0 0 16px;
  font-size: 12px;
  color: var(--k-text-2);
  display: grid;
  gap: 1px;
}

.gm .desc {
  font-size: 12.5px;
  line-height: 1.9;
  overflow-wrap: anywhere;
  padding-top: 10px;
  border-top: 1px dashed var(--k-line);
}

.gm .sec {
  display: grid;
  gap: 4px;
  padding-top: 10px;
  border-top: 1px solid var(--k-line);
  min-width: 0;
}

.gm .sech {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 600;
  color: var(--k-text-3);
}

.gm .vrow {
  display: grid;
  grid-template-columns: 112px minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  padding: 5px 0;
  border-top: 1px dashed var(--k-line);
  min-width: 0;
}

.gm .sech + .vrow,
.gm .sech + .vplay {
  border-top: 0;
}

.gm .vthumb {
  width: 112px;
  height: 63px;
  display: block;
  object-fit: cover;
  border-radius: 3px;
  border: 1px solid var(--k-line);
  background: var(--k-track);
}

.gm .vt {
  min-width: 0;
  font-size: 12px;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.gm .vplay {
  display: grid;
  gap: 6px;
  padding: 6px 0;
}

.gm .vplay .frame {
  padding: 9px;
}

.gm .vplay.lead {
  padding: 0;
}

.video-embed {
  display: block;
  width: 100%;
  height: 100%;
  aspect-ratio: 16 / 9;
  background: #000;
  border: 0;
}

.gm .rrow {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 3px 0;
  font-size: 12px;
}

.gm .rrow a {
  min-width: 0;
  overflow-wrap: anywhere;
}

.gm .orow {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 8px;
  align-items: center;
  padding: 5px 8px;
  border-top: 1px dashed var(--k-line);
  min-width: 0;
  border-radius: 3px;
}

.gm .orow.cur {
  background: var(--k-accent-soft);
  box-shadow: inset 3px 0 0 var(--k-accent);
  border-top-color: transparent;
}

.gm .orow.cur + .orow {
  border-top-color: transparent;
}

.gm .orow.cur .od {
  color: var(--k-accent);
  font-weight: 600;
}

.gm .orow.cur .ot {
  font-weight: 600;
  text-decoration: none;
  cursor: default;
}

.gm .sech + .orow {
  border-top: 0;
}

.gm .orow .od {
  font-size: 11px;
  color: var(--k-text-3);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.gm .orow .ot {
  min-width: 0;
  padding: 0;
  border: 0;
  background: none;
  text-align: left;
  cursor: pointer;
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-decoration: underline;
  text-decoration-style: dotted;
  text-decoration-color: var(--k-line-2);
  text-underline-offset: 3px;
}

.gm .orow .ot:hover {
  color: var(--k-accent);
}

.gm .pclose {
  position: absolute;
  top: 8px;
  right: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 24px;
  padding: 0;
  border-radius: 4px;
  border: 1px solid rgb(255 234 208 / 35%);
  background: rgb(20 10 4 / 55%);
  color: #fff8f2;
  cursor: pointer;
}

.gm .pclose:hover {
  background: rgb(20 10 4 / 85%);
}

.gm .pclose svg {
  width: 13px;
  height: 13px;
  display: block;
}

/* サムネイルの拡大。position: fixed は使わず、.gm の上に重ねる */
.gm .zoomback {
  position: absolute;
  inset: 0;
  z-index: 50;
  background: rgb(18 9 3 / 66%);
  backdrop-filter: blur(2px);
}

.gm .zoombox {
  position: sticky;
  top: 56px;
  margin: 56px auto 24px;
  width: min(calc(100% - 32px), 408px);
  display: grid;
  gap: 8px;
}

.gm .zoombox .frame {
  padding: 12px;
}

.gm .zoombox .mat .fimg {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.gm .zcap {
  display: grid;
  gap: 2px;
  padding: 8px 12px 10px;
  background: var(--k-surface);
  border: 1px solid var(--k-line);
  border-radius: 6px;
}

.gm .ztitle {
  font-size: 13px;
  font-weight: 700;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.gm .zclose {
  justify-self: end;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 28px;
  padding: 0 10px;
  border-radius: 5px;
  cursor: pointer;
  font-size: 12px;
  border: 1px solid rgb(255 234 208 / 40%);
  background: rgb(20 10 4 / 60%);
  color: #fff8f2;
}

.gm .zclose:hover {
  background: rgb(20 10 4 / 90%);
}

.gm .zclose svg {
  width: 13px;
  height: 13px;
  display: block;
}

/* ---- 読み込み中・取得に失敗 ------------------------------------------- */
.gm-sk {
  display: grid;
  gap: 2px;
  border: 1px solid var(--k-line);
  border-radius: 8px;
  overflow: hidden;
}

.gm-sk .sk-row {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 8px 12px;
}

.gm-sk .sk {
  background: var(--k-track);
  border-radius: 3px;
  animation: gm-pulse 1.8s ease-in-out infinite;
}

.gm-sk .sk-thumb {
  width: 96px;
  height: 54px;
  flex: none;
}

.gm-sk .sk-line {
  height: 14px;
  flex: 1 1 auto;
}

@keyframes gm-pulse {
  0%,
  100% {
    opacity: 0.45;
  }

  50% {
    opacity: 0.95;
  }
}

.gm-err {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 5px;
  text-align: center;
  padding: 40px 14px;
}

.gm-err .x1 {
  font-size: 14px;
  font-weight: 600;
  color: var(--k-text-2);
}

.gm-err .x2 {
  font-size: 12px;
  color: var(--k-text-3);
}

/* ---- 1100px 未満。2 面ずつ見せる --------------------------------------- */
@container (max-width: 1099px) {
  .board {
    grid-template-columns: 300px minmax(0, 1fr);
    height: 720px;
  }

  .board > .side,
  .gm .s2 > .side {
    display: none;
  }

  .gm[data-pair='song'] .board {
    grid-template-columns: 34px minmax(0, 1fr) minmax(0, 1fr);
  }

  .gm[data-pair='song'] .board .list {
    display: none;
  }

  .gm[data-pair='song'] .s2 > .side {
    display: flex;
  }

  .gm[data-pair='song'] .rail {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 10px 0;
    margin: 0;
    cursor: pointer;
    border: 1px solid var(--k-line);
    border-radius: 8px;
    background: var(--k-surface-2);
    color: var(--k-text-2);
    box-shadow: var(--k-shadow);
  }

  .gm .rail svg {
    width: 14px;
    height: 14px;
    display: block;
  }

  .gm .rail .rl {
    writing-mode: vertical-rl;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.2em;
  }
}

/* ---- 720px 未満。配信の上に、曲目・楽曲を重ねる ------------------------ */
@container (max-width: 719px) {
  .gm-ctl {
    gap: 8px;
  }

  .gm .find {
    flex-basis: 100%;
    max-width: none;
  }

  .board,
  .gm[data-pair='song'] .board {
    grid-template-columns: minmax(0, 1fr);
    height: auto;
  }

  .gm[data-pair='song'] .board .list {
    display: flex;
  }

  .gm .rail,
  .gm[data-pair='song'] .rail {
    display: none;
  }

  .board > .prog,
  .board > .side {
    display: none;
  }

  .gm .pb {
    overflow: visible;
  }

  .gm .panel {
    overflow: visible;
  }

  .gm .ph {
    border-radius: 8px 8px 0 0;
  }

  .gm .srow {
    grid-template-columns: 88px minmax(0, 1fr);
  }

  .gm .thumb {
    width: 88px;
    height: 50px;
  }

  .gm .phead {
    grid-template-columns: 132px minmax(0, 1fr);
  }

  .gm .vrow {
    grid-template-columns: 96px minmax(0, 1fr) auto;
  }

  .gm .vthumb {
    width: 96px;
    height: 54px;
  }

  .gm .sheet {
    display: none;
  }

  /*
   * The sheets are laid out over the list, and what is dimmed and pressed to
   * close is .gm-scrim, which reaches past .gm. Stacking, from the back:
   * .gm-scrim, the program, .gm-scrim-front, the song - every one of them
   * below the navigation band, which is what keeps the band from being dimmed
   * or covered. .s1 has no z-index of its own so that the song (inside it) and
   * the front scrim share one stacking context with the program.
   */
  .gm[data-sheet='prog'] .s1,
  .gm[data-sheet='song'] .s1,
  .gm[data-sheet='song'] .s2 {
    display: block;
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  .gm[data-sheet='song'] .s2 {
    z-index: 29;
  }

  .gm-scrim {
    display: block;
    position: absolute;
    z-index: 26;
    inset: var(--shell-nav-height) 0 0;
    background: rgb(20 10 4 / 34%);
    backdrop-filter: blur(1px);
    cursor: pointer;
  }

  .gm-scrim-front {
    z-index: 28;
  }

  .gm .sheet > .panel,
  .gm[data-sheet='song'] .s2 > .side {
    display: flex;
    position: sticky;
    z-index: 27;
    pointer-events: auto;

    /* Focus is put here when the sheet opens, so it is no control to outline. */
    outline: none;
    top: 92px;
    height: calc(100vh - 92px);
    margin: 0 6px;
    overflow: hidden;
    border-radius: 12px 12px 0 0;
    box-shadow: 0 -14px 34px -14px rgb(0 0 0 / 55%);
  }

  .gm .s2 > .panel,
  .gm[data-sheet='song'] .s2 > .side {
    top: 150px;
    height: calc(100vh - 150px);
  }

  .gm .sheet > .panel > .ph {
    position: relative;
    padding-top: 14px;
    border-radius: 12px 12px 0 0;
  }

  .gm .sheet > .panel > .ph::before {
    content: '';
    position: absolute;
    top: 5px;
    left: 50%;
    width: 36px;
    height: 4px;
    margin-left: -18px;
    border-radius: 2px;
    background: var(--k-line-2);
  }

  .gm .sheet .pb {
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  .gm .shut {
    display: inline-flex;
    margin-left: auto;
  }

  .gm .crumb {
    display: block;
    min-width: 0;
    flex: 1 1 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

/* ---- 動き ------------------------------------------------------------- */
.gm-fade-enter-active {
  animation: gm-rise 0.18s cubic-bezier(0.2, 0.7, 0.3, 1) both;
}

.gm-fade-leave-active {
  animation: gm-sink 0.14s ease-in both;
}

.gm-swap-enter-active {
  animation: gm-swap 0.16s ease-out both;
}

@keyframes gm-rise {
  from {
    opacity: 0;
    transform: translateY(24px);
  }

  to {
    opacity: 1;
    transform: none;
  }
}

@keyframes gm-sink {
  from {
    opacity: 1;
    transform: none;
  }

  to {
    opacity: 0;
    transform: translateY(24px);
  }
}

@keyframes gm-swap {
  from {
    opacity: 0.25;
    transform: translateY(8px);
  }

  to {
    opacity: 1;
    transform: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .gm-fade-enter-active,
  .gm-fade-leave-active,
  .gm-swap-enter-active {
    animation: none !important;
  }
}
</style>
