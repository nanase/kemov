<script setup lang="ts">
import DifferenceValue from '@/components/stats/DifferenceValue.vue';
import { type YouTubeChannelStats, type YouTubeChannel } from '@/stats/types';

import { sum } from '@/lib/array';
import { withCommas } from '@/lib/number';

export type StatDataType = 'subscriber' | 'view' | 'video';
type Channel = YouTubeChannel & YouTubeChannelStats;

const { channels, type } = defineProps<{
  channels: readonly Channel[];
  type: StatDataType;
}>();

function getColumnName(): string {
  switch (type) {
    case 'subscriber':
      return 'チャンネル登録';
    case 'view':
      return '再生回数';
    case 'video':
      return '動画数';
  }
}

function getCount(channel: Channel): number {
  switch (type) {
    case 'subscriber':
      return channel.statistics.subscriberCount;
    case 'view':
      return channel.statistics.viewCount;
    case 'video':
      return channel.statistics.videoCount;
  }
}

function getCountPerHour(channel: Channel): number {
  switch (type) {
    case 'subscriber':
      return channel.statistics.subscriberCountPerHour;
    case 'view':
      return channel.statistics.viewCountPerHour;
    case 'video':
      return channel.statistics.videoCountPerHour;
  }
}

function getCountPerDay(channel: Channel): number {
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
</script>

<template>
  <v-table density="compact" hover>
    <thead>
      <tr>
        <th>&nbsp;</th>
        <th class="text-right font-weight-bold">{{ getColumnName() }}</th>
        <th class="text-right font-weight-bold">1時間</th>
        <th class="text-right font-weight-bold">24時間</th>
      </tr>
    </thead>
    <tbody>
      <tr class="channel text-right" v-for="channel in channels" :key="channel.id">
        <td>
          <v-list-item
            class="channel-name text-left px-0"
            :href="`https://www.youtube.com/${channel.customUrl}`"
            :ripple="false"
            :slim="true"
          >
            <template v-slot:title>
              <span class="channel-name-text">{{ channel.name }}</span>
            </template>
            <template v-slot:prepend>
              <v-avatar class="avatar" :color="channel.color.key" variant="outlined" size="small">
                <v-img :src="channel.thumbnails.default.url" />
              </v-avatar>
            </template>
          </v-list-item>
        </td>
        <td class="text-h6">{{ withCommas(getCount(channel)) }}</td>
        <DifferenceValue class="text-h6" :value="getCountPerHour(channel)" :strong="getStrong()" tag="td" />
        <DifferenceValue class="text-h6" :value="getCountPerDay(channel)" :strong="getStrong()" tag="td" />
      </tr>
    </tbody>
    <tfoot>
      <tr class="text-right text-h6">
        <td class="text-body-1 font-weight-bold">合計</td>
        <td>{{ withCommas(sum(channels, getCount)) }}</td>
        <DifferenceValue :value="sum(channels, getCountPerHour)" :strong="getStrong()" tag="td" />
        <DifferenceValue :value="sum(channels, getCountPerDay)" :strong="getStrong()" tag="td" />
      </tr>
    </tfoot>
  </v-table>
</template>

<style lang="scss">
.channel {
  .channel-name span {
    background-color: transparent;
  }

  .channel-name-text {
    font-family: 'IBM Plex Sans JP', sans-serif;
    font-size: 125%;
    font-weight: bold;
    font-stretch: condensed;
    transition: transform 0.3s;
    display: inline-block;
  }

  .avatar {
    border-width: 1.5px;
    transition: transform 0.3s;
  }

  &:hover {
    .channel-name-text {
      transform: translate(10px);
    }

    .avatar {
      transform: scale(1.5);
    }
  }
}
</style>
