<script setup lang="ts">
import StreamerListItem from './StreamerListItem.vue';

const { pageId } = defineProps<{
  pageId: string;
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

      <StreamerListItem :pageId class="flex-grow-1 flex-shrink-1 overflow-auto" />

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
