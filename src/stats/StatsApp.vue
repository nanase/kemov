<script setup lang="ts">
import { channelsUri, statsUri } from './config';
import { mergeArrayBy, sum } from '@/lib/array';
import { onMounted, onBeforeUnmount, ref } from 'vue';
import { type YouTubeChannelStats, type YouTubeChannel, type YouTubeChannelStatsResponse } from '@/types/youtube';
import { withCommas } from '@/lib/number';
import dayjs, { Dayjs } from 'dayjs';
import UpdateTime from '../components/stats/UpdateTime.vue';

const vtubers = ref<Array<YouTubeChannel & YouTubeChannelStats>>([]);
const fetchedTime = ref<Dayjs>(dayjs(Number.NaN));
const fetchVtuberDataInterval = ref<number>();

async function fetchVtubersData() {
  try {
    const channels = (await (await fetch(channelsUri)).json()) as YouTubeChannel[];
    const stats = (await (await fetch(statsUri)).json()) as YouTubeChannelStatsResponse;
    vtubers.value = mergeArrayBy('id', channels, stats.data);
    fetchedTime.value = dayjs.unix(stats.fetched_at);
    const waitTime = Math.floor(600000 - (dayjs().unix() - stats.fetched_at) * 1000) + 5000;
    fetchVtuberDataInterval.value = setTimeout(fetchVtubersData, waitTime);
  } catch (ex) {
    console.error(`Fetching error. Retrying in 10 minutes: ${ex}`);
    fetchVtuberDataInterval.value = setTimeout(fetchVtubersData, 600000);
  }
}

onMounted(async () => {
  await fetchVtubersData();
});

onBeforeUnmount(() => {
  clearInterval(fetchVtuberDataInterval.value);
});
</script>

<template>
  <div class="vtuber-list">
    <div class="vtuber header">
      <div class="avatar header"></div>
      <div class="name header"></div>
      <div class="subscriber-count header">チャンネル登録</div>
      <div class="view-count header">総再生回数</div>
      <div class="video-count header">動画数</div>
    </div>
    <div class="vtuber" v-for="vtuber in vtubers" :key="vtuber.id">
      <a v-bind:href="`https://www.youtube.com/${vtuber.customUrl}`" target="_blank">
        <div
          class="avatar"
          v-bind:style="`background-image:url('${vtuber.thumbnails.medium.url}');  border-color: ${vtuber.color.key};`"
        ></div>
      </a>
      <div class="name">
        <a v-bind:href="`https://www.youtube.com/${vtuber.customUrl}`" target="_blank"> {{ vtuber.name }} </a>
      </div>
      <div class="subscriber-count">{{ withCommas(vtuber.statistics.subscriberCount) }}</div>
      <div class="view-count">{{ withCommas(vtuber.statistics.viewCount) }}</div>
      <div class="video-count">{{ withCommas(vtuber.statistics.videoCount) }}</div>
    </div>
    <div class="vtuber total">
      <div class="avatar total"></div>
      <div class="name total">合計</div>
      <div class="subscriber-count total">{{ withCommas(sum(vtubers, (v) => v.statistics.subscriberCount)) }}</div>
      <div class="view-count total">{{ withCommas(sum(vtubers, (v) => v.statistics.viewCount)) }}</div>
      <div class="video-count total">{{ withCommas(sum(vtubers, (v) => v.statistics.videoCount)) }}</div>
    </div>
    <UpdateTime :time="fetchedTime"></UpdateTime>
  </div>
</template>

<style lang="scss">
@use 'media.scss';

.vtuber-list {
  word-break: keep-all;
}

.vtuber {
  display: flex;
  align-items: center;
  padding: 5px;
  width: calc(100% - 10px);
  border-radius: 50px;

  &:hover:not(.header, .total) {
    transition: background-color 0.3s;
    background-color: #edf2f7;
  }

  &.header {
    align-items: baseline;
  }

  @include media.size(md) {
    padding: 2px;
    width: calc(100% - 4px);
  }
}

.avatar {
  width: 40px;
  height: 40px;
  background-position: center center;
  background-repeat: no-repeat;
  background-size: contain;
  border: 3px solid;
  border-radius: 50%;
  transition: transform 0.3s;

  &:hover {
    transform: scale(1.5);
  }

  &.total {
    visibility: hidden;
  }

  &.header {
    visibility: hidden;
    height: 0;
  }

  @include media.size(md) {
    width: 32px;
    height: 32px;
    border: 2px solid;
  }

  @include media.size(sm) {
    width: 24px;
    height: 24px;
  }
}

.name {
  padding: 0 5px;
  flex: 2;
  font-weight: bold;
  font-size: 150%;
  font-stretch: condensed;

  &.total,
  &.header {
    text-align: right;
    font-size: 100%;
  }

  > a {
    text-decoration: none;
    color: inherit;
  }

  @include media.size(md) {
    padding: 0 2px;
    font-weight: bold;
    font-size: 125%;
  }
}

.subscriber-count,
.view-count,
.video-count {
  padding: 0 5px;
  flex: 1;
  text-align: right;
  font-size: 125%;

  &.total,
  &.header {
    font-weight: bold;
  }

  &.header {
    font-size: 100%;
    white-space: nowrap;
  }

  @include media.size(md) {
    padding: 0 2px;
    font-size: 110%;
  }
}

.video-count {
  flex: 0.8;
}
</style>
