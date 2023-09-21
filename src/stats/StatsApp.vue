<script setup lang="ts">
import { channelsUri, statsUri } from './config';
import { mergeArrayBy, sum } from '@/lib/array';
import { onMounted, onBeforeUnmount, ref } from 'vue';
import { type YouTubeChannelStats, type YouTubeChannel, type YouTubeChannelStatsResponse } from './types';
import { withCommas } from '@/lib/number';
import { url } from '@/lib/style';
import dayjs, { Dayjs } from 'dayjs';
import UpdateTime from '../components/stats/UpdateTime.vue';
import axios from 'axios';
import axiosRetry from 'axios-retry';

const vtubers = ref<Array<YouTubeChannel & YouTubeChannelStats>>([]);
const fetchedTime = ref<Dayjs>(dayjs(Number.NaN));
const fetchVtuberDataInterval = ref<number>();
let channels: YouTubeChannel[];

axiosRetry(axios, { retries: 3, retryDelay: axiosRetry.exponentialDelay });

async function fetchVtubersData() {
  try {
    const stats = (await axios.get<YouTubeChannelStatsResponse>(statsUri)).data;
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
  channels = (await axios.get<YouTubeChannel[]>(channelsUri)).data;
  await fetchVtubersData();
});

onBeforeUnmount(() => {
  clearInterval(fetchVtuberDataInterval.value);
});
</script>

<template>
  <div class="stats-app">
    <h1>けもV リアルタイム統計</h1>
    <div class="content">
      <div class="vtuber-list">
        <div class="vtuber header">
          <div class="header avatar"></div>
          <div class="header name"></div>
          <div class="header subscriber-count">チャンネル登録</div>
          <div class="header view-count">総再生回数</div>
          <div class="header video-count">動画数</div>
        </div>
        <div class="vtuber" v-for="vtuber in vtubers" :key="vtuber.id">
          <a
            class="avatar"
            :style="{ backgroundImage: url(vtuber.thumbnails.medium.url), borderColor: vtuber.color.key }"
            :href="`https://www.youtube.com/${vtuber.customUrl}`"
            target="_blank"
            :title="vtuber.name"
          >
          </a>
          <a class="name" :href="`https://www.youtube.com/${vtuber.customUrl}`" target="_blank" :title="vtuber.name">
            {{ vtuber.name }}
          </a>
          <div class="subscriber-count">{{ withCommas(vtuber.statistics.subscriberCount) }}</div>
          <div class="view-count">{{ withCommas(vtuber.statistics.viewCount) }}</div>
          <div class="video-count">{{ withCommas(vtuber.statistics.videoCount) }}</div>
        </div>
        <div class="vtuber total">
          <div class="total avatar"></div>
          <div class="total name">合計</div>
          <div class="total subscriber-count">{{ withCommas(sum(vtubers, (v) => v.statistics.subscriberCount)) }}</div>
          <div class="total view-count">{{ withCommas(sum(vtubers, (v) => v.statistics.viewCount)) }}</div>
          <div class="total video-count">{{ withCommas(sum(vtubers, (v) => v.statistics.videoCount)) }}</div>
        </div>
        <UpdateTime class="update-time" :time="fetchedTime" />
      </div>
      <div class="horizon"></div>
      <div class="note">
        <ul>
          <li>およそ10分ごとに自動で更新されます。数値は減少することがあります</li>
          <li>総再生回数と動画数は配信終了後から反映されます</li>
          <li>このサイトは非公式です。内容についてのお問い合わせはご遠慮ください</li>
        </ul>
      </div>
    </div>
  </div>
</template>

<style lang="scss">
@use '@/style/media.scss';

.stats-app {
  h1 {
    margin: 1em auto;
    width: 90%;
    text-align: center;
    font-size: 200%;

    @include media.size(md) {
      font-size: 150%;
    }
  }

  .content {
    width: 85%;
    margin: 20px auto;
    padding: 15px 35px;
    background-color: white;
    border-radius: 10px;

    @include media.size(lg) {
      width: 815px;
    }

    @include media.size(md) {
      width: 85%;
    }

    @include media.size(sm) {
      width: 90%;
      padding: 15px;
    }
  }

  .vtuber-list {
    word-break: keep-all;
  }

  .vtuber {
    display: flex;
    align-items: center;
    padding: 5px 0;
    width: 100%;
    border-radius: 50px;

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
    color: inherit;
    padding: 0 5px;
    flex: 2;
    font-weight: bold;
    font-size: 150%;
    font-stretch: condensed;
    text-decoration: none;
    transition: transform 0.3s;

    &.total,
    &.header {
      text-align: right;
      font-size: 100%;
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
    padding-left: 5px;
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
      padding-left: 2px;
      font-size: 110%;
    }
  }

  .video-count {
    flex: 0.8;
  }

  /* transition */
  .vtuber:hover:not(.header, .total) {
    background-color: #edf2f7;

    .avatar {
      transform: scale(1.5);
    }

    .name {
      transform: translate(10px);
    }
  }

  .update-time {
    text-align: right;
    margin-top: 0.5em;
  }

  .horizon {
    display: block;
    height: 1px;
    width: 100%;
    margin: 1.5em auto;
    background-color: #ebf0f5;
  }

  .note ul {
    padding-inline-start: 20px;
  }
}
</style>
