<script setup lang="ts">
import { withCommas } from '@nanase/alnilam/number';

const {
  value,
  strong,
  positiveClass = ['text-positive'],
  negativeClass = ['text-negative'],
  strongClass = ['font-weight-bold'],
  tag = 'span',
} = defineProps<{
  value: number;
  strong: number;
  positiveClass?: string[];
  negativeClass?: string[];
  strongClass?: string[];
  tag?: string;
}>();
const Tag = tag;

function formatDifference(value: number): string {
  if (value === 0) {
    return '';
  } else if (value > 0) {
    return `+${withCommas(value)}`;
  } else {
    return `${withCommas(value)}`;
  }
}

function getDifferenceClasses(value: number): string[] {
  if (value === 0) {
    return [''];
  } else if (value >= strong) {
    return [...positiveClass, ...strongClass];
  } else if (value <= -strong) {
    return [...negativeClass, ...strongClass];
  } else if (value > 0) {
    return [...positiveClass];
  } else {
    return [...negativeClass];
  }
}
</script>

<template>
  <Tag :class="getDifferenceClasses(value)">{{ formatDifference(value) }}</Tag>
</template>
