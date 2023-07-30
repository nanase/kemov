<script setup lang="ts">
import StreamingItem from '@/components/genet/StreamingItem.vue';
import { ref } from 'vue';
import InfiniteLoading from 'v3-infinite-loading';
import type { StateHandler } from 'v3-infinite-loading/lib/types';
import type { Streaming } from '@/types/genet';

import { load as loadYaml } from 'js-yaml';
import streamingYaml from './streaming.yml?raw';

const streamings = loadYaml(streamingYaml) as Streaming[];
const displayedStreamings = ref<Streaming[]>([]);
const ItemsPerLoaded = 100;

const load = async (state: StateHandler) => {
  if (displayedStreamings.value.length >= streamings.length) {
    state.complete();
  } else {
    const newItems = streamings.slice(
      displayedStreamings.value.length,
      displayedStreamings.value.length + ItemsPerLoaded,
    );
    displayedStreamings.value.push(...newItems);
    state.loading();
  }
};
</script>

<template>
  <div class="streaming-list">
    <TransitionGroup name="streaming-item">
      <StreamingItem v-for="streaming in displayedStreamings" :key="streaming.video.id" :data="streaming" />
    </TransitionGroup>
  </div>
  <InfiniteLoading @infinite="load">
    <template #complete>
      <span></span>
    </template>
  </InfiniteLoading>
</template>

<style lang="scss">
.streaming-item {
  &-enter-active,
  &-leave-active {
    transition: opacity 0.3s ease;
  }

  &-enter-from,
  &-leave-to {
    opacity: 0;
  }
}
</style>
