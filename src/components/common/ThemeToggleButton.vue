<script setup lang="ts">
import { onMounted, onBeforeUnmount } from 'vue';
import { useTheme } from 'vuetify';

const vuetifyColorSchemeName = 'vuetify-color-scheme';
const theme = useTheme();
type PrefersColorScheme = 'unspecified' | 'light' | 'dark';

function getPrefersColorScheme(): PrefersColorScheme {
  if (!window.matchMedia) {
    return 'unspecified';
  }

  if (window.matchMedia('(prefers-color-scheme: light)').matches) {
    return 'light';
  }

  if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }

  return 'unspecified';
}

function toggleTheme() {
  if (theme.global.current.value.dark) {
    if (getPrefersColorScheme() === 'light') {
      localStorage.removeItem(vuetifyColorSchemeName);
    } else {
      localStorage.setItem(vuetifyColorSchemeName, 'light');
    }

    theme.global.name.value = 'light';
  } else {
    if (getPrefersColorScheme() === 'dark') {
      localStorage.removeItem(vuetifyColorSchemeName);
    } else {
      localStorage.setItem(vuetifyColorSchemeName, 'dark');
    }

    theme.global.name.value = 'dark';
  }
}

function onSchemeChanged(event: MediaQueryListEvent) {
  const colorScheme = localStorage.getItem(vuetifyColorSchemeName);

  if (colorScheme === null) {
    theme.global.name.value = event.matches ? 'dark' : 'light';
  } else if ((colorScheme === 'dark' && event.matches) || (colorScheme === 'light' && !event.matches)) {
    localStorage.removeItem(vuetifyColorSchemeName);
  }
}

onMounted(() => {
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', onSchemeChanged);
  }

  const colorScheme = localStorage.getItem(vuetifyColorSchemeName);

  if (colorScheme === 'light') {
    theme.global.name.value = 'light';
  } else if (colorScheme === 'dark') {
    theme.global.name.value = 'dark';
  } else {
    if (getPrefersColorScheme() === 'dark') {
      theme.global.name.value = 'dark';
    } else {
      theme.global.name.value = 'light';
    }
  }
});

onBeforeUnmount(() => {
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').removeEventListener('change', onSchemeChanged);
  }
});
</script>

<template>
  <v-tooltip text="テーマを切り替え">
    <template v-slot:activator="{ props }">
      <v-btn v-bind="props" icon="mdi-theme-light-dark" @click="toggleTheme"></v-btn>
    </template>
  </v-tooltip>
</template>
