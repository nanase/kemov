<script setup lang="ts">
import { defineModel } from 'vue';

import { type YouTubeChannelStreamer } from '@/type/youtube';

const { pageId, channels } = defineProps<{
  pageId: string;
  channels?: YouTubeChannelStreamer[];
}>();
const opened = defineModel<boolean>('opened');
</script>

<template>
  <v-navigation-drawer v-model="opened" floating aria-label="サイトページ一覧">
    <v-list class="pb-0 d-flex flex-column fill-height" role="menu">
      <v-list-item link title="リアルタイム統計" href="/kemov/stats/" role="menuitem" :active="pageId === 'stats'">
        <template #prepend>
          <v-icon icon="mdi-finance" size="large" />
        </template>
      </v-list-item>

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

      <v-divider />
      <v-list density="compact" link nav class="flex-grow-0 flex-shrink-0" role="menu">
        <v-list-item
          title="ジェネット楽曲一覧"
          href="/kemov/genet/music/"
          role="menuitem"
          :active="pageId === 'genet/music'"
        >
          <template #prepend>
            <v-icon icon="mdi-music" size="small" />
          </template>
        </v-list-item>
      </v-list>
    </v-list>
  </v-navigation-drawer>
</template>
