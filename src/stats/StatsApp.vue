<script setup lang="ts">
import { ref } from 'vue';

import NavigationDrawer from '@/components/common/NavigationDrawer.vue';
import ThemeToggleButton from '@/components/common/ThemeToggleButton.vue';
import StatTable, { type StatDataType } from '@/components/stats/StatTable.vue';
import UpdateTime from '@/components/stats/UpdateTime.vue';

import { channelsUri, statsUri } from '@/config';
import { definePeriodicCall } from '@/lib/vue';
import { mergeArrayBy } from '@/lib/array';
import { type YouTubeStreamer, type YouTubeChannelStreamer, type YouTubeChannelStatsResponse } from '@/type/youtube';
import axios from '@/lib/axios';
import dayjs, { Dayjs } from '@/lib/dayjs';

const channels = ref<YouTubeChannelStreamer[]>([]);
const fetchedTime = ref<Dayjs>(dayjs(Number.NaN));
const tab = ref<StatDataType>('subscriber');
const drawer = ref<boolean>();
const errorSnackbar = ref<boolean>();

definePeriodicCall(
  async () => {
    errorSnackbar.value = false;
    const streamers = (await axios.get<YouTubeStreamer[]>(channelsUri)).data;
    const stats = (await axios.get<YouTubeChannelStatsResponse>(statsUri)).data;
    channels.value = mergeArrayBy('id', streamers, stats.data);

    fetchedTime.value = dayjs.unix(stats.fetched_at);
    return Math.max(Math.floor(600 - (dayjs().unix() - stats.fetched_at)) + 5, 30);
  },
  async (error) => {
    console.error(`Fetching error. Retrying in 10 minutes: ${error}`);
    errorSnackbar.value = true;
    return 600;
  },
);
</script>

<template>
  <v-app>
    <NavigationDrawer $opened="drawer" :channels />

    <v-main>
      <v-app-bar flat density="compact">
        <v-app-bar-nav-icon variant="text" @click.stop="drawer = !drawer" aria-label="ナビゲーションを表示" />
        <v-toolbar-title>けもV リアルタイム統計</v-toolbar-title>
        <template #append>
          <ThemeToggleButton />
        </template>
      </v-app-bar>

      <v-snackbar $="errorSnackbar" timeout="10000">
        データの読み込みができませんでした。しばらくしてから再読み込みしてください。
        <template #actions>
          <v-btn color="red-lighten-2" variant="text" @click="errorSnackbar = false">閉じる</v-btn>
        </template>
      </v-snackbar>

      <v-container>
        <v-row justify="center">
          <v-col cols="12" md="12" lg="10" xl="7" xxl="6">
            <v-tabs $="tab" color="primary" align-tabs="center" density="compact">
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

            <StatTable :channels :type="tab" />

            <v-card class="text-right px-4 py-2" variant="flat">
              <UpdateTime class="update-time" :time="fetchedTime" />
            </v-card>
          </v-col>
        </v-row>
      </v-container>

      <v-footer class="bg-secondary text-left d-flex flex-column mt-10">
        <ul>
          <li>およそ10分ごとに自動で更新されます。数値は減少することがあります</li>
          <li>総再生数と配信・動画数は配信終了後から反映されます</li>
          <li>このサイトは非公式のファンサイトです</li>
        </ul>
      </v-footer>
    </v-main>
  </v-app>
</template>
