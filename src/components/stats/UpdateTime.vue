<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from 'vue';
import dayjs, { Dayjs } from 'dayjs';

const { time } = defineProps<{
  time: Dayjs;
}>();

const elapsedTime = ref<number>(Number.NaN);
const elapsedTimeUpdateInterval = ref<number>();

function readableElapsedTime() {
  if (elapsedTime.value >= 60) {
    return `${Math.floor(elapsedTime.value / 60)}分`;
  } else {
    return `${elapsedTime.value}秒`;
  }
}

function updateElapsedTime() {
  elapsedTime.value = dayjs().diff(time, 's');
}

onMounted(async () => {
  elapsedTimeUpdateInterval.value = setInterval(updateElapsedTime, 1000);
});

onBeforeUnmount(() => {
  clearInterval(elapsedTimeUpdateInterval.value);
});

watch(() => time, updateElapsedTime);
</script>

<template>
  <div class="update-time" v-if="time.isValid() && !Number.isNaN(elapsedTime)">
    {{ `${time.format('YYYY/MM/DD HH:mm:ss')} (${readableElapsedTime()}前) 更新` }}
  </div>
</template>
