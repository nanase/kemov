<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useStorage } from '@vueuse/core';

import StatTable, { type StatDataType } from '@/components/stats/StatTable.vue';
import UpdateTime from '@/components/stats/UpdateTime.vue';
import UpdateCircle from '@/components/common/UpdateCircle.vue';
import StatsAppBase from '@/components/common/StatsAppBase.vue';
import useStatsStore from './store';

const { fetchedAt, fetching, errorOccurred, freshness } = useStatsStore();

/**
 * Whether these numbers were served after the database could not be read.
 *
 * The API keeps the last good answer for six hours and serves it rather than
 * failing, which is the whole reason the table is not empty during an outage -
 * and it is only defensible while the page says so. Serving old numbers
 * quietly is the defect being removed, wearing a different coat.
 */
const servedStale = computed<boolean>(() => freshness.value.state === 'stale');

const staleFor = computed<string>(() => {
  const minutes = Math.floor(freshness.value.staleSeconds / 60);

  return minutes >= 60 ? `${Math.floor(minutes / 60)} 時間` : `${minutes} 分`;
});
const tab = ref<StatDataType>('subscriber');
const activeOnly = useStorage<boolean>('kemov/stats/activeOnly', false);

onMounted(async () => {
  await fetching.channels.start();
  await fetching.live.start();
});
</script>

<template>
  <StatsAppBase page-id="stats" title="けもV リアルタイム統計" :error-snackbar-shown="errorOccurred">
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

        <v-alert
          v-if="servedStale"
          class="mb-2"
          type="warning"
          variant="tonal"
          density="compact"
          title="最新の数値を取得できていません"
          :text="`表示は ${staleFor}前の数値です。最新の数値を取得できていません`"
        />

        <StatTable :type="tab" :active-only />

        <v-card class="text-right px-3 py-0" variant="flat">
          <v-row no-gutters>
            <v-col>
              <v-checkbox v-model="activeOnly" label="活動中の配信者のみ表示" hide-details density="compact" />
            </v-col>
            <v-col class="d-flex align-center justify-end">
              <v-menu>
                <template #activator="{ props }">
                  <UpdateCircle
                    class="cursor-pointer mr-1"
                    v-bind="props"
                    :time="fetchedAt"
                    :update-interval="5000"
                    :green-seconds="60 * 10"
                    :yellow-seconds="60 * 30"
                  />
                  <UpdateTime
                    class="cursor-pointer opacity-70 text-subtitle-2"
                    v-bind="props"
                    :time="fetchedAt"
                    :update-interval="5000"
                  >
                    <template #default="{ readableElapsedTime }"> {{ readableElapsedTime }}前 </template>
                  </UpdateTime>
                </template>

                <v-list density="compact">
                  <v-list-item slim :subtitle="`更新: ${fetchedAt.format('YYYY-MM-DD H:mm:ss')}`" />
                </v-list>
              </v-menu>

              <!-- <UpdateTime class="update-time" :time="fetchedAt" /> -->
            </v-col>
          </v-row>
        </v-card>
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
  </StatsAppBase>
</template>
