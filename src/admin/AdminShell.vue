<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';

import { getJson } from './lib/api';
import { pageTitle, publishBadgeCount, SIDEBAR_GROUPS, type FootprintsPending } from './lib/sidebar';
import { toastMessage } from './lib/toast';

/**
 * The app shell (#141, #144): the top bar, the sidebar and whatever screen
 * the router placed in the default slot. Nothing page-specific lives here -
 * `FootprintsPage.vue`, `PublishPage.vue` and `PlaceholderPage.vue` are each
 * a full `.main` on their own, matching the mock's own split between the
 * shell and what it wraps.
 */

const route = useRoute();
const drawerOpen = ref(false);
const email = ref<string | null>(null);
const publishBadge = ref<number | null>(null);

const initial = computed(() => (email.value ? email.value.charAt(0).toUpperCase() : ''));
const currentPage = computed(() => route.path.replace(/^\/+/, ''));
const crumb = computed(() => pageTitle(currentPage.value));

function badgeFor(page: string): number | null {
  return page === 'publish' ? publishBadge.value : null;
}

function closeDrawer(): void {
  drawerOpen.value = false;
}

onMounted(async () => {
  try {
    const me = await getJson<{ email: string }>('/me');

    email.value = me.email;
  } catch {
    // The topbar shows no initial when this fails - nothing else here depends on it.
  }

  try {
    const pending = await getJson<FootprintsPending>('/footprints/pending');

    publishBadge.value = publishBadgeCount(pending);
  } catch {
    publishBadge.value = null;
  }
});
</script>

<template>
  <div class="shell">
    <div class="topbar">
      <button class="drawer-toggle" type="button" aria-label="メニュー" @click="drawerOpen = !drawerOpen">
        <svg
          width="15"
          height="15"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
          aria-hidden="true"
        >
          <path d="M2 4h12M2 8h12M2 12h12" />
        </svg>
      </button>
      <span class="brandmark">けもV 管理</span>
      <span class="crumb">/ {{ crumb }}</span>
      <span class="grow"></span>
      <span class="who"
        ><span class="dot" title="Access で認証済み">{{ initial }}</span></span
      >
    </div>
    <div class="body">
      <nav class="side" :class="{ open: drawerOpen }" aria-label="ページ">
        <div v-for="group in SIDEBAR_GROUPS" :key="group.label" class="side-group">
          <div class="side-label">{{ group.label }}</div>
          <router-link
            v-for="item in group.items"
            :key="item.page"
            v-slot="{ navigate, isActive }"
            :to="`/${item.page}`"
            custom
          >
            <button
              class="nav"
              type="button"
              :aria-current="isActive"
              @click="
                navigate();
                closeDrawer();
              "
            >
              <span class="name">{{ item.name }}</span>
              <span v-if="(badgeFor(item.page) ?? 0) > 0" class="count due">{{ badgeFor(item.page) }}</span>
            </button>
          </router-link>
        </div>
      </nav>
      <slot />
    </div>
    <div v-if="toastMessage" class="toast" role="status">{{ toastMessage }}</div>
  </div>
</template>
