<script setup lang="ts">
import { ref, onMounted } from 'vue';

import { url } from '@/lib/style';

const MaxScore = 5;
const finishScore = ref<number>(0);

function getImageUrl(index: number) {
  // A plain root-absolute path rather than `new URL(..., import.meta.url)`:
  // that pattern asks vite to resolve the asset at build time, and vite 8
  // resolves `/genet/music/` (already root-absolute) against the built
  // file's own URL in a way that leaves a doubled slash in the result.
  // `base` is `/`, so the site's root is also the server's root, and this
  // string needs no resolving.
  return `/genet/music/score${index}.svg`;
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
