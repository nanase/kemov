<script setup lang="ts">
import { computed } from 'vue';

import MemberAvatar from '@/parts/MemberAvatar.vue';
import { formatCount } from '@/lib/numberFormat';

import type { Cumulative } from '../model';
import type { Channel } from '@/type/api';

/**
 * Who this is, and the six figures that only ever grow.
 *
 * A member who has finished is told apart by the dotted border round their
 * activity span and by nothing else (#136): not greyed out, not faded, not
 * moved. Their picture keeps the same ring in their own colour as everybody
 * else's.
 */
const { channel, totals, dark } = defineProps<{
  channel: Channel;
  totals: Cumulative;
  dark: boolean;
}>();

const span = computed(() =>
  channel.activityEndDate === null
    ? `${channel.activityStartDate} から`
    : `${channel.activityStartDate} → ${channel.activityEndDate}`,
);

const figures = computed(() => [
  {
    key: '登録者数',
    value: formatCount(totals.subscriberCount),
    unit: '',
    // The place for a history is kept open rather than filled with a flat
    // line: collection starts in 2026-10 (#125), and a chart of nothing would
    // say the count never moved.
    note: '推移の記録は 2026-10 から',
    pending: true,
  },
  { key: '総再生数', value: formatCount(totals.viewCount), unit: '', note: 'チャンネル全体', pending: false },
  {
    key: '活動日数',
    value: formatCount(totals.activityDays),
    unit: '日',
    note: span.value,
    pending: false,
  },
  {
    key: '総高評価数',
    value: formatCount(totals.likeCount),
    unit: '',
    note: `${formatCount(totals.likeRated)} / ${formatCount(totals.videoCount)} 本`,
    pending: false,
  },
  {
    key: '総コメント数',
    value: formatCount(totals.commentCount),
    unit: '',
    note: `${formatCount(totals.commentRated)} / ${formatCount(totals.videoCount)} 本`,
    pending: false,
  },
  {
    key: '公開中の本数',
    value: formatCount(totals.videoCount),
    unit: '本',
    note: `配信 ${totals.byKind.streaming} ・ 動画 ${totals.byKind.video} ・ ショート ${totals.byKind.shorts}`,
    pending: false,
  },
]);
</script>

<template>
  <div class="mv-panel">
    <div class="who">
      <div class="id">
        <MemberAvatar :src="channel.thumbnailUrl" :name="channel.name" :color="channel.color.key" :size="54" :dark />
        <div class="names">
          <div class="name">{{ channel.name }}</div>
          <div v-if="channel.globalname" class="global">{{ channel.globalname }}</div>
          <div>
            <span class="span mv-n" :class="{ ended: channel.activityEndDate !== null }">{{ span }}</span>
          </div>
          <div class="links">
            <a
              v-if="channel.customUrl"
              class="link"
              :href="`https://www.youtube.com/${channel.customUrl}`"
              target="_blank"
              rel="noopener"
              aria-label="YouTube"
              title="YouTube"
            >
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <rect
                  x="0.9"
                  y="2.6"
                  width="14.2"
                  height="10.8"
                  rx="3.2"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.5"
                />
                <path d="M6.6 5.6 L11.1 8 L6.6 10.4 Z" fill="currentColor" />
              </svg>
            </a>
            <a
              v-if="channel.twitter"
              class="link"
              :href="`https://x.com/${channel.twitter}`"
              target="_blank"
              rel="noopener"
              aria-label="X"
              title="X"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"
                />
              </svg>
            </a>
          </div>
        </div>
      </div>
      <dl class="totals">
        <div v-for="figure in figures" :key="figure.key" class="total">
          <dt>{{ figure.key }}</dt>
          <dd class="value mv-n">
            {{ figure.value }}<small v-if="figure.unit"> {{ figure.unit }}</small>
          </dd>
          <dd class="note mv-n" :class="{ pending: figure.pending }">{{ figure.note }}</dd>
        </div>
      </dl>
    </div>
  </div>
</template>

<style scoped>
.who {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 9px 12px;
}

.id {
  display: flex;
  flex: none;
  gap: 10px;
  align-items: center;
  width: 232px;
  min-width: 0;
}

.id :deep(.avatar) {
  width: 54px;
  height: 54px;
  box-shadow: 0 0 0 2px var(--mv-key);
}

.names {
  min-width: 0;
}

.name {
  overflow: hidden;
  font-size: 15px;
  font-weight: 700;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.global {
  overflow: hidden;
  color: var(--k-text-3);
  font-size: 10.5px;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.span {
  display: inline-block;
  color: var(--k-text-2);
  font-size: 11px;
  line-height: 1.4;
  white-space: nowrap;
}

/* The one mark that says a member has finished. Nothing else changes (#136). */
.span.ended {
  margin-left: -5px;
  padding: 0 5px;
  border: 1px dotted var(--k-line-2);
  border-radius: 3px;
}

.links {
  display: flex;
  gap: 6px;
  align-items: center;
  margin-top: 3px;
}

/* A link out. The member's colour is on the picture, not here. */
.link {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 21px;
  height: 21px;
  border: 1px solid var(--k-line);
  border-radius: 4px;
  background: var(--k-surface-2);
  color: var(--k-text-3);
}

.link:hover {
  border-color: var(--mv-key);
  color: var(--k-text);
}

.link svg {
  display: block;
  width: 12px;
  height: 12px;
}

.totals {
  display: grid;
  flex: 1 1 0;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 3px 0;
  min-width: 0;
  margin: 0;
}

.total {
  min-width: 0;
  padding: 0 10px;
  border-left: 1px solid var(--k-line);
}

.total dt {
  overflow: hidden;
  color: var(--k-text-3);
  font-size: 10.5px;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.total dd {
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.value {
  font-size: 16px;
  font-weight: 600;
  line-height: 1.45;
}

.value small {
  color: var(--k-text-3);
  font-size: 11px;
  font-weight: 400;
}

.note {
  color: var(--k-text-3);
  font-size: 10.5px;
  line-height: 1.3;
}

/* Not measured yet, rather than measured as nothing. */
.note.pending {
  display: inline-block;
  max-width: 100%;
  border-bottom: 1px dotted var(--k-line-2);
}

@container (max-width: 720px) {
  .who {
    flex-wrap: wrap;
    align-items: flex-start;
  }

  .id {
    flex: 1 1 100%;
    width: auto;
  }

  .totals {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .total:nth-child(odd) {
    padding-left: 0;
    border-left: 0;
  }
}
</style>
