<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { computedAsync } from '@vueuse/core';

import StatsAppBase from '@/components/common/StatsAppBase.vue';
import VideoDetail from '@/components/stats/detail/VideoDetail.vue';
import VideoThumbnail from '@/components/stats/detail/VideoThumbnail.vue';
import { ApiError, getRanking } from '@/lib/api';
import type { Channel, VideoRanking, VideoType } from '@/type/api';
import {
  COUNT_PROPERTIES,
  formatProperty,
  getPropertyDescription,
  getPropertyName,
  RATE_PROPERTIES,
  type VideoProperty,
} from '@/type/video';
import useStatsStore from '@/stats/store';

/**
 * One measure, one kind of video, every channel.
 *
 * The kind is not a convenience. The per-second measures divide by a duration
 * that stops at 60 seconds for a short and runs to hours for a stream, so
 * ranking every kind at once ranks shorts - measured across the archive, a
 * short averages 141 views per second of length against a stream's 0.58, and
 * streams are 97% of the rows. Comparing within one kind is what makes the
 * answer mean anything, and the API does the narrowing so that "no streams"
 * and "no streams in the first hundred" stay different answers.
 */

const { channels, fetching } = useStatsStore();

/**
 * The measures, grouped where the select can show the grouping.
 *
 * A select folds its options away, which is the cost of not having eleven tabs
 * fight over the width. Three things are done about that: the list is grouped
 * under headings rather than being one run of eleven, the page opens on a rate
 * rather than a count so the reason this page exists is visible before anyone
 * opens it, and the chosen measure carries a sentence saying what it counts.
 */
const items = [
  { type: 'subheader' as const, title: '量' },
  ...COUNT_PROPERTIES.map((value) => ({ value, title: getPropertyName(value) })),
  { type: 'subheader' as const, title: '濃さ' },
  ...RATE_PROPERTIES.map((value) => ({ value, title: getPropertyName(value) })),
];

const KINDS: { value: VideoType; title: string; icon: string }[] = [
  { value: 'streaming', title: '配信', icon: 'mdi-microphone' },
  { value: 'video', title: '動画', icon: 'mdi-video' },
  { value: 'shorts', title: 'ショート', icon: 'mdi-cellphone-play' },
];

const SIZES = [10, 30, 50, 100];

// Streams, because they are 97% of what this site follows, and a rate, because
// a count would open on a ranking of whoever has the most subscribers.
const metric = ref<VideoProperty>('viewCountPerSecond');
const kind = ref<VideoType>('streaming');
const limit = ref<number>(30);

/** A ranking, or the failure that stopped one. Never both, and never neither. */
type Answer = { ranking: VideoRanking } | { failure: ApiError };

const loading = ref<boolean>(false);

/**
 * The current answer, refetched whenever the measure, kind or size changes.
 *
 * A computedAsync rather than either shape the store uses: useIntervalAction
 * polls on a timer and this does not, and getAllVideos returns a structure
 * because it can partly succeed, while this either has a ranking or has none.
 *
 * Only an ApiError becomes something to display. Anything else is a fault in
 * this code rather than in the answer, and it is left to throw where it can be
 * seen instead of being relabelled as a failed request.
 */
const answer = computedAsync<Answer | null>(
  async () => {
    try {
      return { ranking: (await getRanking(metric.value, kind.value, limit.value)).data };
    } catch (error) {
      if (error instanceof ApiError) return { failure: error };

      throw error;
    }
  },
  null,
  loading,
);

const ranking = computed<VideoRanking | null>(() =>
  answer.value !== null && 'ranking' in answer.value ? answer.value.ranking : null,
);
const failure = computed<ApiError | null>(() =>
  answer.value !== null && 'failure' in answer.value ? answer.value.failure : null,
);

/**
 * The streamer a ranked video belongs to, when the channel list has arrived.
 *
 * Undefined until then, and the rows fall back to showing the raw id. The
 * ranking and the channel list are two requests and either can be first, so a
 * row can be drawn before its streamer has a name.
 */
