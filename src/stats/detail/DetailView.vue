<script setup lang="ts">
import { computed, ref, onMounted, watch } from 'vue';
import { sum } from '@nanase/alnilam/array';
import { withCommas } from '@nanase/alnilam/number';
import { type SortOrder } from '@nanase/alnilam/sort';
import dayjs from '@nanase/alnilam/dayjs';
import type { VideoType, VideoProperty } from '@/type/video';

import StatsAppBase from '@/components/common/StatsAppBase.vue';
import VideoRanking from '@/components/stats/detail/VideoRanking.vue';
import useStatsStore from '@/stats/store';

const { channelId } = defineProps<{ channelId: string }>();
const { channels, fetching, errorOccurred, setChannelId, channel, videos } = useStatsStore();

const activityDays = computed(() =>
  dayjs(channel.value?.activityEndDate ?? undefined).diff(dayjs(channel.value?.activityStartDate), 'days', true),
);
const targetProperty = ref<VideoProperty>('viewCount');
const filterType = ref<VideoType[]>(['video', 'streaming', 'shorts']);
const sortOrder = ref<SortOrder>('descending');

onMounted(async () => await fetching.channels.invoke());

watch(
  () => channelId,
  () => setChannelId(channelId),
  { immediate: true },
);
</script>

<template>
  <StatsAppBase
    :page-id="`stats/detail/${channelId}`"
    :title="channel?.fullname"
    :channels
    :error-snackbar-shown="errorOccurred"
  >
    <v-row class="ma-0">
      <v-col cols="6" sm="4" class="pa-1">
        <v-card color="red" variant="flat" class="summary-card">
          <v-card-text class="pa-2 text-subtitle-2">
            <v-icon icon="mdi-check" />
            チャンネル登録者
          </v-card-text>
          <v-skeleton-loader
            v-if="!channel?.statistics || !Number.isFinite(activityDays) || activityDays === 0"
            color="transparent"
            type="text@2"
          />
          <template v-else>
            <v-card-text class="pa-2 mt-n3 text-h5 text-right">
              {{ withCommas(channel.statistics.subscriberCount) }}
              <span class="text-subtitle-2">&nbsp;</span>
            </v-card-text>
            <v-card-text class="pa-2 pt-0 mt-n2 text-subtitle-2 text-right">
              1日あたり
              <span class="pr-2 pt-0 mt-n2 text-h6 text-right">
                +{{ ((channel.statistics.subscriberCount ?? 0) / activityDays).toFixed(1) }}
              </span>
              <span class="text-subtitle-2">&nbsp;</span>
            </v-card-text>
          </template>
        </v-card>
      </v-col>
      <v-col cols="6" sm="4" class="pa-1">
        <v-card color="green" variant="flat" class="summary-card">
          <v-card-text class="pa-2 text-subtitle-2">
            <v-icon icon="mdi-video" />
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
            <v-icon icon="mdi-calendar-clock" />
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
            <v-icon icon="mdi-play" />
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
            <v-icon icon="mdi-thumb-up" />
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
            <v-icon icon="mdi-comment" />
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
        <v-tabs $="targetProperty" bg-color="primary" center-active show-arrows>
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
        <v-btn-toggle $="filterType" multiple divided color="secondary">
          <v-card-text>対象</v-card-text>
          <v-btn prepend-icon="mdi-microphone" value="streaming">配信</v-btn>
          <v-btn prepend-icon="mdi-video" value="video">動画</v-btn>
          <v-btn prepend-icon="mdi-cellphone-play" value="shorts">ショート</v-btn>
        </v-btn-toggle>
        <v-btn-toggle $="sortOrder" class="ml-2" divided color="secondary" mandatory>
          <v-btn icon="mdi-sort-descending" value="descending" aria-label="降順" />
          <v-btn icon="mdi-sort-ascending" value="ascending" aria-label="昇順" />
        </v-btn-toggle>
        <v-card flat>
          <VideoRanking :data="videos" :sort-order :filter-type :target-property :max-number="30" />
        </v-card>
      </v-card>
    </v-container>

    <template #footer>
      <v-footer class="bg-secondary text-center d-flex flex-column mt-10">
        <ul>
          <li>数値の反映に数日かかることがあります</li>
          <li>このサイトは非公式のファンサイトです</li>
        </ul>
      </v-footer>
    </template>
  </StatsAppBase>
</template>

<style scoped lang="scss">
.summary-card {
  background: linear-gradient(#ffffff30, #00000010);
}
</style>
