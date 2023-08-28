<script setup lang="ts">
import { ref, watch } from 'vue';
import InfiniteLoading from 'v3-infinite-loading';
import type { StateHandler } from 'v3-infinite-loading/lib/types';
import { load as loadYaml } from 'js-yaml';
import { StreamingSearch } from './search';
import axios from 'axios';

import type { Streaming } from '@/types/genet';
import StreamingItem from '@/components/genet/StreamingItem.vue';

const { filterQuery } = defineProps<{
  filterQuery: string;
}>();

const emit = defineEmits<{
  loadStateChanged: [loaded: boolean, errorOccurred: boolean];
  updateFilter: [total: number, matched: number];
}>();

emit('loadStateChanged', false, false);

const rawStreamings = loadYaml(
  await (async function () {
    if (import.meta.env.VITE_GENET_MUSIC_LIST_SUB_URL) {
      try {
        const responce = await axios.get<string>(import.meta.env.VITE_GENET_MUSIC_LIST_SUB_URL);
        console.info('This is development build. Fetched from sub url.');

        return responce.data;
      } catch (error) {
        if (import.meta.env.DEV) {
          console.info(
            `This is development build. Try to fetch from sub url, but fetching was failed caused by ${error}`,
          );
        }
      }
    }

    try {
      return (await axios.get<string>(import.meta.env.VITE_GENET_MUSIC_LIST_URL)).data;
    } catch (error) {
      emit('loadStateChanged', false, true);
      throw error;
    }
  })(),
) as Streaming[];

const streamings = ref<Streaming[]>([...rawStreamings]);
const displayedStreamings = ref<Streaming[]>([]);
const ItemsPerLoaded = 10;
const infiniteId = ref<number>(0);
const finishScore = ref<number>(0);
const streamingSearch = new StreamingSearch();

emit('updateFilter', rawStreamings.length, rawStreamings.length);
emit('loadStateChanged', true, false);

const load = async (state: StateHandler) => {
  if (displayedStreamings.value.length >= streamings.value.length) {
    finishScore.value = Math.floor(Math.random() * 5);
    state.complete();
  } else {
    const newItems = streamings.value.slice(
      displayedStreamings.value.length,
      displayedStreamings.value.length + ItemsPerLoaded,
    );
    displayedStreamings.value.push(...newItems);
    state.loading();
  }
};

watch(
  () => filterQuery,
  () => {
    if (filterQuery.length === 0) {
      streamings.value = [...rawStreamings];
    } else {
      streamings.value = streamingSearch.search(rawStreamings, filterQuery);
    }

    emit('updateFilter', rawStreamings.length, streamings.value.length);

    displayedStreamings.value = [];
    infiniteId.value = infiniteId.value + 1; // force-reset the InfiniteLoading
  },
);
</script>

<template>
  <div class="streaming-list">
    <TransitionGroup name="streaming-item">
      <StreamingItem v-for="streaming in displayedStreamings" :key="streaming.video.id" :data="streaming" />
    </TransitionGroup>
  </div>
  <InfiniteLoading :identifier="infiniteId" @infinite="load">
    <template #complete>
      <div class="finish-score" style="background-image: url('/kemov/genet/score0.svg')" v-if="finishScore === 0"></div>
      <div class="finish-score" style="background-image: url('/kemov/genet/score1.svg')" v-if="finishScore === 1"></div>
      <div class="finish-score" style="background-image: url('/kemov/genet/score2.svg')" v-if="finishScore === 2"></div>
      <div class="finish-score" style="background-image: url('/kemov/genet/score3.svg')" v-if="finishScore === 3"></div>
      <div class="finish-score" style="background-image: url('/kemov/genet/score4.svg')" v-if="finishScore === 4"></div>
    </template>
  </InfiniteLoading>
</template>

<style lang="scss">
@use '@/style/media';

.streaming-list {
  width: 85%;
  margin: 20px auto;
  padding: 15px 35px;
  border-radius: 10px;
  background-color: white;

  @include media.size(lg) {
    width: 815px;
  }

  @include media.size(md) {
    width: 85%;
  }

  @include media.size(sm) {
    width: 100%;
    padding: 15px 0;
  }

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
}
</style>
