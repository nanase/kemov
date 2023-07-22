<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watchEffect } from 'vue';
import dayjs, { Dayjs } from 'dayjs';

const elapsedTime = ref<number>(Number.NaN);
const elapsedTimeUpdateInterval = ref<number>();
const props = defineProps<{
  time: Dayjs;
}>();

function readableElapsedTime() {
  if (elapsedTime.value >= 60) {
    return `${Math.floor(elapsedTime.value / 60)}分`;
  } else {
    return `${elapsedTime.value}秒`;
  }
}

function updateElapsedTime() {
  elapsedTime.value = dayjs().diff(props.time, 's');
}

onMounted(async () => {
  elapsedTimeUpdateInterval.value = setInterval(updateElapsedTime, 1000);
});

onBeforeUnmount(() => {
  clearInterval(elapsedTimeUpdateInterval.value);
});

watchEffect(() => {
  updateElapsedTime();
});
</script>

<template>
  <div v-if="time.isValid() && !Number.isNaN(elapsedTime)" class="update">
    {{ `最終更新: ${time.format('HH:mm:ss')} (${readableElapsedTime()}前)` }}
  </div>
</template>
