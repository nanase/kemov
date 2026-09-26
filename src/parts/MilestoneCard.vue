<script setup lang="ts">
import { hostOf } from '@/lib/host';
import { ANNOUNCER_LABELS, countLabel } from '@/lib/milestones';
import type { SubscriberMilestone } from '@/type/api';

/**
 * What one subscriber milestone is, opened from its point on a chart (#225).
 *
 * The date, the count, who announced it, the footprints event it belongs
 * to, and where it can be checked. A listener's post is marked as one and
 * carries no link: its URL is kept on the admin site and never published,
 * so the page does not point at a listener's account.
 *
 * Shared by the statistics page and the member page. Where the card sits is
 * the chart's business, not the card's, so it takes its position as a style
 * from whoever opens it.
 */
const { milestone, name = null } = defineProps<{
  milestone: SubscriberMilestone;
  /** Whose milestone it is, on a chart that holds more than one member's. */
  name?: string | null;
}>();

const emit = defineEmits<{ close: [] }>();
</script>

<template>
  <div class="milestone-card" tabindex="-1">
    <button type="button" class="close" aria-label="閉じる" @click="emit('close')">×</button>
    <span v-if="name" class="who">{{ name }}</span>
    <span class="date n">{{ milestone.reachedDate }}</span>
    <span class="count n">{{ countLabel(milestone.subscriberCount) }}人</span>
    <span
      ><span class="by" :data-by="milestone.announcedBy">{{ ANNOUNCER_LABELS[milestone.announcedBy] }}</span></span
    >
    <span v-if="milestone.event" class="event">あしあと: {{ milestone.event.title }}</span>
    <span v-if="milestone.announcedBy !== 'listener' && milestone.sources.length > 0" class="sources">
      <a
        v-for="source in milestone.sources"
        :key="source.url"
        :href="source.url"
        target="_blank"
        rel="noopener noreferrer"
        >{{ source.title ?? hostOf(source.url) }}</a
      >
    </span>
  </div>
</template>

<style scoped>
.milestone-card {
  display: grid;
  position: absolute;
  z-index: 20;
  gap: 3px;
  width: max-content;
  min-width: 150px;
  max-width: min(280px, 100%);
  padding: 9px 30px 10px 12px;
  border: 1px solid var(--k-line-2);
  border-radius: 8px;
  background: var(--k-surface);
  box-shadow: var(--k-shadow);
  color: var(--k-text);
  font-size: 12px;
  line-height: 1.5;
  text-align: left;
  white-space: normal;
}

.milestone-card:focus-visible {
  outline: 2px solid var(--k-accent);
  outline-offset: 1px;
}

.close {
  position: absolute;
  top: 4px;
  right: 5px;
  width: 22px;
  height: 22px;
  border: 0;
  border-radius: 50%;
  background: none;
  color: var(--k-text-3);
  font: inherit;
  font-size: 15px;
  line-height: 1;
  cursor: pointer;
}

.close:hover {
  background: var(--k-surface-2);
  color: var(--k-text);
}

.who {
  font-weight: 700;
}

.date {
  color: var(--k-text-3);
  font-size: 11px;
}

.count {
  font-size: 15px;
  font-weight: 700;
}

.by {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 3px;
  background: var(--k-accent-soft);
  color: var(--k-accent);
  font-size: 10.5px;
  font-weight: 700;
}

.by[data-by='listener'] {
  box-shadow: inset 0 0 0 1px var(--k-line-2);
  background: var(--k-surface-2);
  color: var(--k-text-2);
}

.event {
  color: var(--k-text-2);
  font-size: 11.5px;
  overflow-wrap: anywhere;
}

.sources {
  display: flex;
  flex-wrap: wrap;
  gap: 2px 10px;
}

.sources a {
  color: var(--k-accent);
  font-size: 11.5px;
  overflow-wrap: anywhere;
}
</style>
