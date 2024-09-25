<script setup lang="ts">
import { ref } from 'vue';
import { ThemeToggleButton } from '@nanase/alnilam/components';
import NavigationDrawer from './NavigationDrawer.vue';

const { pageId, toolbarTitle } = defineProps<{
  pageId: string;
  toolbarTitle?: string;
}>();

const drawer = ref<boolean>();
const errorSnackbar = ref<boolean>();

defineExpose({
  showErrorSnackbar: function () {
    errorSnackbar.value = true;
  },
  closeErrorSnackbar: function () {
    errorSnackbar.value = false;
  },
});
</script>

<template>
  <v-app>
    <NavigationDrawer $opened="drawer" :pageId />

    <v-snackbar $="errorSnackbar" timeout="10000">
      <slot name="errorSnackbar">データの読み込みができませんでした。しばらくしてから再読み込みしてください。</slot>
      <template #actions>
        <v-btn color="red-lighten-2" variant="text" @click="errorSnackbar = false">閉じる</v-btn>
      </template>
    </v-snackbar>

    <v-main>
      <v-app-bar flat floating density="compact">
        <v-app-bar-nav-icon variant="text" @click.stop="drawer = !drawer" aria-label="ナビゲーションを表示" />
        <v-toolbar-title>{{ toolbarTitle }}</v-toolbar-title>
        <template #append>
          <slot name="toolbar"></slot>
          <ThemeToggleButton />
        </template>
      </v-app-bar>

      <slot name="header"></slot>

      <v-container class="bg-containerBackground">
        <slot></slot>
      </v-container>

      <slot name="footer"></slot>
    </v-main>
  </v-app>
</template>
