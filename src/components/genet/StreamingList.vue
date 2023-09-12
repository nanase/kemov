<script setup lang="ts">
import { ref, watch } from 'vue';
import InfiniteLoading from 'v3-infinite-loading';
import type { StateHandler } from 'v3-infinite-loading/lib/types';
import { load as loadYaml } from 'js-yaml';
import { StreamingSearch } from './search';
import axios from 'axios';

import type { Streaming } from '@/types/genet';
import StreamingItem from '@/components/genet/StreamingItem.vue';
import FinishScore from './FinishScore.vue';

const { filterQuery, videoId } = defineProps<{
  filterQuery: string;
  videoId?: string;
}>();

const emit = defineEmits<{
  loadStateChanged: [loaded: boolean, errorOccurred: boolean];
  updateFilter: [total: number, matched: number];
  changeDetailState: [isDetailPage: boolean];
}>();

emit('loadStateChanged', false, false);

const rawStreamings = loadYaml(
  await (async function () {
    if (import.meta.env.DEV && import.meta.env.VITE_GENET_MUSIC_LIST_SUB_URL) {
      try {
        const responce = await axios.get<string>(import.meta.env.VITE_GENET_MUSIC_LIST_SUB_URL);
        console.info('This is development build. Fetched from sub url.');

        return responce.data;
      } catch (error) {
        console.info(
          `This is development build. Try to fetch from sub url, but fetching was failed caused by ${error}`,
        );
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
const streamingSearch = new StreamingSearch();
const finishScore = ref<InstanceType<typeof FinishScore>>();

emit('updateFilter', rawStreamings.length, rawStreamings.length);

const load = async (state: StateHandler) => {
  if (videoId) {
    const item = streamings.value.find((s) => s.video.id === decodeURIComponent(videoId));

    if (item) {
      displayedStreamings.value.push(item);
      emit('loadStateChanged', true, false);
    } else {
      emit('loadStateChanged', true, true);
    }

    emit('changeDetailState', true);
    finishScore.value?.updateScore();
    state.complete();
    return;
  }

  emit('loadStateChanged', true, false);

  if (displayedStreamings.value.length >= streamings.value.length) {
    state.complete();
  } else {
    const newItems = streamings.value.slice(
      displayedStreamings.value.length,
      displayedStreamings.value.length + ItemsPerLoaded,
    );

    emit('changeDetailState', false);
    displayedStreamings.value.push(...newItems);
    finishScore.value?.updateScore();
    state.loading();
  }
};

function clearDisplayedStreaming() {
  displayedStreamings.value = [];
  infiniteId.value = infiniteId.value + 1; // force-reset the InfiniteLoading
}

watch(
  () => filterQuery,
  () => {
    if (filterQuery.length === 0) {
      streamings.value = [...rawStreamings];
    } else {
      streamings.value = streamingSearch.search(rawStreamings, filterQuery);
    }

    emit('updateFilter', rawStreamings.length, streamings.value.length);
    clearDisplayedStreaming();
  },
);

watch(() => videoId, clearDisplayedStreaming);
</script>

<template>
  <div class="streaming-list">
    <TransitionGroup name="streaming-item">
      <StreamingItem v-for="streaming in displayedStreamings" :key="streaming.video.id" :data="streaming" />
    </TransitionGroup>
    <InfiniteLoading :identifier="infiniteId" @infinite="load">
      <template #complete>
        <FinishScore ref="finishScore"></FinishScore>
      </template>
    </InfiniteLoading>
  </div>
</template>

<style lang="scss">
@use '@/style/media';

.streaming-list {
  .finish-score {
    width: calc(100% - 80px);
    max-width: 400px;
    height: 80px;
    margin: 40px auto;
    padding: 40px 0;

    @include media.size(md) {
      height: 66px;
    }
  }
}
</style>
