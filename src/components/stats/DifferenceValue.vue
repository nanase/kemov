<script setup lang="ts">
import { computed } from 'vue';
import { withCommas } from '@nanase/alnilam/number';

import { isFault, MISSING_TEXT, missingMark, type Difference } from '@/lib/difference';

/**
 * A change over a period, or a mark saying why there is none.
 *
 * The mark is not decoration. `nothing collected` means the statistics are not
 * being collected for that channel, and drawing it as an empty cell - which is
 * what a blank difference looks like, because a change of zero is drawn blank
 * too - would make a broken collector indistinguishable from a quiet day.
 */
const {
  difference,
  strong,
  positiveClass = ['text-positive'],
  negativeClass = ['text-negative'],
  strongClass = ['font-weight-bold'],
  tag = 'span',
} = defineProps<{
  difference: Difference;
  strong: number;
  positiveClass?: string[];
  negativeClass?: string[];
  strongClass?: string[];
  tag?: string;
}>();
const Tag = tag;

const classes = computed<string[]>(() => {
  if (difference.value === null) {
    return isFault(difference.reason) ? ['difference-missing', 'text-warning'] : ['difference-missing', 'opacity-60'];
  }

  if (difference.value === 0) return [''];
  if (difference.value >= strong) return [...positiveClass, ...strongClass];
  if (difference.value <= -strong) return [...negativeClass, ...strongClass];

  return difference.value > 0 ? [...positiveClass] : [...negativeClass];
});

const text = computed<string>(() => {
  if (difference.value === null) return missingMark(difference.reason);
  if (difference.value === 0) return '';

  return difference.value > 0 ? `+${withCommas(difference.value)}` : withCommas(difference.value);
});

/**
 * What the mark means, and - for a total - how much of it is missing.
 *
 * A total that left three channels out is still shown, because the other
 * eight are worth seeing. It says so here rather than being quietly small.
 */
const title = computed<string | undefined>(() => {
  if (difference.value === null) return MISSING_TEXT[difference.reason];
  if (difference.missing > 0) return `${difference.missing} チャンネルぶんを含んでいません`;

  return undefined;
});

/**
 * The same sentence, for somebody who is not looking at the screen.
 *
 * A tooltip is the only place the reason is written, so leaving it to the
 * pointer would put the whole point of this component - which kind of missing
 * this is - out of reach of a keyboard or a screen reader. The mark itself is
 * not read out: '!' and '—' mean nothing said aloud.
 */
const label = computed<string | undefined>(() =>
  title.value === undefined || difference.value === null ? title.value : `${text.value} ${title.value}`,
);
</script>

<template>
  <Tag :class="[...classes, difference.value !== null && difference.missing > 0 ? 'difference-partial' : '']">
    <template v-if="title">
      <span class="difference-explained" tabindex="0" role="note" :aria-label="label">
        {{ text }}<span v-if="difference.value !== null && difference.missing > 0" class="difference-mark">*</span>
        <v-tooltip activator="parent" open-on-focus location="top">{{ title }}</v-tooltip>
      </span>
    </template>
    <template v-else>{{ text }}</template>
  </Tag>
</template>

<style scoped lang="scss">
.difference-missing {
  font-weight: bold;
}

.difference-explained {
  cursor: help;
}

.difference-mark {
  font-size: 75%;
  vertical-align: super;
}
</style>
