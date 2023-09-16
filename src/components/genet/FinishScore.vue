<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { url } from '@/lib/style';

const MaxScore = 5;
const finishScore = ref<number>(0);

function getImageUrl(index: number) {
  // return new URL(`/genet/music/score${index}.svg`, import.meta.url).href;

  // This code is intended to avoid incorrect replacement.
  // see: https://github.com/vitejs/vite/issues/11157
  const directory = new URL(`/genet/music/`, import.meta.url).href;
  return `${directory}/score${index}.svg`;
}

function updateScore() {
  finishScore.value = Math.floor(Math.random() * MaxScore);
}

defineExpose({ updateScore });
onMounted(updateScore);
</script>

<template>
  <div class="finish-score" :style="{ backgroundImage: url(getImageUrl(finishScore)) }"></div>
</template>

<style lang="scss">
.finish-score {
  background-repeat: no-repeat;
  background-position: center center;
  background-size: contain;
}
</style>
