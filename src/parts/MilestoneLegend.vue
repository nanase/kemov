<script setup lang="ts">
/**
 * What the three marks on a milestone chart mean.
 *
 * Drawn with the same classes the charts use, so the key cannot drift from
 * what it explains. The dotted line between points is not in it: it is the
 * same for everyone and only says the months in between are not recorded.
 */
const { now } = defineProps<{
  /** Whether the chart carries the ring for today's count. */
  now: boolean;
}>();
</script>

<template>
  <p class="milestone-legend">
    <span><i class="mark" data-by="member" aria-hidden="true"></i>本人・公式の公表</span>
    <span><i class="mark" data-by="listener" aria-hidden="true"></i>リスナーの投稿</span>
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

.mark.now {
  width: 11px;
  height: 11px;
  border: 1.5px solid var(--k-text);
  background: var(--k-surface);
}
</style>
