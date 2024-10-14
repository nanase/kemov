<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { useIntervalFn } from '@vueuse/core';
import dayjs, { Dayjs } from '@nanase/alnilam/dayjs';

const { time, updateInterval = 1000 } = defineProps<{
  time: Dayjs;
  updateInterval?: number;
}>();

const elapsedTime = ref<number>(Number.NaN);
const readableElapsedTime = computed(() =>
  elapsedTime.value >= 60 ? `${Math.floor(elapsedTime.value / 60)}分` : `${elapsedTime.value}秒`,
);

function updateElapsedTime() {
  elapsedTime.value = dayjs().diff(time, 's');
}
useIntervalFn(updateElapsedTime, updateInterval);
watch(() => time, updateElapsedTime);
</script>

<template>
  <div class="update-time" v-if="time.isValid() && !Number.isNaN(elapsedTime)">
    <slot :readableElapsedTime>
      {{ readableElapsedTime }}
    </slot>
  </div>
</template>
