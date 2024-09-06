<script setup lang="ts">
import { ref, watch } from 'vue';

import { definePeriodicCall } from '@nanase/alnilam';
import dayjs, { Dayjs } from '@/lib/dayjs';
import { computed } from 'vue';

const { time } = defineProps<{
  time: Dayjs;
}>();

const elapsedTime = ref<number>(Number.NaN);
const readableElapsedTime = computed(() =>
  elapsedTime.value >= 60 ? `${Math.floor(elapsedTime.value / 60)}分` : `${elapsedTime.value}秒`,
);

async function updateElapsedTime() {
  elapsedTime.value = dayjs().diff(time, 's');
  return 1;
}
definePeriodicCall(updateElapsedTime);
watch(() => time, updateElapsedTime);
</script>

<template>
  <div class="update-time" v-if="time.isValid() && !Number.isNaN(elapsedTime)">
    {{ `${time.format('YYYY/MM/DD HH:mm:ss')} (${readableElapsedTime}前) 更新` }}
  </div>
</template>
