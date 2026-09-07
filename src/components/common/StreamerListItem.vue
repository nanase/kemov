<script setup lang="ts">
import { inject, type Ref } from 'vue';
import type { Channel } from '@/type/api';

const channels = inject<Ref<Channel[]>>('streamerChannels');

const { pageId } = defineProps<{
  pageId?: string;
}>();
</script>

<template>
  <v-list nav link active-class="bg-primary" density="compact" role="menu">
    <v-list-item
      v-for="channel in channels"
      :key="channel.channelId"
      :title="channel.name"
      :subtitle="channel.globalname ?? undefined"
      :href="`/stats/detail/#/${channel.channelId}`"
      :active="pageId === `stats/detail/${channel.channelId}`"
      role="menuitem"
    >
      <template #prepend>
        <v-avatar :color="channel.color.key" variant="outlined" size="small">
          <v-img v-if="channel.thumbnailUrl" :src="channel.thumbnailUrl" :alt="channel.fullname" />
          <span v-else class="text-caption">{{ channel.name.slice(0, 1) }}</span>
        </v-avatar>
      </template>
    </v-list-item>

    <v-list-item v-if="channels?.length === 0" class="pa-4 text-center">
      <v-progress-circular color="primary" indeterminate />
    </v-list-item>
  </v-list>
</template>
