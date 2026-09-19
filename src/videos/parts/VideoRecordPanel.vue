<script setup lang="ts">
import { computed } from 'vue';
import { withCommas } from '@nanase/alnilam/number';

import type { Channel, VideoType } from '@/type/api';
import { formatDateTime } from '@/lib/timeFormat';
import { formatDuration, formatProperty, getPropertyName, type VideoProperty } from '@/type/video';
import type { RankingPeriod, VideoTableRow } from '@/lib/ranking';
import { getWatchURL } from '@/lib/youtube';
import { COUNT_METRICS, kindName, RATE_METRICS, scopeName, universeOf, type Universe } from '../model';
import { memberColor } from '@/lib/memberColor';
import MemberAvatar from '@/parts/MemberAvatar.vue';
import VideoThumbnail from './VideoThumbnail.vue';

/**
 * The right leaf of the spread: the selected video's own record.
 *
 * The eleven-metric ledger at the bottom ranks the same video eleven times
 * over, each against the kind and period already chosen - never against a
 * different one, and never against another video's own ranking (#135).
 */
const { video, channel, metric, kind, period, rows, now, hidden, dark } = defineProps<{
  video: VideoTableRow | null;
  channel: Channel | undefined;
  metric: VideoProperty;
  kind: VideoType;
  period: RankingPeriod;
  rows: readonly VideoTableRow[];
  now: Date;
  /** True when the video does not pass the length/channel/title filters currently in effect. */
  hidden: boolean;
  dark: boolean;
}>();

const emit = defineEmits<{ metric: [VideoProperty]; openLightbox: []; close: [] }>();

const EM_DASH = '—';

const universe = computed<Universe>(() => universeOf(rows, metric, kind, period, now));
const entry = computed(() => (video ? (universe.value.byId.get(video.videoId) ?? null) : null));

const allTimeUniverse = computed<Universe | null>(() =>
  period === 'all' ? null : universeOf(rows, metric, kind, 'all', now),
);
const allTimeEntry = computed(() =>
  video && allTimeUniverse.value ? (allTimeUniverse.value.byId.get(video.videoId) ?? null) : null,
);

const share = computed(() => {
  if (!entry.value || universe.value.top <= 0) return 0;

  return Math.max(0, Math.min(100, (entry.value.value / universe.value.top) * 100));
});

const ratioText = computed(() => {
  if (!entry.value) return `${getPropertyName(metric)}は、この 1 本では出せません`;

  const text = `${getPropertyName(metric)}：1 位の ${share.value.toFixed(1)}%`;

  return entry.value.rank > 1 && entry.value.value > 0
    ? `${text}（1 位はこの ${(universe.value.top / entry.value.value).toFixed(1)} 倍）`
    : text;
});

const ledgerGroups = [
  { label: '計測値', metrics: COUNT_METRICS },
  { label: '密度', metrics: RATE_METRICS },
];

/**
 * One Universe per metric, built once per reactive render rather than once
 * per cell. The template reads `ledgerRank`/`ledgerTotal` up to five times
 * per metric - at 6,000-plus rows, `universeOf`'s own sort is not cheap
 * enough to redo that often.
 */
const ledgerUniverses = computed(() => {
  const metrics = [...COUNT_METRICS, ...RATE_METRICS];

  return new Map(metrics.map((m) => [m.id, universeOf(rows, m.id, kind, period, now)]));
});

function ledgerRank(id: VideoProperty) {
  if (!video) return null;

  return ledgerUniverses.value.get(id)?.byId.get(video.videoId) ?? null;
}

function ledgerTotal(id: VideoProperty) {
  return ledgerUniverses.value.get(id)?.total ?? 0;
}

function avatarStyle() {
  return channel ? { '--who-ch': memberColor(channel.color.key, dark) } : undefined;
}
</script>

