<script setup lang="ts">
import { computed, ref } from 'vue';
import { computedAsync } from '@vueuse/core';
import axios from 'axios';
import axiosRetry from 'axios-retry';
import dayjs from 'dayjs';

import { mergeArrayBy, sum } from '@/lib/array';
import { withCommas } from '@/lib/number';
import { channelsUri, videoUri, statsUri } from '../config';
import { type Video, parse as parseAsVideo } from './types';
import { type YouTubeChannelStreamer, type YouTubeChannelStatsResponse } from '../../stats/types';
import type { VideoType } from '@/stats/detail/types';

import ThemeToggleButton from '@/components/common/ThemeToggleButton.vue';
import VideoRanking, { type Sorting, type TargetProperty } from '@/components/stats/detail/VideoRanking.vue';

axiosRetry(axios, { retries: 3, retryDelay: axiosRetry.exponentialDelay });

const { channelId } = defineProps<{
  channelId: string;
}>();

//
const stats = computedAsync(async () => (await axios.get<YouTubeChannelStatsResponse>(statsUri)).data.data, []);
const channels = computedAsync<readonly YouTubeChannelStreamer[]>(async () =>
  mergeArrayBy('id', (await axios.get<YouTubeChannelStreamer[]>(channelsUri)).data, stats.value),
);
const channel = computed(() => channels.value.find((c) => c.id === channelId));
const videos = computedAsync(async () => {
  if (channel.value != null) {
    return (
      await axios.get<readonly Video[]>(videoUri(channel.value.id), { transformResponse: parseAsVideo })
    ).data.filter((v) => v.availability === 'public');
  } else {
    return [];
  }
}, []);
const realtimeStats = computedAsync(async () => stats.value.find((channel) => channel.id === channelId)?.statistics);

////
const activityDays = computed(() =>
  dayjs(channel?.value?.activityEndDate ?? undefined).diff(dayjs(channel?.value?.activityStartDate), 'days', true),
);

const drawer = ref<boolean>();
const targetProperty = ref<TargetProperty>('viewCount');
const filterType = ref<VideoType[]>(['video', 'streaming', 'shorts']);
const sorting = ref<Sorting>('descending');
</script>

