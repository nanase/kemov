<script setup lang="ts">
import { onMounted, onBeforeUnmount } from 'vue';
import { useTheme } from 'vuetify';

const vuetifyColorSchemeName = 'vuetify-color-scheme';
const theme = useTheme();
type PrefersColorScheme = 'unspecified' | 'light' | 'dark';

function applyColorScheme(scheme: PrefersColorScheme) {
  if (scheme === 'unspecified') {
    theme.global.name.value = '';

    document.querySelectorAll('.color-responsive').forEach((element) => {
      element.classList.remove('.color-responsive-dark', '.color-responsive-light');
    });
  } else {
    theme.global.name.value = scheme;

    document.querySelectorAll('.color-responsive').forEach((element) => {
      if (scheme === 'light') {
        element.classList.add('.color-responsive-light');
        element.classList.remove('.color-responsive-dark');
      } else {
        element.classList.add('.color-responsive-dark');
        element.classList.remove('.color-responsive-light');
      }
    });
  }
}

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

    applyColorScheme('light');
  } else {
    if (getPrefersColorScheme() === 'dark') {
      localStorage.removeItem(vuetifyColorSchemeName);
    } else {
      localStorage.setItem(vuetifyColorSchemeName, 'dark');
    }

    applyColorScheme('dark');
  }
}

function onSchemeChanged(event: MediaQueryListEvent) {
  const colorScheme = localStorage.getItem(vuetifyColorSchemeName);

  if (colorScheme === null) {
    applyColorScheme(event.matches ? 'dark' : 'light');
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
    applyColorScheme('light');
  } else if (colorScheme === 'dark') {
    applyColorScheme('dark');
  } else {
    if (getPrefersColorScheme() === 'dark') {
      applyColorScheme('dark');
    } else {
      applyColorScheme('light');
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
  <v-tooltip text="テーマを切り替え" aria-label="テーマを切り替え">
    <template #activator="{ props }">
      <v-btn
        v-bind="props"
        :icon="theme.global.current.value.dark ? 'mdi-weather-night' : 'mdi-white-balance-sunny'"
        @click="toggleTheme"
        aria-label="テーマを切り替え"
      />
    </template>
  </v-tooltip>
</template>
