<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue';

import ThemeToggleButton from '@/components/common/ThemeToggleButton.vue';
import StatTable, { type StatDataType } from '@/components/stats/StatTable.vue';
import UpdateTime from '../components/stats/UpdateTime.vue';
import { type YouTubeChannelStats, type YouTubeChannel, type YouTubeChannelStatsResponse } from './types';

import { channelsUri, statsUri } from './config';
import { mergeArrayBy } from '@/lib/array';

import axios from 'axios';
import axiosRetry from 'axios-retry';
import dayjs, { Dayjs } from 'dayjs';

const vtubers = ref<Array<YouTubeChannel & YouTubeChannelStats>>([]);
const fetchedTime = ref<Dayjs>(dayjs(Number.NaN));
const fetchVtuberDataInterval = ref<number>();
const tab = ref<StatDataType>('subscriber');
const drawer = ref<boolean>();
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
  <v-app>
    <v-navigation-drawer class="bg-background" v-model="drawer" floating>
      <v-list class="pb-0 d-flex flex-column fill-height">
        <v-list-item link title="リアルタイム統計" href="/kemov/stats/">
          <template v-slot:prepend>
            <v-icon icon="mdi-finance" size="large" />
          </template>
        </v-list-item>

        <v-list nav link active-class="bg-primary" density="compact" class="flex-grow-1 flex-shrink-1 overflow-auto">
          <v-list-item
            v-for="channel in vtubers"
            :key="channel.id"
            :title="channel.name"
            :subtitle="channel.globalname"
            :href="`./detail/#/${channel.id}`"
          >
            <template v-slot:prepend>
              <v-avatar :color="channel.color.key" variant="outlined" size="small">
                <v-img :src="channel.thumbnails.default.url" />
              </v-avatar>
            </template>
          </v-list-item>
        </v-list>

        <v-divider />
        <v-list density="compact" link nav class="flex-grow-0 flex-shrink-0">
          <v-list-item title="ジェネット楽曲一覧" href="/kemov/genet/music/" prepend-icon="mdi-music">
            <template v-slot:prepend>
              <v-icon icon="mdi-music" size="small" />
            </template>
          </v-list-item>
        </v-list>
      </v-list>
    </v-navigation-drawer>

    <v-main>
      <v-app-bar flat density="compact">
        <v-app-bar-nav-icon variant="text" @click.stop="drawer = !drawer"></v-app-bar-nav-icon>
        <v-toolbar-title>けもV リアルタイム統計</v-toolbar-title>
        <template v-slot:append>
          <ThemeToggleButton />
        </template>
      </v-app-bar>

      <v-container>
        <v-row justify="center">
          <v-col cols="12" md="12" lg="10" xl="7" xxl="6">
            <v-tabs v-model="tab" color="primary" align-tabs="center" density="compact">
              <v-tab value="subscriber">
                <v-icon start>mdi-account-check</v-icon>
                <span class="font-weight-bold">チャンネル登録者数</span>
              </v-tab>
              <v-tab value="view">
                <v-icon start>mdi-play</v-icon>
                <span class="font-weight-bold">総再生数</span>
              </v-tab>
              <v-tab value="video">
                <v-icon start>mdi-video</v-icon>
                <span class="font-weight-bold">配信・動画数</span>
              </v-tab>
            </v-tabs>

            <StatTable :channels="vtubers" :type="tab" />

            <v-card class="text-right px-4 py-2" variant="flat">
              <UpdateTime class="update-time" :time="fetchedTime" />
            </v-card>
          </v-col>
        </v-row>
      </v-container>

      <v-footer class="bg-secondary text-left d-flex flex-column mt-10">
        <ul>
          <li>およそ10分ごとに自動で更新されます。数値は減少することがあります</li>
          <li>総再生回数と動画数は配信終了後から反映されます</li>
          <li>このサイトは非公式です。内容についてのお問い合わせはご遠慮ください</li>
        </ul>
      </v-footer>
    </v-main>
  </v-app>
</template>
