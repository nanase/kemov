<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue';
import dayjs, { Dayjs } from 'dayjs';

const elapsedTime = ref<number>(0);

const props = defineProps<{
  time: Dayjs;
}>();

const elapsedTimeUpdateInterval = ref<number>();

function readableElapsedTime() {
  if (elapsedTime.value >= 60) {
    return `${Math.floor(elapsedTime.value / 60)}分`;
  } else {
    return `${elapsedTime.value}秒`;
  }
}

onMounted(async () => {
  elapsedTimeUpdateInterval.value = setInterval(() => {
    elapsedTime.value = dayjs().diff(props.time, 's');
  }, 1000);
});

onBeforeUnmount(() => {
  clearInterval(elapsedTimeUpdateInterval.value);
});
</script>

<template>
  <div class="update">
    {{ `最終更新: ${time.format('HH:mm:ss')} (${readableElapsedTime()}前)` }}
  </div>
</template>
