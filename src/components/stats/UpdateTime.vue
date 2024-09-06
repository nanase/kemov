<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { useIntervalFn } from '@vueuse/core';
import dayjs, { Dayjs } from '@/lib/dayjs';

const { time } = defineProps<{
  time: Dayjs;
}>();

const elapsedTime = ref<number>(Number.NaN);
const readableElapsedTime = computed(() =>
  elapsedTime.value >= 60 ? `${Math.floor(elapsedTime.value / 60)}分` : `${elapsedTime.value}秒`,
);

function updateElapsedTime() {
  elapsedTime.value = dayjs().diff(time, 's');
}
useIntervalFn(updateElapsedTime, 1000);
watch(() => time, updateElapsedTime);
</script>

<template>
  <div class="update-time" v-if="time.isValid() && !Number.isNaN(elapsedTime)">
    {{ `${time.format('YYYY/MM/DD HH:mm:ss')} (${readableElapsedTime}前) 更新` }}
  </div>
</template>
