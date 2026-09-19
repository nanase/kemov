<script setup lang="ts">
import { computed } from 'vue';

import type { Distribution } from '../model';
import VideoThumb from './VideoThumb.vue';

/** The one video at an end of the distribution, named under the bars. */
export interface EdgeEntry {
  kind: string;
  videoId: string;
  title: string;
  published: string;
  value: string;
}

/**
 * How one measure is spread across this member's streams.
 *
 * The darker bar is the class the middle stream falls in, which is what turns
 * a shape into a reading: a long tail to the right means most streams are
 * shorter than the widest bar suggests. Every scale is this member's own
 * (#136), so two of these panels side by side say nothing about each other.
 */
const { title, note, distribution, axis, entries, classLabel } = defineProps<{
  title: string;
  /** How wide one class is, written for the heading. */
  note: string;
  distribution: Distribution | null;
  /** Three marks under the bars: the start, the middle and the open end. */
  axis: readonly string[];
  entries: readonly EdgeEntry[];
  classLabel: (index: number) => string;
}>();

const bars = computed(() => {
  if (distribution === null) return [];

  const peak = Math.max(1, ...distribution.bins);

  return distribution.bins.map((count, index) => ({
    index,
    count,
    height: (count / peak) * 100,
    middle: index === distribution.medianBin,
    label: `${classLabel(index)} ${count} 本`,
  }));
});
</script>

<template>
  <div class="mv-panel">
    <div class="mv-head">
      <b>{{ title }}</b>
      <span class="mv-grow"></span>
      <span v-if="distribution">{{ note }}</span>
    </div>
    <p v-if="distribution === null" class="mv-empty">この期間の記録がありません</p>
    <div v-else class="mv-body">
      <div class="bars" aria-hidden="true">
        <span v-for="bar in bars" :key="bar.index" :class="{ middle: bar.middle }" :title="bar.label">
          <i :style="{ height: `${bar.height.toFixed(1)}%` }"></i>
        </span>
      </div>

      <!-- The same bars in words. `title` is a hint, not a reading: it needs a
           pointer to appear at all, so on its own it leaves the distribution
           unreadable to anybody who cannot hover (#136). -->
      <ul class="reader-only">
        <li v-for="bar in bars" :key="bar.index">{{ bar.label }}</li>
      </ul>
      <div class="axis mv-n">
        <span v-for="mark in axis" :key="mark">{{ mark }}</span>
      </div>
      <div v-for="entry in entries" :key="entry.kind" class="edge">
        <VideoThumb :video-id="entry.videoId" :width="72" :height="41" />
        <span class="about">
          <span class="kind">{{ entry.kind }}</span>
          <span class="title" :title="entry.title">{{ entry.title }}</span>
          <span class="meta mv-n"
            >{{ entry.published }} ・ <b>{{ entry.value }}</b></span
          >
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.bars {
  display: flex;
  position: relative;
  gap: 2px;
  align-items: flex-end;
  height: 88px;
}

.bars::before {
  content: '';
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  height: 1px;
  background: var(--k-line);
}

.bars span {
  display: flex;
  flex: 1 1 0;
  align-items: flex-end;
  min-width: 0;
  height: 100%;
}

.bars i {
  display: block;
  width: 100%;
  min-height: 1px;
  border-radius: 1px 1px 0 0;
  background: var(--mv-bar);
}

/* The class the middle stream falls in. */
.bars span.middle i {
  background: var(--mv-key);
}

/* Read out but never drawn: the bars above say the same thing to everyone who
   can see them, so putting the words on the page would be saying it twice. */
.reader-only {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: 0;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  list-style: none;
}

.axis {
  display: flex;
  justify-content: space-between;
  margin-top: 4px;
  color: var(--k-text-3);
  font-size: 10px;
}

.edge {
  display: flex;
  gap: 8px;
  align-items: center;
  min-width: 0;
  margin-top: 7px;
  padding-top: 7px;
  border-top: 1px dashed var(--k-line);
}

.about {
  flex: 1 1 auto;
  min-width: 0;
}

.kind {
  display: block;
  color: var(--k-text-3);
  font-size: 10.5px;
  line-height: 1.3;
}

.title {
  display: block;
  overflow: hidden;
  font-size: 11.5px;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.meta {
  display: block;
  color: var(--k-text-3);
  font-size: 10.5px;
  line-height: 1.3;
}

.meta b {
  color: var(--k-text-2);
  font-weight: 600;
}
</style>
