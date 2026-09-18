<script setup lang="ts">
import { useTemplateRef } from 'vue';
import ThemeToggle from './ThemeToggle.vue';
import { SITE_PAGES, type NavItem } from './pages';
import { useDragScroll } from './useDragScroll';

const { current, items = SITE_PAGES } = defineProps<{
  /** The id of the page being read. */
  current: string;
  items?: readonly NavItem[];
}>();

const links = useTemplateRef<HTMLElement>('links');
const { fadeLeft, fadeRight, dragging } = useDragScroll(links);
</script>

<template>
  <nav class="site-nav" aria-label="サイト">
    <div class="links-frame" :class="{ 'fade-left': fadeLeft, 'fade-right': fadeRight }">
      <div ref="links" class="links" :class="{ dragging }">
        <span class="brand">けもV</span>
        <a
          v-for="item in items"
          :key="item.id"
          :href="item.href"
          :aria-current="item.id === current ? 'page' : undefined"
          >{{ item.label }}</a
        >
      </div>
    </div>
    <ThemeToggle />
  </nav>
</template>

<style scoped>
.site-nav {
  position: sticky;
  top: 0;
  z-index: 30;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 44px;
  margin: calc(var(--shell-pad-top) * -1) calc(var(--shell-pad-x) * -1) 0;
  padding: 0 var(--shell-pad-x);
  background: var(--k-glass);
  backdrop-filter: blur(12px) saturate(1.2);
  border-bottom: 1px solid var(--k-line);
}

.links-frame {
  position: relative;
  flex: 1 1 auto;
  min-width: 0;
  height: 100%;
}

.links {
  display: flex;
  align-items: center;
  gap: 2px;
  height: 100%;
  overflow-x: auto;
  overscroll-behavior-x: contain;
  scrollbar-width: none;
  user-select: none;

  /* Only the edges the band continues past fade into the background. */
  --fade-left: 0px;
  --fade-right: 0px;

  mask-image: linear-gradient(
    to right,
    transparent 0,
    #000 var(--fade-left),
    #000 calc(100% - var(--fade-right)),
    transparent 100%
  );
}

.links::-webkit-scrollbar {
  display: none;
}

.fade-left .links {
  --fade-left: 28px;

  cursor: grab;
}

.fade-right .links {
  --fade-right: 28px;

  cursor: grab;
}

.links.dragging,
.links.dragging a {
  cursor: grabbing;
}

.brand {
  margin-right: 12px;
  font-weight: 700;
  white-space: nowrap;
}

.links a {
  padding: 5px 10px;
  border-radius: 6px;
  color: var(--k-text-2);
  font-weight: 500;
  text-decoration: none;
  white-space: nowrap;
  -webkit-user-drag: none;
}

.links a:hover {
  background: var(--k-track);
}

.links a[aria-current='page'] {
  background: var(--k-accent-soft);
  color: var(--k-accent);
  font-weight: 700;
}

@container (max-width: 560px) {
  .brand {
    display: none;
  }
}
</style>
