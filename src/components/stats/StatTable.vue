<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { useNow } from '@vueuse/core';
import { sum } from '@nanase/alnilam/array';
import { withCommas } from '@nanase/alnilam/number';
import dayjs from '@nanase/alnilam/dayjs';
import isBetween from 'dayjs/plugin/isBetween';
import type { YouTubeChannelStreamer } from '@/type/youtube';
import useStatsStore from '@/stats/store';

import DifferenceValue from '@/components/stats/DifferenceValue.vue';

dayjs.extend(isBetween);
const { channels, latestStreamings } = useStatsStore();

export type StatDataType = 'subscriber' | 'view' | 'video';

const { type, activeOnly } = defineProps<{
  type: StatDataType;
  activeOnly?: boolean;
}>();
const now = useNow({ interval: 5000 });

function getColumnName(): string {
  switch (type) {
    case 'subscriber':
      return '登録数';
    case 'view':
      return '再生数';
    case 'video':
      return '動画数';
  }
}

function getCount(channel: YouTubeChannelStreamer): number {
  switch (type) {
    case 'subscriber':
      return channel.statistics.subscriberCount;
    case 'view':
      return channel.statistics.viewCount;
    case 'video':
      return channel.statistics.videoCount;
  }
}

function getCountPerHour(channel: YouTubeChannelStreamer): number {
  switch (type) {
    case 'subscriber':
      return channel.statistics.subscriberCountPerHour;
    case 'view':
      return channel.statistics.viewCountPerHour;
    case 'video':
      return channel.statistics.videoCountPerHour;
  }
}

function getCountPerDay(channel: YouTubeChannelStreamer): number {
  switch (type) {
    case 'subscriber':
      return channel.statistics.subscriberCountPerDay;
    case 'view':
      return channel.statistics.viewCountPerDay;
    case 'video':
      return channel.statistics.videoCountPerDay;
  }
}

function getStrong(): number {
  switch (type) {
    case 'subscriber':
      return 100;
    case 'view':
      return 1000;
    case 'video':
      return 10;
  }
}

function getMaxSubscriberCount(x: number): number {
  if (x >= 1000) {
    return x + 10 ** (BigInt(x).toString().length - 3) - 1;
  } else {
    return x;
  }
}

function getAverageSubscriberCount(): number {
  const total = sum(channels.value, getCount);
  return Math.round(total + (sum(channels.value, (channel) => getMaxSubscriberCount(getCount(channel))) - total) / 2);
}

function getChannelVisibility(channel: YouTubeChannelStreamer): boolean {
  return activeOnly && typeof channel.activityEndDate === 'string' ? dayjs().isBefore(channel.activityEndDate) : true;
}

function hasLive(channelId: string): boolean {
  const latestStreaming = latestStreamings.value.find((streaming) => streaming.channelId === channelId);

  return (
    typeof latestStreaming !== 'undefined' &&
    latestStreaming.success &&
    latestStreaming.isLiveBroadcast === true &&
    dayjs(now.value).isAfter(latestStreaming.startedAt)
  );
}

function hasLiveToStartSoon(channelId: string): boolean {
  const latestStreaming = latestStreamings.value.find((streaming) => streaming.channelId === channelId);

  return (
    typeof latestStreaming !== 'undefined' &&
    latestStreaming.success &&
    latestStreaming.isLiveBroadcast === true &&
    dayjs(now.value).isBetween(latestStreaming.startedAt, dayjs(latestStreaming.startedAt).add(-1, 'hour'))
  );
}

function hasLiveBeforeStart(channelId: string): boolean {
  const latestStreaming = latestStreamings.value.find((streaming) => streaming.channelId === channelId);

  return (
    typeof latestStreaming !== 'undefined' &&
    latestStreaming.success &&
    latestStreaming.isLiveBroadcast === true &&
    dayjs(now.value).isBetween(latestStreaming.startedAt, dayjs(latestStreaming.startedAt).add(-3, 'hour'))
  );
}
</script>