<template>
  <v-navigation-drawer class="bg-background" v-model="drawer" floating>
    <v-list class="pb-0 d-flex flex-column fill-height">
      <v-list-item link title="リアルタイム統計" href="/kemov/stats/">
        <template v-slot:prepend>
          <v-icon icon="mdi-finance" size="large" />
        </template>
      </v-list-item>

      <v-list nav link active-class="bg-primary" density="compact" class="flex-grow-1 flex-shrink-1 overflow-auto">
        <v-list-item
          v-for="channel in channels"
          :key="channel.id"
          :title="channel.name"
          :subtitle="channel.globalname"
          :href="`./#/${channel.id}`"
          :active="channelId === channel.id"
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
      <v-toolbar-title>{{ channel?.fullname }}</v-toolbar-title>
      <template v-slot:append>
        <ThemeToggleButton />
      </template>
    </v-app-bar>

    <v-container>
      <v-row class="ma-0">
        <v-col cols="6" sm="4" class="pa-1">
          <v-card color="red" variant="flat" class="summary-card">
            <v-card-text class="pa-2 text-subtitle-2">
              <v-icon icon="mdi-check" />
              チャンネル登録者
            </v-card-text>
            <v-card-text class="pa-2 mt-n3 text-h5 text-right">
              {{ withCommas(realtimeStats?.subscriberCount) }}
              <span class="text-subtitle-2">&nbsp;</span>
            </v-card-text>
            <v-card-text class="pa-2 pt-0 mt-n2 text-subtitle-2 text-right">
              1日あたり
              <span class="pr-2 pt-0 mt-n2 text-h6 text-right">
                +{{ ((realtimeStats?.subscriberCount ?? 0) / activityDays).toFixed(1) }}
              </span>
              <span class="text-subtitle-2">&nbsp;</span>
            </v-card-text>
          </v-card>
        </v-col>
        <v-col cols="6" sm="4" class="pa-1">
          <v-card color="green" variant="flat" class="summary-card">
            <v-card-text class="pa-2 text-subtitle-2">
              <v-icon icon="mdi-video"></v-icon>
              公開中の配信・動画
            </v-card-text>
            <v-card-text class="py-2 mt-n3 text-h5 text-right">
              {{ withCommas(videos.length) }}
              <span class="text-subtitle-2">個</span>
            </v-card-text>
            <v-card-text class="py-2 pt-0 mt-n2 text-subtitle-2 text-right">
              <span class="pr-1 pt-0 mt-n2 text-h6 text-right">
                {{ (activityDays / videos.length).toFixed(2) }}
              </span>
              <span class="text-subtitle-2">日に1回</span>
            </v-card-text>
          </v-card>
        </v-col>
        <v-col cols="6" sm="4" class="pa-1">
          <v-card color="teal" variant="flat" class="summary-card">
            <v-card-text class="pa-2 text-subtitle-2">
              <v-icon icon="mdi-calendar-clock"></v-icon>
              配信活動日数
            </v-card-text>
            <v-card-text class="py-2 mt-n3 text-h5 text-right">
              {{ withCommas(Math.floor(activityDays)) }}
              <span class="text-subtitle-2">日</span>
            </v-card-text>
            <v-card-text class="py-2 pt-0 mt-n2 text-subtitle-2 text-right">
              <span class="pt-0 mt-n2 text-h6 text-right">
                {{ channel?.activityStartDate }}
              </span>
              開始
            </v-card-text>
          </v-card>
        </v-col>
        <v-col cols="6" sm="4" class="pa-1">
          <v-card color="indigo" variant="flat" class="summary-card">
            <v-card-text class="pa-2 text-subtitle-2">
              <v-icon icon="mdi-play"></v-icon>
              総再生数
            </v-card-text>
            <v-card-text class="py-2 mt-n3 text-h5 text-right">
              {{ withCommas(sum(videos, (v) => v.viewCount ?? 0)) }}
              <span class="text-subtitle-2">回</span>
            </v-card-text>
            <v-card-text class="py-2 pt-0 mt-n2 text-subtitle-2 text-right">
              1配信あたり
              <span class="pr-2 pt-0 mt-n2 text-h6 text-right">
                {{ withCommas(Math.floor(sum(videos, (v) => v.viewCount ?? 0) / videos.length)) }}
              </span>
              <span class="text-subtitle-2">回</span>
            </v-card-text>
          </v-card>
        </v-col>
        <v-col cols="6" sm="4" class="pa-1">
          <v-card color="orange-darken-1" variant="flat" class="summary-card">
            <v-card-text class="pa-2 text-subtitle-2">
              <v-icon icon="mdi-thumb-up"></v-icon>
              総高評価数
            </v-card-text>
            <v-card-text class="pa-2 mt-n3 text-h5 text-right">
              {{ withCommas(sum(videos, (v) => v.likeCount ?? 0)) }}
              <span class="text-subtitle-2">&nbsp;</span>
            </v-card-text>
            <v-card-text class="pa-2 pt-0 mt-n2 text-subtitle-2 text-right">
              1配信あたり
              <span class="pr-2 pt-0 mt-n2 text-h6 text-right">
                {{ (sum(videos, (v) => v.likeCount ?? 0) / videos.length).toFixed(1) }}
              </span>
              <span class="text-subtitle-2">&nbsp;</span>
            </v-card-text>
          </v-card>
        </v-col>
        <v-col cols="6" sm="4" class="pa-1">
          <v-card color="deep-purple" variant="flat" class="summary-card">
            <v-card-text class="pa-2 text-subtitle-2">
              <v-icon icon="mdi-comment"></v-icon>
              総コメント数
            </v-card-text>
            <v-card-text class="py-2 mt-n3 text-h5 text-right">
              {{ withCommas(sum(videos, (v) => v.commentCount ?? 0)) }}
              <span class="text-subtitle-2">個</span>
            </v-card-text>
            <v-card-text class="py-2 pt-0 mt-n2 text-subtitle-2 text-right">
              1配信あたり
              <span class="pr-2 pt-0 mt-n2 text-h6 text-right">
                {{ (sum(videos, (v) => v.commentCount ?? 0) / videos.length).toFixed(1) }}
              </span>
              <span class="text-subtitle-2">個</span>
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>

      <v-container class="pa-1 mt-4">
        <v-card>
          <v-tabs v-model="targetProperty" bg-color="primary" center-active show-arrows>
            <v-tab value="viewCount">再生数</v-tab>
            <v-tab value="likeCount">高評価数</v-tab>
            <v-tab value="commentCount">コメント数</v-tab>
            <v-tab value="chatMessageCount">チャット数</v-tab>
            <v-tab value="chatUniqueUserCount">チャットユーザ数</v-tab>
            <v-tab value="chatMessageCountPerUniqueUser">ユーザあたりチャット数</v-tab>
            <v-tab value="duration">再生時間</v-tab>
            <v-tab value="viewCountPerSecond">時間あたり再生数</v-tab>
            <v-tab value="likeCountPerSecond">時間あたり高評価数</v-tab>
            <v-tab value="commentCountPerSecond">時間あたりコメント数</v-tab>
            <v-tab value="chatMessageCountPerSecond">時間あたりチャット数</v-tab>
          </v-tabs>
          <v-btn-toggle v-model="filterType" multiple divided color="secondary">
            <v-card-text>対象</v-card-text>
            <v-btn prepend-icon="mdi-microphone" value="streaming">配信</v-btn>
            <v-btn prepend-icon="mdi-video" value="video">動画</v-btn>
            <v-btn prepend-icon="mdi-cellphone-play" value="shorts">ショート</v-btn>
          </v-btn-toggle>
          <v-btn-toggle v-model="sorting" class="ml-2" divided color="secondary" mandatory>
            <v-btn icon="mdi-sort-descending" value="descending"></v-btn>
            <v-btn icon="mdi-sort-ascending" value="ascending"></v-btn>
          </v-btn-toggle>
          <v-card flat>
            <VideoRanking
              :data="videos"
              :sorting="sorting"
              :filter-type="filterType"
              :target-property="targetProperty"
              :max-number="30"
            ></VideoRanking>
          </v-card>
        </v-card>
      </v-container>
    </v-container>
    <v-footer class="bg-primary text-center d-flex flex-column mt-10">このサイトは非公式のファンサイトです</v-footer>
  </v-main>
</template>

<style scoped lang="scss">
.summary-card {
  background: linear-gradient(#ffffff30, #00000010);
}
</style>
