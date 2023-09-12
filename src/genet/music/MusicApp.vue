<script setup lang="ts">
import { ref } from 'vue';

const filterQuery = ref<string>('');
const totalStreamingCount = ref<number>(0);
const matchedStreamingCount = ref<number>(0);
const streamingLoaded = ref<boolean>(false);
const streamingLoadFailed = ref<boolean>(false);
const streamingIsDetailPage = ref<boolean>(false);

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

function onChangeDetailState(isDetailPage: boolean) {
  streamingIsDetailPage.value = isDetailPage;
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
        <span v-if="streamingIsDetailPage">
          <span v-if="streamingLoadFailed">指定された配信が見つかりませんでした。</span>
          <RouterLink to="/">一覧に戻る</RouterLink>
        </span>
        <span v-else-if="streamingLoadFailed">配信情報を取得できませんでした。時間を置いてリロードしてください</span>
        <span v-else-if="!streamingLoaded"> 配信情報を読み込んでいます... </span>
        <span v-else-if="matchedStreamingCount === totalStreamingCount">
          {{ `${totalStreamingCount} 件の配信` }}
        </span>
        <span v-else>
          {{ `${totalStreamingCount} 件の配信から ${matchedStreamingCount} 件 見つかりました` }}
        </span>
      </div>
    </div>
    <div class="content">
      <Suspense>
        <RouterView
          :filterQuery="filterQuery"
          @updateFilter="onUpdateFilter"
          @loadStateChanged="onLoadStateChanged"
          @changeDetailState="onChangeDetailState"
        ></RouterView>
      </Suspense>
      <div class="horizon"></div>
      <div class="note">
        <ul>
          <li>
            <a href="https://www.kemov-project.com/" target="_blank"><strong>けものフレンズVプロジェクト</strong></a
            >所属のVTuber、<a href="https://www.youtube.com/@large-spottedgenet4617" target="_blank"
              ><strong>ジェネット</strong></a
            >の配信や動画で紹介・演奏された楽曲とその原曲をまとめています。（<a
              href="https://note.com/nanase_t/n/nd08ac5e1994c"
              target="_blank"
              >旧一覧ページ</a
            >）
          </li>
          <li>
            掲載内容についてのお問い合わせは
            <a href="https://github.com/nanase/kemov/issues" target="_blank">issue</a> までご連絡ください。
          </li>
          <li>このサイトはファンによる非公式のサイトです。</li>
        </ul>
      </div>
    </div>
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
      padding: 0;
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

  .content {
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
      padding: 0 0 15px;
      border-radius: 0;
    }
  }
}
</style>
