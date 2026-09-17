<script setup lang="ts">
import { computed, ref } from 'vue';
import { THEME_STORAGE_KEY, nextThemeSetting, parseThemeSetting, type ThemeSetting } from './theme';

// head.html has already applied any stored setting to <html> before this
// mounts, so the attribute is the one source to start from.
const setting = ref<ThemeSetting>(parseThemeSetting(document.documentElement.dataset.theme));

const LABELS: Record<ThemeSetting, string> = {
  system: '色のテーマ：OS に合わせる',
  light: '色のテーマ：ライト',
  dark: '色のテーマ：ダーク',
};

const label = computed(() => LABELS[setting.value]);

function cycle() {
  const next = nextThemeSetting(setting.value);
  setting.value = next;

  const root = document.documentElement;
  if (next === 'system') delete root.dataset.theme;
  else root.dataset.theme = next;

  try {
    if (next === 'system') localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    // Without storage the choice lasts until the page is left.
  }
}
</script>

<template>
  <button type="button" class="theme-toggle" :aria-label="label" :title="label" @click="cycle">
    <svg
      v-if="setting === 'system'"
      viewBox="0 0 16 16"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      stroke-width="1.4"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <rect x="1.8" y="2.4" width="12.4" height="8.6" rx="1.4" />
      <path d="M5.6 13.8h4.8M8 11v2.8" />
    </svg>
    <svg
      v-else-if="setting === 'light'"
      viewBox="0 0 16 16"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      stroke-width="1.4"
      stroke-linecap="round"
    >
      <circle cx="8" cy="8" r="2.9" />
      <path
        d="M8 1.4v1.7M8 12.9v1.7M1.4 8h1.7M12.9 8h1.7M3.3 3.3l1.2 1.2M11.5 11.5l1.2 1.2M3.3 12.7l1.2-1.2M11.5 4.5l1.2-1.2"
      />
    </svg>
    <svg
      v-else
      viewBox="0 0 16 16"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      stroke-width="1.4"
      stroke-linejoin="round"
    >
      <path d="M13.4 10.1A5.8 5.8 0 0 1 5.9 2.6a5.8 5.8 0 1 0 7.5 7.5z" />
    </svg>
  </button>
</template>

<style scoped>
.theme-toggle {
  display: inline-grid;
  place-items: center;
  flex: none;
  width: 30px;
  height: 30px;
  padding: 0;
  border: 1px solid var(--k-line-2);
  border-radius: 6px;
  background: var(--k-surface);
  color: var(--k-text-2);
  cursor: pointer;
}

.theme-toggle:hover {
  border-color: var(--k-accent);
  color: var(--k-text);
}

.theme-toggle svg {
  display: block;
  width: 15px;
  height: 15px;
}
</style>
