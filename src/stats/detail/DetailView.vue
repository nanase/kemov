<script setup lang="ts">
import { computed, ref, onMounted } from 'vue';
import { computedAsync } from '@vueuse/core';

import NavigationDrawer from '@/components/common/NavigationDrawer.vue';
import ThemeToggleButton from '@/components/common/ThemeToggleButton.vue';
import VideoRanking from '@/components/stats/detail/VideoRanking.vue';

import { channelsUri, videoUri, statsUri } from '@/config';
import { mergeArrayBy, sum } from '@/lib/array';
import { type SortOrder } from '@/lib/sort';
import { type Video, parse as parseAsVideo, type VideoProperty } from '@/type/video';
import { type YouTubeChannelStreamer, type YouTubeChannelStatsResponse, type YouTubeChannel } from '@/type/youtube';
import { withCommas } from '@/lib/number';
import axios from '@/lib/axios';
import dayjs from '@/lib/dayjs';
import type { VideoType } from '@/type/video';

const { channelId } = defineProps<{
  channelId: string;
}>();

//
const stats = ref<YouTubeChannel[]>([]);
const channels = ref<readonly YouTubeChannelStreamer[]>([]);
const channel = computed(() => channels.value.find((c) => c.id === channelId));
const videos = computedAsync(async () => {
  if (channel.value != null) {
    try {
      errorSnackbar.value = false;
      return (
        await axios.get<readonly Video[]>(videoUri(channel.value.id), { transformResponse: parseAsVideo })
      ).data.filter((v) => v.availability === 'public');
    } catch {
      errorSnackbar.value = true;
      return [];
    }
  } else {
    return [];
  }
}, []);

onMounted(async () => {
  try {
    errorSnackbar.value = false;
    stats.value = (await axios.get<YouTubeChannelStatsResponse>(statsUri)).data.data;
    channels.value = mergeArrayBy('id', (await axios.get<YouTubeChannelStreamer[]>(channelsUri)).data, stats.value);
  } catch {
    errorSnackbar.value = true;
  }
});

////
const realtimeStats = computed(() => stats.value.find((channel) => channel.id === channelId)?.statistics);
const activityDays = computed(() =>
  dayjs(channel?.value?.activityEndDate ?? undefined).diff(dayjs(channel?.value?.activityStartDate), 'days', true),
);

const errorSnackbar = ref<boolean>();
const drawer = ref<boolean>();
const targetProperty = ref<VideoProperty>('viewCount');
const filterType = ref<VideoType[]>(['video', 'streaming', 'shorts']);
const sortOrder = ref<SortOrder>('descending');
</script>

<template>
  <NavigationDrawer v-model:opened="drawer" :channels="channels" :active-channel-id="channelId" />

  <v-main>
    <v-app-bar flat density="compact">
      <v-app-bar-nav-icon variant="text" @click.stop="drawer = !drawer" aria-label="ナビゲーションを表示" />
      <v-toolbar-title>{{ channel?.fullname }}</v-toolbar-title>
      <template v-slot:append>
        <ThemeToggleButton />
      </template>
    </v-app-bar>

    <v-snackbar v-model="errorSnackbar" timeout="10000">
      データの読み込みができませんでした。しばらくしてから再読み込みしてください。
      <template v-slot:actions>
        <v-btn color="red-lighten-2" variant="text" @click="errorSnackbar = false">閉じる</v-btn>
      </template>
    </v-snackbar>

    <v-container>
      <v-row class="ma-0">
        <v-col cols="6" sm="4" class="pa-1">
          <v-card color="red" variant="flat" class="summary-card">
            <v-card-text class="pa-2 text-subtitle-2">
              <v-icon icon="mdi-check" />
              チャンネル登録者
            </v-card-text>
            <v-skeleton-loader
              v-if="!realtimeStats || !Number.isFinite(activityDays) || activityDays === 0"
              color="transparent"
              type="text@2"
            />
            <template v-else>
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
            </template>
          </v-card>
        </v-col>
        <v-col cols="6" sm="4" class="pa-1">
          <v-card color="green" variant="flat" class="summary-card">
            <v-card-text class="pa-2 text-subtitle-2">
              <v-icon icon="mdi-video"></v-icon>
              公開中の配信・動画
            </v-card-text>
            <v-skeleton-loader
              v-if="videos.length === 0 || !Number.isFinite(activityDays)"
              color="transparent"
              type="text@2"
            />
            <template v-else>
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
            </template>
          </v-card>
        </v-col>
        <v-col cols="6" sm="4" class="pa-1">
          <v-card color="teal" variant="flat" class="summary-card">
            <v-card-text class="pa-2 text-subtitle-2">
              <v-icon icon="mdi-calendar-clock"></v-icon>
              配信活動日数
            </v-card-text>
            <v-skeleton-loader v-if="!channel || !Number.isFinite(activityDays)" color="transparent" type="text@2" />
            <template v-else>
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
            </template>
          </v-card>
        </v-col>
        <v-col cols="6" sm="4" class="pa-1">
          <v-card color="indigo" variant="flat" class="summary-card">
            <v-card-text class="pa-2 text-subtitle-2">
              <v-icon icon="mdi-play"></v-icon>
              総再生数
            </v-card-text>
            <v-skeleton-loader v-if="videos.length === 0" color="transparent" type="text@2" />
            <template v-else>
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
            </template>
          </v-card>
        </v-col>
        <v-col cols="6" sm="4" class="pa-1">
          <v-card color="orange-darken-1" variant="flat" class="summary-card">
            <v-card-text class="pa-2 text-subtitle-2">
              <v-icon icon="mdi-thumb-up"></v-icon>
              総高評価数
            </v-card-text>
            <v-skeleton-loader v-if="videos.length === 0" color="transparent" type="text@2" />
            <template v-else>
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
            </template>
          </v-card>
        </v-col>
        <v-col cols="6" sm="4" class="pa-1">
          <v-card color="deep-purple" variant="flat" class="summary-card">
            <v-card-text class="pa-2 text-subtitle-2">
              <v-icon icon="mdi-comment"></v-icon>
              総コメント数
            </v-card-text>
            <v-skeleton-loader v-if="videos.length === 0" color="transparent" type="text@2" />
            <template v-else>
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
            </template>
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
          <v-btn-toggle v-model="sortOrder" class="ml-2" divided color="secondary" mandatory>
            <v-btn icon="mdi-sort-descending" value="descending" aria-label="降順" />
            <v-btn icon="mdi-sort-ascending" value="ascending" aria-label="昇順" />
          </v-btn-toggle>
          <v-card flat>
            <VideoRanking
              :data="videos"
              :sortOrder="sortOrder"
              :filter-type="filterType"
              :target-property="targetProperty"
              :max-number="30"
            ></VideoRanking>
          </v-card>
        </v-card>
      </v-container>
    </v-container>
    <v-footer class="bg-secondary text-center d-flex flex-column mt-10">
      <ul>
        <li>数値の反映に数日かかることがあります</li>
        <li>このサイトは非公式のファンサイトです</li>
      </ul>
    </v-footer>
  </v-main>
</template>

<style scoped lang="scss">
.summary-card {
  background: linear-gradient(#ffffff30, #00000010);
}
</style>
