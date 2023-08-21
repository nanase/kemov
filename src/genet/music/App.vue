<script setup lang="ts">
import { ref } from 'vue';
import InfiniteLoading from 'v3-infinite-loading';
import type { StateHandler } from 'v3-infinite-loading/lib/types';
import { load as loadYaml } from 'js-yaml';

import type { Streaming } from '@/types/genet';
import StreamingItem from '@/components/genet/StreamingItem.vue';

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
@use '@/style/media';

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

.content,
.search-box {
  width: 85%;
  margin: 20px auto;
  padding: 15px 35px;
  border-radius: 10px;

  @include media.size(lg) {
    width: 815px;
  }

  @include media.size(md) {
    width: 85%;
  }

  @include media.size(sm) {
    width: 100%;
    padding: 0;
  }
}

.content {
  background-color: white;
}
</style>
