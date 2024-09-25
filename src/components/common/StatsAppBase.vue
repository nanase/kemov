<script setup lang="ts">
import { ref } from 'vue';
import { useVuetifyTheme } from '@nanase/alnilam/use';
import { AppBaseV2 } from '@nanase/alnilam/components';
import type { YouTubeChannelStreamer } from '@/type/youtube';

const { channels } = defineProps<{
  channels: readonly YouTubeChannelStreamer[];
}>();
const errorSnackbarShown = defineModel<boolean>('errorSnackbarShown');
const { isDark, toggle: toggleTheme } = useVuetifyTheme();
</script>

<template>
  <AppBaseV2 :page-sections="[]" v-model:error-snackbar-shown="errorSnackbarShown">
    <template #drawerMenu="{ currentPage }">
      <v-list-item
        class="py-2"
        link
        slim
        title=""
        href="/kemov/stats/"
        role="menuitem"
        density="default"
        base-color="v2DrawerList"
      >
        <template #prepend>
          <v-icon icon="mdi-finance" size="large" />
        </template>
        <v-list-item-title style="font-size: 100%" class="font-weight-bold">けもV リアルタイム統計</v-list-item-title>
      </v-list-item>
      <v-divider class="mx-4" />

      <v-list class="flex-grow-1 flex-shrink-1 overflow-auto" role="menu" density="compact" nav link>
        <v-list-item
          v-for="channel in channels"
          :key="channel.id"
          :title="channel.name"
          :subtitle="channel.globalname"
          :href="`/kemov/stats/detail/#/${channel.id}`"
          role="menuitem"
          link
          color="v2DrawerListActive"
          base-color="v2DrawerList"
          style="font-size: 0.9rem"
          :active="currentPage?.id === `stats/detail/${channel.id}`"
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
      <v-list density="compact" link nav slim class="flex-grow-0 flex-shrink-0" role="menu">
        <v-list-item title="ジェネット楽曲一覧" href="/kemov/genet/music/" role="menuitem">
          <template #prepend>
            <v-icon icon="mdi-music" size="small" />
          </template>
        </v-list-item>
      </v-list>
    </template>

    <template #appbarAppend>
      <v-menu :close-on-content-click="false">
        <template v-slot:activator="{ props }">
          <v-btn icon v-bind="props" variant="plain" aria-label="ページオプションを表示">
            <v-icon>mdi-dots-horizontal</v-icon>
          </v-btn>
        </template>

        <v-list slim density="compact">
          <v-list-item @click="toggleTheme">
            <v-switch
              hide-details
              flat
              :ripple="false"
              v-model:model-value="isDark"
              aria-label="テーマを切り替え"
              true-icon="mdi-weather-night"
              false-icon="mdi-white-balance-sunny"
            >
              <template #prepend>テーマを切り替え</template>
            </v-switch>
          </v-list-item>
        </v-list>
      </v-menu>
    </template>

    <template #header>
      <slot name="header"></slot>
    </template>

    <slot></slot>

    <template #footer>
      <slot name="footer"></slot>
    </template>
  </AppBaseV2>
</template>