<template>
  <v-table density="compact" hover>
    <thead v-if="channels.length !== 0">
      <tr>
        <th scope="col" class="pl-4 pr-2">&nbsp;</th>
        <th scope="col" class="px-2 text-right font-weight-bold">{{ getColumnName() }}</th>
        <th scope="col" class="px-2 text-right font-weight-bold" v-if="type === 'subscriber'">1時間</th>
        <th scope="col" class="pl-2 pr-4 text-right font-weight-bold">24時間</th>
      </tr>
    </thead>
    <tbody>
      <tr class="channel text-right" v-for="channel in channels.filter(getChannelVisibility)" :key="channel.id">
        <th scope="row" class="channel-name-head pl-4 pr-2">
          <v-list-item
            class="channel-name text-left px-0"
            :href="`https://www.youtube.com/${channel.customUrl}`"
            :ripple="false"
            slim
          >
            <template v-slot:title>
              <div class="channel-name-box">
                <span class="channel-name-text">{{ channel.name }}</span>
              </div>
            </template>
            <template v-slot:prepend>
              <div v-if="hasLive(channel.id)" class="live-badge has-live"></div>
              <div v-else-if="hasLiveToStartSoon(channel.id)" class="live-badge has-live-to-start-soon"></div>
              <div v-else-if="hasLiveBeforeStart(channel.id)" class="live-badge has-live-before-start"></div>
              <v-avatar class="avatar" :color="channel.color.key" variant="outlined" size="small">
                <v-img :src="channel.thumbnails.default.url" :alt="channel.fullname" />
              </v-avatar>
            </template>
          </v-list-item>
        </th>
        <td class="px-2 text-h6">{{ withCommas(getCount(channel)) }}</td>
        <DifferenceValue
          class="px-2 text-h6"
          :value="getCountPerHour(channel)"
          :strong="getStrong()"
          tag="td"
          v-if="type === 'subscriber'"
        />
        <DifferenceValue class="pl-2 pr-4 text-h6" :value="getCountPerDay(channel)" :strong="getStrong()" tag="td" />
      </tr>
      <tr v-if="channels.length === 0">
        <td colspan="4" class="pa-4 text-center">
          <v-progress-circular color="primary" indeterminate />
        </td>
      </tr>
    </tbody>
    <tfoot v-if="channels.length !== 0">
      <tr class="text-right text-h6">
        <th scope="row" class="pl-4 pr-2 text-right text-body-1 font-weight-bold">
          <v-dialog v-if="type === 'subscriber'" max-width="640">
            <template #activator="{ props }">
              <v-btn
                v-bind="props"
                icon="mdi-information-outline"
                variant="plain"
                density="compact"
                aria-label="チャンネル登録者数について"
              />
            </template>

            <template #default="{ isActive }">
              <v-card title="チャンネル登録者数について">
                <v-card-text>
                  <p>
                    YouTube の制約により、チャンネル登録者数の正確な数値はチャンネルの所有者のみに開示されます。
                    それ以外の利用者には数値の上位3桁のみが開示されます。
                  </p>
                  <p>
                    したがって、このサイトで表示している数値は上位3桁のみの最小値であり、正確な数値はこれ以上となります。
                    下記の数値は合計値の参考としてお考えください。
                  </p>
                </v-card-text>
                <v-card-text>
                  <v-timeline class="text-center" direction="horizontal" side="end" size="small" density="compact">
                    <v-timeline-item icon="mdi-flag-checkered" dot-color="green">
                      <div class="mt-n4">
                        <p>{{ withCommas(sum(channels, getCount)) }}</p>
                        <div class="font-weight-bold text-body-2">最小値</div>
                      </div>
                    </v-timeline-item>

                    <v-timeline-item icon="mdi-flag-checkered" dot-color="orange-darken-1">
                      <div class="mt-n4">
                        <p>{{ withCommas(getAverageSubscriberCount()) }}</p>
                        <div class="font-weight-bold text-body-2">平均値</div>
                      </div>
                    </v-timeline-item>

                    <v-timeline-item icon="mdi-flag-checkered" dot-color="red">
                      <div class="mt-n4">
                        <p>{{ withCommas(sum(channels, (channel) => getMaxSubscriberCount(getCount(channel)))) }}</p>
                        <div class="font-weight-bold text-body-2">最大値</div>
                      </div>
                    </v-timeline-item>
                  </v-timeline>
                </v-card-text>
                <v-card-actions>
                  <v-spacer />

                  <v-btn text="閉じる" @click="isActive.value = false" />
                </v-card-actions>
              </v-card>
            </template>
          </v-dialog>
          合計
        </th>
        <td class="px-2">{{ withCommas(sum(channels, getCount)) }}</td>
        <DifferenceValue
          class="px-2"
          :value="sum(channels, getCountPerHour)"
          :strong="getStrong()"
          tag="td"
          v-if="type === 'subscriber'"
        />
        <DifferenceValue class="pl-2 pr-4" :value="sum(channels, getCountPerDay)" :strong="getStrong()" tag="td" />
      </tr>
    </tfoot>
  </v-table>
</template>

<style lang="scss">
.v-table {
  th {
    white-space: nowrap;
  }

  table > tbody {
    > tr > th {
      position: relative;
    }

    > tr:hover > th::after {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      /* stylelint-disable-next-line color-function-notation */
      background: rgba(var(--v-border-color), var(--v-hover-opacity));
      pointer-events: none;
    }
  }
}

.channel {
  .channel-name span {
    background-color: transparent;
  }

  .channel-name-box {
    transition: transform 0.3s;
  }

  .channel-name-text {
    font-family: 'IBM Plex Sans JP', sans-serif;
    font-size: 125%;
    font-weight: bold;
    font-stretch: condensed;
    display: inline-block;
  }

  .live-badge {
    display: inline-block;
    position: absolute;
    z-index: 1;
    transition: transform 0.3s;
  }

  .has-live {
    color: white;
    font-size: 60%;
    background: red;
    border: 1px solid red;
    border-radius: 2px;
    padding: 0 2px;
    margin: auto 4px;
    left: 16px;
    top: 24px;

    &::before {
      content: 'LIVE';
    }
  }

  .has-live-to-start-soon {
    background: #ffb60c;
    border: 2px solid rgb(var(--v-theme-surface));
    border-radius: 100%;
    left: 23px;
    top: 26px;
    width: 12px;
    height: 12px;
  }

  .has-live-before-start {
    background: #1bb145;
    border: 2px solid rgb(var(--v-theme-surface));
    border-radius: 100%;
    left: 23px;
    top: 26px;
    width: 12px;
    height: 12px;
  }

  .avatar {
    border-width: 1.5px;
    transition: transform 0.3s;
  }

  &:hover {
    .channel-name-box,
    .live-badge {
      transform: translate(10px);
    }

    .avatar {
      transform: scale(1.5);
    }
  }
}
</style>
