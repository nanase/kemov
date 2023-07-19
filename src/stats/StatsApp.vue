<script setup lang="ts">
import { channelsUri, statsUri } from './config';
import { mergeArrayBy, sum } from '@/lib/array';
import { onMounted, onBeforeUnmount, ref } from 'vue';
import { type YouTubeChannelStat, type YouTubeChannel } from '@/types/youtube';
import { withCommas } from '@/lib/number';
import dayjs, { Dayjs } from 'dayjs';
import UpdateTime from '../components/stats/UpdateTime.vue';

const vtubers = ref<Array<YouTubeChannel & YouTubeChannelStat>>([]);
const fetchedTime = ref<Dayjs>(dayjs());
const fetchVtuberDataInterval = ref<number>();

async function fetchVtubersData() {
  const channels = (await (await fetch(channelsUri)).json()) as YouTubeChannel[];
  const stats = (await (await fetch(statsUri)).json()) as YouTubeChannelStat[];
  fetchedTime.value = dayjs();
  vtubers.value = mergeArrayBy('id', channels, stats);
}

onMounted(async () => {
  await fetchVtubersData();

  fetchVtuberDataInterval.value = setInterval(async () => {
    await fetchVtubersData();
  }, 600000);
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
      <div class="subscriberCount header">チャンネル登録</div>
      <div class="viewCount header">総再生回数</div>
      <div class="videoCount header">動画数</div>
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
      <div class="subscriberCount">{{ withCommas(vtuber.statistics.subscriberCount) }}</div>
      <div class="viewCount">{{ withCommas(vtuber.statistics.viewCount) }}</div>
      <div class="videoCount">{{ withCommas(vtuber.statistics.videoCount) }}</div>
    </div>
    <div class="vtuber total">
      <div class="avatar total"></div>
      <div class="name total">合計</div>
      <div class="subscriberCount total">{{ withCommas(sum(vtubers, (v) => v.statistics.subscriberCount)) }}</div>
      <div class="viewCount total">{{ withCommas(sum(vtubers, (v) => v.statistics.viewCount)) }}</div>
      <div class="videoCount total">{{ withCommas(sum(vtubers, (v) => v.statistics.videoCount)) }}</div>
    </div>
    <UpdateTime :time="fetchedTime"></UpdateTime>
  </div>
</template>

<style lang="scss">
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
}

.subscriberCount,
.viewCount,
.videoCount {
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
}

.videoCount {
  flex: 0.8;
}

@media screen and (width <= 840px) {
  .vtuber {
    padding: 2px;
    width: calc(100% - 4px);
  }

  .avatar {
    width: 32px;
    height: 32px;
    border: 2px solid;
  }

  .name {
    padding: 0 2px;
    font-weight: bold;
    font-size: 125%;
  }

  .subscriberCount,
  .viewCount,
  .videoCount {
    padding: 0 2px;
    font-size: 110%;
  }
}

@media screen and (width <= 520px) {
  .vtuber {
    padding: 2px;
    width: calc(100% - 4px);
  }

  .avatar {
    width: 24px;
    height: 24px;
    border: 2px solid;
  }

  .header {
    font-size: 100%;
  }

  .name {
    padding: 0 2px;
    font-weight: bold;
    font-size: 125%;
  }

  .subscriberCount,
  .viewCount,
  .videoCount {
    padding: 0 2px;
    font-size: 110%;
  }
}
</style>
