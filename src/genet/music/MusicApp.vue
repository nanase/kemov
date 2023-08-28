<script setup lang="ts">
import { ref } from 'vue';

import StreamingList from '@/components/genet/StreamingList.vue';

const filterQuery = ref<string>('');
const totalStreamingCount = ref<number>(0);
const matchedStreamingCount = ref<number>(0);
const streamingLoaded = ref<boolean>(false);
const streamingLoadFailed = ref<boolean>(false);

function updateSearchQuery(e: Event) {
  if (!(e.target instanceof HTMLInputElement)) return;

  filterQuery.value = e.target.value;
}

function onUpdateFilter(total: number, matched: number) {
  totalStreamingCount.value = total;
  matchedStreamingCount.value = matched;
}

function onLoadStateChanged(loaded: boolean, errorOccurred: boolean) {
  streamingLoaded.value = loaded;
  streamingLoadFailed.value = errorOccurred;
}
</script>

<template>
  <div class="music-app">
    <div class="search-box">
      <div class="keyword">
        <label class="label" for="keyword">キーワード検索</label>
        <input
          class="input"
          type="search"
          id="keyword"
          placeholder="動画名、曲名、作曲者名など…"
          @change="updateSearchQuery"
        />
      </div>
      <div class="result-count" v-show="filterQuery != null">
        <span v-if="streamingLoadFailed">配信情報を取得できませんでした。時間を置いてリロードしてください</span>
        <span v-else-if="!streamingLoaded"> 配信情報を読み込んでいます... </span>
        <span v-else-if="matchedStreamingCount === totalStreamingCount">
          {{ `${totalStreamingCount} 件の配信` }}
        </span>
        <span v-else>
          {{ `${totalStreamingCount} 件の配信から ${matchedStreamingCount} 件 見つかりました` }}
        </span>
      </div>
    </div>
    <Suspense>
      <StreamingList
        :filterQuery="filterQuery"
        @updateFilter="onUpdateFilter"
        @loadStateChanged="onLoadStateChanged"
      ></StreamingList>
      <!-- <template #fallback>読み込んでいます...</template> -->
    </Suspense>
  </div>
</template>

<style lang="scss">
@use '@/style/media';

.music-app {
  .search-box {
    width: 85%;
    margin: 20px auto;
    padding: 15px 35px;
    border-radius: 10px;
    text-align: center;

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

    .input {
      padding: 10px;
      margin-left: 20px;
      width: 50%;
      background-color: #d3d6da;
      border: none;
      border-radius: 5px;
    }

    .result-count {
      margin-top: 1em;
    }
  }

  .finish-score {
    background-repeat: no-repeat;
    background-position: center center;
    background-size: contain;
    width: 100%;
    height: 80px;
    margin: 80px 0 50px;

    @include media.size(md) {
      height: 66px;
    }
  }
}
</style>
