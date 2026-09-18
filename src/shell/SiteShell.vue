<script setup lang="ts">
import PageNotes from './PageNotes.vue';
import PageTitle from './PageTitle.vue';
import SiteNav from './SiteNav.vue';
import type { NavItem } from './pages';

const { page, title, navItems } = defineProps<{
  /** The id of the page, as SiteNav's items name it. */
  page: string;
  title: string;
  /** Replaces the site's pages in the navigation. */
  navItems?: readonly NavItem[];
}>();
</script>

<template>
  <div class="site-shell">
    <div class="shell-frame">
      <SiteNav :current="page" :items="navItems" />
      <PageTitle :title>
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
  </div>
</template>

<style scoped>
/* The container every width rule in the shell and the pages measures. */
.site-shell {
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
