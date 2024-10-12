<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useStorage } from '@vueuse/core';

import StatTable, { type StatDataType } from '@/components/stats/StatTable.vue';
import UpdateTime from '@/components/stats/UpdateTime.vue';
import StatsAppBase from '@/components/common/StatsAppBase.vue';
import useStatsStore from './store';

const { fetchedAt, fetching, errorOccurred } = useStatsStore();
const tab = ref<StatDataType>('subscriber');
const activeOnly = useStorage<boolean>('kemov/stats/activeOnly', false);

onMounted(async () => {
  await fetching.channels.start();
  await fetching.latestStreamings.start();
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

        <StatTable :type="tab" :active-only />

        <v-card class="text-right px-4 py-2" variant="flat">
          <UpdateTime class="update-time" :time="fetchedAt" />
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
  </StatsAppBase>
</template>

<style lang="scss" scoped>
.active-only :deep(.v-checkbox-btn) {
  justify-content: center;
}
</style>
