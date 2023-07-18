<script setup lang="ts">
import { channelsUri, statsUri } from './config';
import { mergeArrayBy, sum } from '@/lib/array';
import { onMounted, ref } from 'vue';
import { type YouTubeChannelStat, type YouTubeChannel } from '@/types/youtube';
import { withCommas } from '@/lib/number';
import dayjs, { Dayjs } from 'dayjs';

const vtubers = ref<Array<YouTubeChannel & YouTubeChannelStat>>([]);
const elapsedTime = ref<number>(0);
const fetchedTime = ref<Dayjs>(dayjs());

function readableElapsedTime() {
  if (elapsedTime.value >= 60) {
    return `${Math.floor(elapsedTime.value / 60)}分`;
  } else {
    return `${elapsedTime.value}秒`;
  }
}

async function fetchVtubersData() {
  const channels = (await (await fetch(channelsUri)).json()) as YouTubeChannel[];
  const stats = (await (await fetch(statsUri)).json()) as YouTubeChannelStat[];
  fetchedTime.value = dayjs();
  vtubers.value = mergeArrayBy('id', channels, stats);
}

onMounted(async () => {
  await fetchVtubersData();

  setInterval(async () => {
    await fetchVtubersData();
  }, 600000);

  setInterval(() => {
    elapsedTime.value = dayjs().diff(fetchedTime.value, 's');
  }, 1000);
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
    <div class="update">
      {{ `最終更新: ${fetchedTime.format('HH:mm:ss')} (${readableElapsedTime()}前)` }}
    </div>
    <div class="horizon"></div>
    <div class="note">
      <ul>
        <li>10分ごとに自動で更新されます。数値は減少することがあります</li>
        <li>総再生回数と動画数は配信終了後に反映されます</li>
        <li>このページは非公式です。内容についてのお問い合わせはご遠慮ください</li>
      </ul>
    </div>
  </div>
</template>

<style>
.vtuber-list {
  width: 85%;
  margin: 20px auto;
  padding: 15px 35px;
  background-color: white;
  border-radius: 10px;
  word-break: keep-all;
}

.vtuber {
  display: flex;
  align-items: center;
  padding: 5px;
  width: calc(100% - 10px);
  border-radius: 50px;
}
.vtuber:hover:not(.header, .total) {
  transition: background-color 0.3s;
  /* transition: color 0.3s; */
  background-color: #edf2f7;
  /* color: white; */
}
.vtuber.header {
  align-items: baseline;
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
}
.avatar:hover {
  transform: scale(1.5);
}
.avatar.total {
  visibility: hidden;
}
.avatar.header {
  visibility: hidden;
  height: 0;
}

.name {
  padding: 0 5px;
  flex: 2;
  font-weight: bold;
  font-size: 150%;
  font-stretch: condensed;
}
.name.total,
.name.header {
  text-align: right;
  font-size: 100%;
}
.name > a {
  text-decoration: none;
  color: inherit;
}

.subscriberCount {
  padding: 0 5px;
  flex: 1;
  text-align: right;
  font-size: 125%;
}
.subscriberCount.total,
.subscriberCount.header {
  font-weight: bold;
}
.subscriberCount.header {
  font-size: 100%;
  white-space: nowrap;
}

.viewCount {
  padding: 0 5px;
  flex: 1;
  text-align: right;
  font-size: 125%;
}
.viewCount.total,
.viewCount.header {
  font-weight: bold;
}
.viewCount.header {
  font-size: 100%;
  white-space: nowrap;
}

.videoCount {
  padding: 0 5px;
  flex: 0.8;
  text-align: right;
  font-size: 125%;
}
.videoCount.total,
.videoCount.header {
  font-weight: bold;
}
.videoCount.header {
  font-size: 100%;
  white-space: nowrap;
}

.horizon {
  display: block;
  height: 1px;
  width: 100%;
  margin: 2em auto;
  background-color: #ebf0f5;
}

.note ul {
  padding-inline-start: 20px;
}

@media screen and (min-width: 1035px) {
  .vtuber-list {
    width: 900px;
  }
}
@media screen and (max-width: 840px) {
  .vtuber-list {
    width: 85%;
  }
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
  .subscriberCount {
    padding: 0 2px;
    font-size: 110%;
  }
  .viewCount {
    padding: 0 2px;
    font-size: 110%;
  }
  .videoCount {
    padding: 0 2px;
    font-size: 110%;
  }
}
@media screen and (max-width: 520px) {
  .vtuber-list {
    width: 90%;
    padding: 15px 15px;
  }
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
  .subscriberCount {
    padding: 0 2px;
    font-size: 110%;
  }
  .viewCount {
    padding: 0 2px;
    font-size: 110%;
  }
  .videoCount {
    padding: 0 2px;
    font-size: 110%;
  }
}
</style>