const channelOf = (channelId: string): Channel | undefined =>
  channels.value.find((channel) => channel.channelId === channelId);

onMounted(async () => await fetching.channels.start());
</script>

<template>
  <StatsAppBase page-id="stats/ranking" title="けもV 横断ランキング" :error-snackbar-shown="failure !== null">
    <v-row justify="center">
      <v-col cols="12" md="12" lg="10" xl="8">
        <v-card class="mb-2 pa-2" variant="flat">
          <v-row dense align="center">
            <v-col cols="12" sm="5">
              <v-select
                v-model="metric"
                :items="items"
                label="指標"
                density="compact"
                variant="outlined"
                hide-details
              />
            </v-col>
            <v-col cols="12" sm="4">
              <v-btn-toggle v-model="kind" divided color="secondary" density="compact" mandatory>
                <v-btn v-for="one of KINDS" :key="one.value" :value="one.value" :prepend-icon="one.icon">
                  {{ one.title }}
                </v-btn>
              </v-btn-toggle>
            </v-col>
            <v-col cols="12" sm="3">
              <v-select v-model="limit" :items="SIZES" label="件数" density="compact" variant="outlined" hide-details />
            </v-col>
          </v-row>
          <div class="px-1 pt-2 text-body-2 opacity-70">{{ getPropertyDescription(metric) }}</div>
        </v-card>

        <v-alert
          v-if="failure"
          class="mb-2"
          type="warning"
          variant="tonal"
          density="compact"
          title="順位を取得できませんでした"
          :text="failure.message"
        />

        <v-table density="compact" hover>
          <thead>
            <tr>
              <th class="text-right">#</th>
              <th class="text-right">{{ getPropertyName(metric) }}</th>
              <th></th>
              <th class="text-left">タイトル</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="loading">
              <td colspan="4" class="pa-4 text-center">
                <v-progress-circular color="primary" indeterminate />
              </td>
            </tr>
            <tr v-for="(video, index) of ranking?.videos ?? []" v-else :key="video.videoId" style="cursor: pointer">
              <td class="text-right">{{ index + 1 }}</td>
              <td class="text-right text-h6">{{ formatProperty(metric, video.metricValue) }}</td>
              <td><VideoThumbnail :videoId="video.videoId" size="mq" /></td>
              <td>
                <div class="ranked-channel">
                  <v-avatar :color="channelOf(video.channelId)?.color.key ?? 'grey'" variant="outlined" size="x-small">
                    <v-img
                      v-if="channelOf(video.channelId)?.thumbnailUrl"
                      :src="channelOf(video.channelId)?.thumbnailUrl ?? undefined"
                      :alt="channelOf(video.channelId)?.fullname"
                    />
                  </v-avatar>
                  <span class="text-caption opacity-70">{{ channelOf(video.channelId)?.name ?? video.channelId }}</span>
                </div>
                {{ video.title }}
              </td>
              <VideoDetail :video />
            </tr>
            <!-- Only when a ranking arrived and held nothing. Without the null
                 check a failed request shows this beside the failure, which is
                 the same page telling the reader both that it could not fetch
                 and that there is nothing to fetch. -->
            <tr v-if="!loading && ranking !== null && ranking.videos.length === 0">
              <td colspan="4" class="pa-4 text-center opacity-70">動画がまだありません</td>
            </tr>
          </tbody>
        </v-table>
      </v-col>
    </v-row>

    <template #footer>
      <v-footer class="bg-secondary text-left d-flex flex-column mt-10">
        <ul>
          <li>指標を計算可能な動画のみ表示しています</li>
          <li>このサイトは非公式のファンサイトです</li>
        </ul>
      </v-footer>
    </template>
  </StatsAppBase>
</template>

<style scoped lang="scss">
.ranked-channel {
  display: flex;
  align-items: center;
  gap: 4px;
}
</style>
