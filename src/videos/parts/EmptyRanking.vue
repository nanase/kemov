<script setup lang="ts">
import { withCommas } from '@nanase/alnilam/number';

import type { RankingPeriod } from '@/lib/ranking';
import type { VideoType } from '@/type/api';
import type { Alternative, FunnelStep } from '../model';

/**
 * What the left leaf draws instead of a table: loading, a failed fetch, a
 * denominator of zero, or a denominator narrowed to zero by the filters.
 *
 * The last two are #135's own distinction. A zero denominator (`state
 * "noUniverse"`) can only be escaped by changing species or period - the
 * controls that make the denominator what it is - so the way out offered
 * here is always one of those two, never a filter. A zero after filtering
 * (`state "funnel"`) is escaped by dropping a filter instead, and the funnel
 * shows which one emptied it.
 */
export type EmptyState = 'loading' | 'fail' | 'noUniverse' | 'funnel';

export interface Suggestion {
  label: string;
  count: number;
  key: 'query' | 'length' | 'channel' | 'resetAll';
}

const { state, alternatives, steps, suggestions } = defineProps<{
  state: EmptyState;
  /** Only for 'noUniverse': other kind/period combinations that are not empty. */
  alternatives: readonly Alternative[];
  /** Only for 'funnel': the stages, in order, with a mark on the one that reached zero. */
  steps: readonly FunnelStep[];
  /** Only for 'funnel': which filter to drop, best-recovering first. */
  suggestions: readonly Suggestion[];
}>();

const emit = defineEmits<{
  pickAlternative: [{ kind: VideoType; period: RankingPeriod }];
  drop: [Suggestion['key']];
}>();

const firstZeroKey = () => steps.find((s) => s.count === 0)?.key ?? null;
</script>

<template>
  <div v-if="state === 'loading'" class="skel">
    <div v-for="i in 9" :key="i" class="ln"></div>
  </div>

  <div v-else-if="state === 'fail'" class="sheet fail">
    <div class="h">配信・動画情報を取得できませんでした</div>
    <div class="b">しばらく時間をおいてから再度お試しください</div>
  </div>

  <div v-else-if="state === 'noUniverse'" class="sheet">
    <div class="h">条件に当てはまる配信・動画がみつかりません</div>
    <div class="ways">
      <button
        v-for="a in alternatives"
        :key="`${a.kind}-${JSON.stringify(a.period)}`"
        type="button"
        class="way"
        @click="emit('pickAlternative', { kind: a.kind, period: a.period })"
      >
        {{ a.label }}（{{ withCommas(a.count) }} 本）
      </button>
      <div v-if="alternatives.length === 0" class="b">この指標は、ほかの種別・期間でも 0 本です。</div>
    </div>
  </div>

  <div v-else class="sheet">
    <div class="h">条件に当てはまる配信・動画がみつかりません</div>
    <div class="funnel">
      <div v-for="step in steps" :key="step.key" class="step" :data-zero="step.key === firstZeroKey() ? '1' : '0'">
        <span class="w"
          >{{ step.words[0] }}<em>{{ step.words[1] }}</em
          >{{ step.words[2] }}</span
        >
        <span class="num">{{ withCommas(step.count) }} 本</span>
      </div>
    </div>
    <div class="ways">
      <button v-for="s in suggestions" :key="s.key" type="button" class="way" @click="emit('drop', s.key)">
        {{ s.label }}（{{ withCommas(s.count) }} 本）
      </button>
    </div>
  </div>
</template>

<style scoped>
.sheet {
  padding: 20px 16px;
}

.sheet .h {
  font-size: 14px;
  font-weight: 600;
  color: var(--k-text);
  text-align: center;
}

.sheet .b {
  margin-top: 5px;
  font-size: 12px;
  color: var(--k-text-3);
  font-variant-numeric: tabular-nums;
  text-align: center;
}

.sheet.fail .h {
  color: var(--k-warn);
}

.funnel {
  margin: 14px auto 0;
  max-width: 460px;
  border: 1px solid var(--k-line);
  border-radius: 6px;
  overflow: hidden;
  background: var(--k-surface);
}

.funnel .step {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 5px 10px;
  border-bottom: 1px solid var(--k-line);
  font-size: 11.5px;
}

.funnel .step:last-child {
  border-bottom: 0;
}

.funnel .step .w {
  color: var(--k-text-2);
  min-width: 0;
  overflow-wrap: anywhere;
}

.funnel .step .w em {
  font-style: normal;
  color: var(--k-text);
  font-weight: 600;
}

.funnel .step .num {
  margin-left: auto;
  font-variant-numeric: tabular-nums;
  color: var(--k-text-3);
  white-space: nowrap;
}

.funnel .step[data-zero='1'] {
  background: var(--k-accent-soft);
  box-shadow: inset 3px 0 0 var(--k-warn);
}

.funnel .step[data-zero='1'] .num {
  color: var(--k-warn);
  font-weight: 700;
}

.ways {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 5px;
  align-items: center;
}

.way {
  font: inherit;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  padding: 5px 12px;
  border: 1px solid var(--k-line-2);
  border-radius: 6px;
  background: var(--k-surface);
  color: var(--k-text-2);
  cursor: pointer;
  min-width: 240px;
  max-width: 100%;
  transition:
    border-color 0.22s ease,
    color 0.22s ease;
}

.way:hover {
  border-color: var(--k-accent);
  color: var(--k-text);
}

.skel {
  padding: 6px 8px;
}

.skel .ln {
  height: 30px;
  border-radius: 4px;
  background: var(--k-track);
  margin-bottom: 5px;
  opacity: 0.7;
  animation: empty-ranking-breathe 1.6s ease infinite;
}

@keyframes empty-ranking-breathe {
  0%,
  100% {
    opacity: 0.4;
  }

  50% {
    opacity: 0.8;
  }
}

@media (prefers-reduced-motion: reduce) {
  .skel .ln {
    animation: none;
  }
}
</style>
