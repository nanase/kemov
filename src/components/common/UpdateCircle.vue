<script setup lang="ts">
import { Dayjs } from '@nanase/alnilam/dayjs';
import { useElapsedTime } from '@nanase/alnilam/use';

const {
  time,
  updateInterval = 2000,
  greenSeconds = 60,
  yellowSeconds = 60 * 5,
  greenClass = 'green-darken-2',
  yellowClass = 'yellow-darken-3',
  redClass = 'red-darken-3',
} = defineProps<{
  time: Dayjs;
  updateInterval?: number;
  greenSeconds?: number;
  yellowSeconds?: number;
  greenClass?: string;
  yellowClass?: string;
  redClass?: string;
}>();

const elapsedTime = useElapsedTime(
  () => time,
  () => updateInterval,
);

function circleColor(): string {
  if (elapsedTime.value < greenSeconds) {
    return greenClass;
  }

  if (elapsedTime.value < yellowSeconds) {
    return yellowClass;
  }

  return redClass;
}

function circleProgress(): number {
  if (elapsedTime.value < greenSeconds) {
    return elapsedTime.value * (100 / greenSeconds);
  }

  if (elapsedTime.value < yellowSeconds) {
    return 100 - (elapsedTime.value - greenSeconds) * (100 / yellowSeconds);
  }

  return 100;
}
</script>

<template>
  <v-progress-circular :color="circleColor()" :model-value="circleProgress()" :size="12" :width="6" />
</template>
