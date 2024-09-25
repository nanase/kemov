<script setup lang="ts">
import { ref, provide } from 'vue';
import { useStorage, useIntervalFn } from '@vueuse/core';

import AppBase from '@/components/common/AppBase.vue';
import StatTable, { type StatDataType } from '@/components/stats/StatTable.vue';
import UpdateTime from '@/components/stats/UpdateTime.vue';

import { channelsUri, statsUri } from '@/config';
import { mergeArrayBy } from '@nanase/alnilam/array';
import dayjs, { Dayjs } from '@nanase/alnilam/dayjs';
import { type YouTubeStreamer, type YouTubeChannelStreamer, type YouTubeChannelStatsResponse } from '@/type/youtube';
import axios from '@/lib/axios';

const appBase = ref<InstanceType<typeof AppBase>>();
const channels = ref<YouTubeChannelStreamer[]>([]);
const fetchedTime = ref<Dayjs>(dayjs(Number.NaN));
const tab = ref<StatDataType>('subscriber');
const activeOnly = useStorage<boolean>('kemov/stats/activeOnly', false);
const fetchInterval = ref<number>(0);

provide('streamerChannels', channels);

useIntervalFn(async () => {
  try {
    appBase.value?.closeErrorSnackbar();
    const streamers = (await axios.get<YouTubeStreamer[]>(channelsUri)).data;
    const stats = (await axios.get<YouTubeChannelStatsResponse>(statsUri)).data;
    channels.value = mergeArrayBy('id', streamers, stats.data);

    fetchedTime.value = dayjs.unix(stats.fetched_at);
    fetchInterval.value = Math.max(Math.floor(600 - (dayjs().unix() - stats.fetched_at)) + 5, 30) * 1000;
  } catch (error) {
    console.error(`Fetching error. Retrying in 10 minutes: ${error}`);
    appBase.value?.showErrorSnackbar();
    fetchInterval.value = 600 * 1000;
  }
});
</script>

<template>
  <AppBase ref="appBase" page-id="stats" toolbar-title="けもV リアルタイム統計">
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

        <StatTable :channels :type="tab" :active-only />

        <v-card class="text-right px-4 py-2" variant="flat">
          <UpdateTime class="update-time" :time="fetchedTime" />
        </v-card>
      </v-col>
    </v-row>

    <v-row>
      <v-col>
        <v-checkbox v-model="activeOnly" class="active-only" label="活動中の配信者のみ表示" hide-details />
      </v-col>
    </v-row>

    <template #footer>
      <v-footer class="bg-secondary text-left d-flex flex-column mt-10">
        <ul>
          <li>およそ10分ごとに自動で更新されます。数値は減少することがあります</li>
          <li>総再生数と配信・動画数は配信終了後から反映されます</li>
          <li>このサイトは非公式のファンサイトです</li>
        </ul>
      </v-footer>
    </template>
  </AppBase>
</template>

<style lang="scss" scoped>
.active-only :deep(.v-checkbox-btn) {
  justify-content: center;
}
</style>