<template>
  <div v-if="!video" class="blank">配信・動画を選択してください。</div>

  <div v-else class="rec">
    <div class="hero">
      <button type="button" class="shotbtn" aria-label="サムネイルを大きく見る" @click="emit('openLightbox')">
        <VideoThumbnail :video-id="video.videoId" size="sd" />
        <span class="zoom" aria-hidden="true">
          <svg viewBox="0 0 16 16">
            <circle cx="7" cy="7" r="4.4" fill="none" stroke="currentColor" stroke-width="1.6" />
            <path d="M10.4 10.4 L14 14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
            <path d="M5 7h4M7 5v4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
          </svg>
        </span>
      </button>
      <div>
        <h3>
          <a :href="getWatchURL(video.videoId)" target="_blank" rel="noopener noreferrer">
            {{ video.title }}<span class="out" aria-hidden="true">&#8599;</span>
          </a>
        </h3>
        <div class="who">
          <MemberAvatar
            :src="channel?.thumbnailUrl ?? null"
            :name="channel?.name ?? video.channelId"
            :color="channel?.color.key ?? null"
            :size="16"
            :dark="dark"
          />
          <span class="nm" :style="avatarStyle()">{{ channel?.name ?? video.channelId }}</span>
        </div>
      </div>
    </div>

    <dl class="facts">
      <dt>公開</dt>
      <dd>{{ formatDateTime(new Date(video.publishedAt).getTime()) }}</dd>
      <dt>種別</dt>
      <dd>{{ kindName(video.type ?? kind) }}</dd>
      <dt>再生時間</dt>
      <dd>{{ video.durationSeconds === null ? EM_DASH : formatDuration(video.durationSeconds) }}</dd>
    </dl>

    <div class="standing">
      <div class="head">
        <span class="v">{{ entry ? formatProperty(metric, entry.value) : EM_DASH }}</span>
        <span class="pos">
          <template v-if="entry">
            <b>{{ withCommas(entry.rank) }}</b> 位 / {{ withCommas(universe.total) }} 本
          </template>
          <template v-else>順位が付きません</template>
        </span>
      </div>
      <div class="track" :style="{ '--bar-w': `${share.toFixed(1)}%` }"></div>
      <div class="ratio">{{ ratioText }}</div>
      <div v-if="period !== 'all'" class="alltime">
        {{ kindName(kind) }}・全期間のうち
        <template v-if="allTimeEntry">
          <b>{{ withCommas(allTimeEntry.rank) }} 位</b> / {{ withCommas(allTimeUniverse?.total ?? 0) }} 本
        </template>
        <template v-else>順位が付きません</template>
      </div>
    </div>

    <div v-if="hidden" class="offlist">
      この 1 本は、いまの絞り込みには当てはまりません。順位はそのまま残しています。
    </div>

    <div class="sheetlabel">
      <span class="tag">この 1 本の 11 指標</span>
      <span class="note">{{ scopeName(kind, period) }}のうち</span>
    </div>

    <table class="ledger">
      <tbody>
        <template v-for="group in ledgerGroups" :key="group.label">
          <tr class="group">
            <th>{{ group.label }}</th>
            <th>値</th>
            <th>順位</th>
          </tr>
          <tr v-for="m in group.metrics" :key="m.id" :class="{ on: m.id === metric }" @click="emit('metric', m.id)">
            <td class="m">{{ m.name }}</td>
            <td class="v">{{ ledgerRank(m.id) ? formatProperty(m.id, ledgerRank(m.id)!.value) : EM_DASH }}</td>
            <td class="p">
              {{
                ledgerRank(m.id) ? `${withCommas(ledgerRank(m.id)!.rank)} / ${withCommas(ledgerTotal(m.id))}` : EM_DASH
              }}
            </td>
          </tr>
        </template>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.blank {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  text-align: center;
  padding: 34px 14px;
  font-size: 11.5px;
  color: var(--k-text-3);
  line-height: 1.7;
}

.rec {
  display: grid;
  gap: 10px;
}

.hero {
  display: grid;
  gap: 8px;
}

.shotbtn {
  position: relative;
  display: block;
  width: 100%;
  aspect-ratio: 16 / 9;
  padding: 0;
  border: 0;
  background: none;
  cursor: zoom-in;
  border-radius: 6px;
  overflow: hidden;
}

.shotbtn .zoom {
  position: absolute;
  right: 7px;
  bottom: 7px;
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border-radius: 5px;
  background: rgb(14 31 28 / 62%);
  color: #fff;
  opacity: 0;
  transition: opacity 0.22s ease;
}

.shotbtn .zoom svg {
  width: 15px;
  height: 15px;
}

.shotbtn:hover .zoom,
.shotbtn:focus-visible .zoom {
  opacity: 1;
}

.rec h3 {
  margin: 0 0 3px;
  font-size: 13.5px;
  font-weight: 600;
  line-height: 1.45;
}

