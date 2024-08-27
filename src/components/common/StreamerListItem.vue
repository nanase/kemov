<script setup lang="ts">
import { inject, type Ref } from 'vue';
import { type YouTubeChannelStreamer } from '@/type/youtube';

const channels = inject<Ref<YouTubeChannelStreamer[]>>('streamerChannels');

const { pageId } = defineProps<{
  pageId?: string;
}>();
</script>

<template>
  <v-list
    nav
    link
    active-class="bg-primary"
    density="compact"
    class="flex-grow-1 flex-shrink-1 overflow-auto"
    role="menu"
  >
    <v-list-item
      v-for="channel in channels"
      :key="channel.id"
      :title="channel.name"
      :subtitle="channel.globalname"
      :href="`/kemov/stats/detail/#/${channel.id}`"
      :active="pageId === `stats/detail/${channel.id}`"
      role="menuitem"
    >
      <template #prepend>
        <v-avatar :color="channel.color.key" variant="outlined" size="small">
          <v-img :src="channel.thumbnails.default.url" :alt="channel.fullname" />
        </v-avatar>
      </template>
    </v-list-item>

    <v-list-item v-if="channels?.length === 0" class="pa-4 text-center">
      <v-progress-circular color="primary" indeterminate />
    </v-list-item>
  </v-list>
</template>
