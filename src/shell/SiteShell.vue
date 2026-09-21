<script setup lang="ts">
import { watch } from 'vue';

import PageNotes from './PageNotes.vue';
import PageTitle from './PageTitle.vue';
import SiteNav from './SiteNav.vue';
import type { NavItem } from './pages';

const { page, title, tabTitle, navItems } = defineProps<{
  /** The id of the page, as SiteNav's items name it. */
  page: string;
  title: string;
  /**
   * `document.title`, when it differs from the page's own visible title -
   * `/members/<id>` and `/videos/<id>` (#137) name one person or one video in
   * the tab and in a shared link, which #136 keeps off the page itself.
   *
   * A fresh request already gets this from the worker
   * (`worker/src/pages/index.ts`), which is why this is left `undefined`
   * rather than given a value at mount: picking a different member or video
   * inside an already-open page is the only time this fires, and until then
   * `document.title` is left exactly as the page loaded it, whether that is
   * the worker's own rewrite or this page's static title. Pass the same
   * string the worker would build - `@/lib/pageTitle.ts` is where both sides
   * read that from.
   */
  tabTitle?: string;
  /** Replaces the site's pages in the navigation. */
  navItems?: readonly NavItem[];
}>();

watch(
  () => tabTitle,
  (value) => {
    if (value !== undefined) document.title = value;
  },
  { immediate: true },
);
</script>

<template>
  <div class="site-shell">
    <div class="shell-frame">
      <SiteNav :current="page" :items="navItems" />
      <PageTitle :title>
        <template #icon>
          <slot name="title-icon"></slot>
        </template>
        <template #aside>
          <slot name="title-aside"></slot>
        </template>
      </PageTitle>
      <main class="shell-body">
        <slot></slot>
      </main>
      <PageNotes>
        <slot name="notes"></slot>
      </PageNotes>
    </div>
    <!-- Laid over the whole shell, the navigation band and everything beneath it. -->
    <slot name="overlay"></slot>
  </div>
</template>

<style scoped>
/* The container every width rule in the shell and the pages measures. */
.site-shell {
  /* The height of the navigation band, which an overlay starts below to leave it clear. */
  --shell-nav-height: 44px;

  position: relative;
  container-type: inline-size;
}

.shell-frame {
  --shell-pad-top: 14px;
  --shell-pad-x: 12px;
  --shell-pad-bottom: 16px;

  display: grid;
  align-content: start;
  gap: 10px;
  padding: var(--shell-pad-top) var(--shell-pad-x) var(--shell-pad-bottom);
}

.shell-frame > * {
  min-width: 0;
}

.shell-body {
  min-width: 0;
}

@container (max-width: 560px) {
  .shell-frame {
    --shell-pad-top: 10px;
    --shell-pad-x: 8px;
    --shell-pad-bottom: 12px;
  }
}
</style>