.rec h3 a {
  color: inherit;
  text-decoration: none;
  border-radius: 3px;
}

.rec h3 a:hover {
  color: var(--k-accent);
  text-decoration: underline;
}

.rec h3 .out {
  display: inline-block;
  margin-left: 3px;
  font-size: 11px;
  font-weight: 400;
  color: var(--k-text-3);
  vertical-align: 1px;
}

.rec h3 a:hover .out {
  color: var(--k-accent);
}

.who {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--k-text-3);
}

.who :deep(.avatar) {
  border: 1px solid var(--k-line);
}

.who .nm {
  color: var(--who-ch, var(--k-text-3));
  font-weight: 500;
}

.facts {
  margin-top: 0;
  border-top: 1px solid var(--k-line);
  display: grid;
  grid-template-columns: 58px minmax(0, 1fr);
  font-size: 11.5px;
}

.facts dt {
  padding: 3px 0;
  color: var(--k-text-3);
  border-bottom: 1px solid var(--k-line);
}

.facts dd {
  margin: 0;
  padding: 3px 0;
  color: var(--k-text-2);
  font-variant-numeric: tabular-nums;
  border-bottom: 1px solid var(--k-line);
}

.standing {
  padding: 9px 10px;
  border: 1px solid var(--k-line);
  border-radius: 6px;
  background: var(--k-surface);
}

.standing .head {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.standing .v {
  font-size: 17px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}

.standing .pos {
  margin-left: auto;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--k-text-2);
}

.standing .pos b {
  font-size: 15px;
  font-weight: 700;
  color: var(--k-accent);
}

.standing .track {
  height: 4px;
  margin-top: 7px;
  border-radius: 2px;
  background: linear-gradient(to right, var(--k-accent) 0 var(--bar-w, 0%), var(--k-track) var(--bar-w, 0%) 100%);
}

.standing .ratio {
  margin-top: 4px;
  font-size: 11px;
  color: var(--k-text-3);
  font-variant-numeric: tabular-nums;
}

/* Only shown when a period narrows the ranking - the windowed rank and the
   all-time one answer different questions and must never be confused. */
.standing .alltime {
  margin-top: 5px;
  padding-top: 5px;
  border-top: 1px dashed var(--k-line);
  font-size: 11px;
  color: var(--k-text-3);
  font-variant-numeric: tabular-nums;
}

.standing .alltime b {
  color: var(--k-text-2);
  font-weight: 600;
}

.offlist {
  padding: 5px 8px;
  border-radius: 5px;
  background: var(--k-sunken);
  font-size: 11px;
  color: var(--k-text-3);
}

.sheetlabel {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.sheetlabel .tag {
  color: var(--k-text-3);
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.06em;
}

.sheetlabel .note {
  font-size: 10.5px;
  color: var(--k-text-3);
  margin-left: auto;
  font-variant-numeric: tabular-nums;
}

.ledger {
  width: 100%;
  border-collapse: collapse;
  font-size: 11.5px;
  background: var(--k-surface);
  border: 1px solid var(--k-line);
  border-radius: 6px;
  overflow: hidden;
}

.ledger tr.group th {
  background: var(--k-surface-2);
  border-bottom: 1px solid var(--k-line);
  padding: 3px 8px;
  font-size: 10.5px;
  letter-spacing: 0.06em;
  font-weight: 600;
  color: var(--k-text-3);
  text-align: left;
}

.ledger td {
  padding: 3px 8px;
  border-bottom: 1px solid var(--k-line);
  font-variant-numeric: tabular-nums;
  cursor: pointer;
}

.ledger tr:last-child td {
  border-bottom: 0;
}

.ledger td.m {
  color: var(--k-text-2);
  font-variant-numeric: normal;
}

.ledger td.v {
  text-align: right;
  white-space: nowrap;
  font-weight: 500;
}

.ledger td.p {
  text-align: right;
  white-space: nowrap;
  color: var(--k-text-3);
  width: 74px;
}

.ledger tr.on td {
  background: var(--k-accent-soft);
}

.ledger tr.on td.m {
  font-weight: 600;
  color: var(--k-text);
  box-shadow: inset 3px 0 0 var(--k-accent);
}

.ledger tr.on td.p {
  color: var(--k-text-2);
}
</style>
