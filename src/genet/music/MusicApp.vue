<script setup lang="ts">
import { ref } from 'vue';
import InfiniteLoading from 'v3-infinite-loading';
import type { StateHandler } from 'v3-infinite-loading/lib/types';
import { load as loadYaml } from 'js-yaml';
import { StreamingSearch } from './search';

import type { Streaming } from '@/types/genet';
import StreamingItem from '@/components/genet/StreamingItem.vue';

import streamingYaml from './streaming.yml?raw';

const rawStreamings = loadYaml(streamingYaml) as Streaming[];

const streamings = ref<Streaming[]>([...rawStreamings]);
const displayedStreamings = ref<Streaming[]>([]);
const ItemsPerLoaded = 10;
const infiniteId = ref<number>(0);
const finishScore = ref<number>(0);
const streamingSearch = new StreamingSearch();

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

function updateSearchQuery(e: Event) {
  if (!(e.target instanceof HTMLInputElement)) return;

  const query = e.target.value;

  if (query.length === 0) {
    streamings.value = [...rawStreamings];
  } else {
    streamings.value = streamingSearch.search(rawStreamings, query);
  }

  displayedStreamings.value = [];
  infiniteId.value = infiniteId.value + 1; // force-reset the InfiniteLoading
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
      <div class="result-count" v-show="streamings != null">
        <span v-if="streamings.length === rawStreamings.length">
          {{ `${rawStreamings.length} 件の配信` }}
        </span>
        <span v-else>
          {{ `${rawStreamings.length} 件の配信から ${streamings.length} 件 見つかりました` }}
        </span>
      </div>
    </div>
    <div class="content">
      <div class="streaming-list">
        <TransitionGroup name="streaming-item">
          <StreamingItem v-for="streaming in displayedStreamings" :key="streaming.video.id" :data="streaming" />
        </TransitionGroup>
      </div>
      <InfiniteLoading :identifier="infiniteId" @infinite="load">
        <template #complete>
          <div
            class="finish-score"
            style="background-image: url('/kemov/genet/score0.svg')"
            v-if="finishScore === 0"
          ></div>
          <div
            class="finish-score"
            style="background-image: url('/kemov/genet/score1.svg')"
            v-if="finishScore === 1"
          ></div>
          <div
            class="finish-score"
            style="background-image: url('/kemov/genet/score2.svg')"
            v-if="finishScore === 2"
          ></div>
          <div
            class="finish-score"
            style="background-image: url('/kemov/genet/score3.svg')"
            v-if="finishScore === 3"
          ></div>
          <div
            class="finish-score"
            style="background-image: url('/kemov/genet/score4.svg')"
            v-if="finishScore === 4"
          ></div>
          <div class="horizon"></div>
          <div class="note">
            <ul>
              <li>
                このサイトは非公式です。お問い合わせは
                <a href="https://github.com/nanase/kemov/issues" target="_blank">issue</a> までご連絡ください。
              </li>
            </ul>
          </div>
        </template>
      </InfiniteLoading>
    </div>
  </div>
</template>

<style lang="scss">
@use '@/style/media';

.music-app {
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
      padding: 15px 0;
    }
  }

  .content {
    background-color: white;
  }

  .search-box {
    text-align: center;

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
