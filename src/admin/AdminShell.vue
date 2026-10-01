<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';

import { useStoredChoice } from '../lib/useStoredChoice';

import { getJson } from './lib/api';
import { crumbDetail } from './lib/crumb';
import { inboxBadges, publishBadge, refreshPublishBadge } from './lib/publish-badge';
import { pageGroup, pageTitle, SIDEBAR_GROUPS } from './lib/sidebar';
import { toastMessage } from './lib/toast';

/**
 * The app shell (#141, #144): the top bar, the sidebar and whatever screen
 * the router placed in the default slot. Nothing page-specific lives here;
 * a page brings its own `.main`, matching the mock's own split between the
 * shell and what it wraps.
 *
 * Signing out is Cloudflare Access's own: the account menu links to
 * `/cdn-cgi/access/logout`, which ends the Access session for this hostname,
 * so nothing on the worker's side takes part in it.
 */

const LOGOUT_URL = '/cdn-cgi/access/logout';

const route = useRoute();
const drawerOpen = ref(false);
const accountOpen = ref(false);
const accountEl = ref<HTMLElement | null>(null);
const folded = useStoredChoice('kemov-admin-side-folded', [false, true], false);
const collectFailuresBadge = ref<number | null>(null);

const currentPage = computed(() => route.path.replace(/^\/+/, ''));
const currentGroup = computed(() => pageGroup(currentPage.value));
const currentTitle = computed(() => pageTitle(currentPage.value));

function badgeFor(page: string): number | null {
  if (page === 'publish') return publishBadge.value;
  if (page === 'inbox-collect') return collectFailuresBadge.value;
  if (page === 'inbox-review') return inboxBadges.value?.review ?? null;
  if (page === 'inbox-source') return inboxBadges.value?.source ?? null;
  if (page === 'inbox-publish') return inboxBadges.value?.publish ?? null;

  return null;
}

function closeDrawer(): void {
  drawerOpen.value = false;
}

function onDocumentPointer(event: PointerEvent): void {
  if (accountOpen.value && !accountEl.value?.contains(event.target as Node)) accountOpen.value = false;
}

function onDocumentKey(event: KeyboardEvent): void {
  if (event.key === 'Escape') accountOpen.value = false;
}

watch(
  () => route.path,
  () => {
    accountOpen.value = false;
  },
);

onMounted(async () => {
  document.addEventListener('pointerdown', onDocumentPointer);
  document.addEventListener('keydown', onDocumentKey);

  await refreshPublishBadge();

  try {
    const failing = await getJson<{ count: number }>('/collect-tasks');

    collectFailuresBadge.value = failing.count;
  } catch {
    collectFailuresBadge.value = null;
  }
});

onUnmounted(() => {
  document.removeEventListener('pointerdown', onDocumentPointer);
  document.removeEventListener('keydown', onDocumentKey);
});
</script>

<template>
  <div class="shell">
    <div class="topbar">
      <button
        class="bar-btn drawer-toggle"
        type="button"
        aria-label="メニュー"
        :aria-expanded="drawerOpen"
        @click="drawerOpen = !drawerOpen"
      >
        <svg
          width="16"
          height="16"
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
      <span class="crumb">
        <template v-if="currentGroup">{{ currentGroup }} / </template>
        <template v-if="crumbDetail"
          >{{ currentTitle }} / <b>{{ crumbDetail }}</b></template
        >
        <b v-else>{{ currentTitle }}</b>
      </span>
      <span class="grow"></span>
      <div ref="accountEl" class="account">
        <button
          class="account-btn"
          type="button"
          aria-label="アカウント"
          aria-haspopup="menu"
          :aria-expanded="accountOpen"
          @click="accountOpen = !accountOpen"
        >
          <i>
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
              aria-hidden="true"
            >
              <circle cx="8" cy="5.5" r="2.8" />
              <path d="M2.5 14c.6-3 2.8-4.6 5.5-4.6s4.9 1.6 5.5 4.6" />
            </svg>
          </i>
        </button>
        <div v-if="accountOpen" class="account-menu" role="menu">
          <a role="menuitem" href="/" target="_blank" rel="noopener">
            <svg
              width="14"
              height="14"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
              aria-hidden="true"
            >
              <path d="M9 2h5v5M14 2 7 9M12 10v4H2V4h4" />
            </svg>
            公開サイトを開く
          </a>
          <a role="menuitem" class="out" :href="LOGOUT_URL">
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
              aria-hidden="true"
            >
              <path d="M6 2H2.5v12H6M10.5 4.5 14 8l-3.5 3.5M14 8H6" />
            </svg>
            ログアウト
          </a>
        </div>
      </div>
    </div>
    <div class="body" :class="{ folded }">
      <nav v-if="folded" class="rail" aria-label="ページ">
        <button
          class="side-btn"
          type="button"
          aria-label="メニューを開く"
          :aria-expanded="false"
          @click="folded = false"
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            stroke-width="1.6"
            aria-hidden="true"
          >
            <path d="M3 3.5 7.5 8 3 12.5M7.5 3.5 12 8l-4.5 4.5" />
          </svg>
        </button>
      </nav>
      <nav class="side" :class="{ open: drawerOpen }" :hidden="folded && !drawerOpen" aria-label="ページ">
        <div class="side-head">
          <span>メニュー</span>
          <button
            class="side-btn"
            type="button"
            aria-label="メニューを畳む"
            :aria-expanded="true"
            @click="folded = true"
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
              aria-hidden="true"
            >
              <path d="M8.5 3.5 4 8l4.5 4.5M13 3.5 8.5 8l4.5 4.5" />
            </svg>
          </button>
        </div>
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
