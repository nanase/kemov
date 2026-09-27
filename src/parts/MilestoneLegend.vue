<script setup lang="ts">
import { MILESTONE_MINOR, MILESTONE_START } from '@/lib/milestones';

/**
 * What the marks on a milestone chart mean.
 *
 * Drawn with the same classes the charts use, so the key cannot drift from
 * what it explains. The dotted line between points is not in it: it is the
 * same for everyone and only says the months in between are not recorded.
 * Nor is a major milestone: it looks as every milestone did before the minor
 * ones were drawn apart (#239), and the round figure is written beside it.
 */
const { now, minor, start } = defineProps<{
  /** Whether the chart carries the ring for today's count. */
  now: boolean;
  /** Whether the chart draws any minor milestone. */
  minor: boolean;
  /** Whether the chart draws a line up from the start of activity. */
  start: boolean;
}>();
</script>

<template>
  <p class="milestone-legend">
    <span><i class="mark" data-by="member" aria-hidden="true"></i>本人・公式の公表</span>
    <span><i class="mark" data-by="listener" aria-hidden="true"></i>リスナーの投稿</span>
    <span v-if="minor"><i class="mark" data-by="member" data-minor aria-hidden="true"></i>{{ MILESTONE_MINOR }}</span>
    <span v-if="start"><i class="mark start" aria-hidden="true"></i>{{ MILESTONE_START }}</span>
    <span v-if="now"><i class="mark now" aria-hidden="true"></i>いま</span>
  </p>
</template>

<style scoped>
.milestone-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 14px;
  margin: 0;
  color: var(--k-text-2);
  font-size: 11px;
}

.milestone-legend span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.mark {
  box-sizing: border-box;
  width: 9px;
  height: 9px;
  border-radius: 50%;
}

.mark[data-by='member'] {
  border: 1.5px solid var(--member-accent, var(--k-accent));
  background: var(--member-color, var(--k-accent));
}

.mark[data-by='listener'] {
  border: 2px solid var(--member-color, var(--k-accent));
  background: var(--k-surface);
}

.mark[data-minor] {
  width: 7px;
  height: 7px;
  margin-inline: 1px;
  opacity: 0.42;
}

.mark.start {
  width: 7px;
  height: 7px;
  margin-inline: 1px;
  border: 1.5px solid var(--k-text-3);
  background: var(--k-surface);
}

.mark.now {
  width: 11px;
  height: 11px;
  border: 1.5px solid var(--k-text);
  background: var(--k-surface);
}
</style>
