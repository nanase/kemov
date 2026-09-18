<script setup lang="ts">
import { formatCount } from '@/stats/draw';

import type { Streak } from '../model';

/**
 * Days streamed back to back, longest first.
 *
 * A day on its own is not a run of anything, so the list starts at two and
 * the heading says how many runs there are - otherwise a member who streams
 * every other day would appear to have hundreds of them (#136).
 */
const { streaks } = defineProps<{ streaks: readonly Streak[] }>();
</script>

<template>
  <div class="mv-panel">
    <div class="mv-head">
      <b>連続配信</b>
      <span class="mv-grow"></span>
      <span class="mv-n">2 日以上が {{ formatCount(streaks.length) }} 回</span>
    </div>
    <p v-if="streaks.length === 0" class="mv-empty">2 日つづけて配信した記録がありません</p>
    <div v-else class="runs">
      <div v-for="streak in streaks" :key="streak.from" class="run">
        <span class="span mv-n">{{ streak.from }} → {{ streak.to }}</span>
        <span class="days mv-n">{{ streak.days }}<small>日</small></span>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* The panel matches the height of the shape panel beside it, and what does
   not fit scrolls inside it rather than stretching the row. */
.runs {
  display: grid;
  flex: 1 1 0;
  align-content: start;
  min-height: 110px;
  overflow-y: auto;
}

.run {
  display: flex;
  gap: 8px;
  align-items: baseline;
  padding: 5px 11px 6px;
  border-top: 1px solid var(--k-line);
  background: var(--k-surface);
  font-size: 11.5px;
}

.run:first-child {
  border-top: 0;
}

.span {
  min-width: 0;
  overflow: hidden;
  color: var(--k-text-2);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.days {
  margin-left: auto;
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
}

.days small {
  margin-left: 2px;
  color: var(--k-text-3);
  font-size: 10.5px;
  font-weight: 400;
}

@container (max-width: 1120px) {
  .runs {
    flex: 0 1 auto;
    max-height: 260px;
  }
}
</style>
