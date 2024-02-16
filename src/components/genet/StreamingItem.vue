<script setup lang="ts">
import { computed, ref } from 'vue';

import MarkDown from '@/components/genet/MarkDown.vue';
import StreamingItemVerifier from '@/components/genet/StreamingItemVerifier.vue';
import VideoEmbed from '@/components/genet/VideoEmbed.vue';
import VideoLink from '@/components/genet/VideoLink.vue';

import { getThumbnailURL, getWatchURL } from '@/lib/youtube';
import { JST, toDateTimeText } from '@/lib/dayjs';
import { url } from '@/lib/style';
import { videoTypeToString, type Streaming, type Video, type EmbeddedVideo } from '@/type/genet/music';

const { data } = defineProps<{
  data: Streaming;
}>();

const thumbnailUrlCss = computed(() =>
  data.video.variety ? url() : url(getThumbnailURL(data.video.id, { size: 'hq' })),
);
const isDev = import.meta.env.DEV;
const parentMedia = ref<Video>();
const targetMedia = ref<EmbeddedVideo>();

function insertBreakToName(name: string) {
  const regex = name.match(/((?:\[[^\]]*\])|(?:【[^】]*】)*)([^[【]*)((?:\[[^\]]*\])|(?:【[^】]*】)*)/);

  if (regex) {
    return `${regex[1]}\n${regex[2]}\n${regex[3]}`.trim();
  } else {
    return name;
  }
}

function setEmbedVideo(parentVideo?: Video, targetVideo?: EmbeddedVideo): void {
  parentMedia.value = parentVideo;
  targetMedia.value = targetVideo;
}
</script>

<template>
  <div class="streaming-item">
    <StreamingItemVerifier v-if="isDev" :data="data" />
    <div class="header">
      <VideoLink
        class="video-thumbnail"
        v-if="!data.video.variety"
        :video="data.video"
        :title="data.shortname ?? data.name"
      />
      <a
        class="video-name"
        :href="data.video.variety ? data.video.id : getWatchURL(data.video.id)"
        target="_blank"
        :title="data.name"
      >
        {{ insertBreakToName(data.shortname ?? data.name) }}
      </a>
      <div class="published-at">
        {{ `${toDateTimeText(data.video.publishedAt, JST)} ${videoTypeToString(data.video.type)}` }}
      </div>
      <div class="categories">
        <div class="category" v-for="category in data.categories" :key="category">
          {{ category }}
        </div>
      </div>
    </div>
    <Transition name="media">
      <div class="media-box" v-if="parentMedia === data.video && targetMedia != null">
        <VideoEmbed :video="targetMedia"></VideoEmbed>
        <div class="close" @click="setEmbedVideo()">閉じる</div>
      </div>
    </Transition>
    <ul class="tunes">
      <li class="tune" v-for="tune in data.tunes" :key="tune.title">
        <div class="tune-content">
          <div class="tune-title">
            <MarkDown class="title" :source="tune.title" />
            <MarkDown class="original-title" v-if="tune.originalTitle != null" :source="tune.originalTitle" />
          </div>
          <MarkDown
            v-for="attribute in tune.attributes"
            :key="attribute.name"
            class="attribute"
            :source="`${attribute.name}${attribute.noSeparator ? '' : ' : '}${attribute.text}`"
          />
          <MarkDown
            class="description"
            :source="tune.description"
            v-if="tune.description"
            @clickWatchButton="(id, position) => setEmbedVideo(data.video, { id, position })"
          />
        </div>
        <div
          class="media-button video"
          v-for="video in tune.videos"
          :key="video.id"
          @click="setEmbedVideo(data.video, video)"
          v-tooltip.auto-end="video.description ? `動画を視聴する: ${video.description}` : '動画を視聴する'"
        ></div>
        <a
          class="media-button reference"
          v-for="reference in tune.references"
          :key="reference.link"
          :href="reference.link"
          :alt="reference.title"
          target="_blank"
          v-tooltip.auto-end="`IMSLPへのリンク: ${reference.title}`"
        >
        </a>
      </li>
    </ul>
  </div>
</template>

<style lang="scss" scoped>
.streaming-item {
  .header::before {
    background-image: v-bind('thumbnailUrlCss');
  }
}
</style>

<style lang="scss">
@use '@/style/media';

.streaming-item {
  box-shadow: 0 4px 20px rgba($color: #020202, $alpha: 30%);
  border-radius: 10px;
  margin: 20px 0 50px;

  @include media.size(sm) {
    border-radius: 0;
    margin: 20px 0 40px;
  }

  &-enter-active,
  &-leave-active {
    transition: opacity 0.3s ease;
  }

  &-enter-from,
  &-leave-to {
    opacity: 0;
  }

  .header {
    color: #fff;
    position: relative;
    overflow: hidden;
    z-index: 0;
    border-radius: 10px 10px 0 0;
    padding: 10px;
    background-color: #3a3b3d;

    &::before {
      content: '';
      position: absolute;
      inset: -10px;
      z-index: -1;
      background-position: center center;
      background-repeat: no-repeat;
      background-size: cover;
      filter: blur(4px) brightness(40%);
    }

    @include media.size(sm) {
      border-radius: 0;
    }
  }

  .video-thumbnail {
    display: block;
    width: 400px;
    margin: 10px auto 15px;
    border-radius: 5px;
    transform: scale(1);
    box-shadow: 0 0 5px rgba($color: #fff, $alpha: 80%);
    transition:
      transform 0.3s,
      box-shadow 0.3s 0.2s;

    &:hover {
      transform: scale(1.05);
      box-shadow: 0 0 5px 2px rgba($color: #fff, $alpha: 80%);
    }

    @include media.size(md) {
      width: 320px;
    }

    @include media.size(sm) {
      width: 240px;
    }
  }

  .video-name {
    display: block;
    font-weight: bold;
    font-size: 125%;
    text-align: center;
    white-space: pre-line;
    color: #fff;
    text-decoration: none;
  }

  .published-at {
    text-align: center;
    font-size: 90%;
    line-height: 200%;
  }

  .categories {
    text-align: center;
  }

  .category {
    display: inline-block;
    font-size: 75%;
    border: 1px solid #bf9593;
    border-radius: 5px;
    margin: 2px;
    padding: 2px 5px;
  }

  .tunes {
    padding: 0.5em 1em;
    margin-block: 0.5em;
  }

  .tune {
    display: flex;
    margin-bottom: 10px;
    list-style: none;
    padding: 0 10px 0 25px;
    background-image: url('/genet/music/note.svg');
    background-repeat: no-repeat;
    background-position: 2px 6px;
    background-size: 12px;

    @include media.size(sm) {
      padding: 0 8px 0 24px;
      background-position: 0 4px;
    }
  }

  .tune-content {
    flex: 1;

    .tune-title {
      display: block;
      font-weight: bold;
      word-break: break-all;

      @include media.size(md) {
        word-break: inherit;
      }
    }

    .title {
      margin-right: 0.5em;
      word-break: keep-all;
      display: block;

      @include media.size(md) {
        word-break: inherit;
      }
    }

    .original-title {
      font-family: Roboto, 'IBM Plex Sans JP', sans-serif;
      font-style: italic;
      font-size: 90%;
      word-break: keep-all;
      display: block;
      margin-bottom: 0.3em;

      @include media.size(md) {
        word-break: inherit;
      }
    }

    .attribute {
      display: block;
      font-size: 90%;
    }

    .description {
      display: block;
      font-size: 90%;
    }
  }

  .media-box {
    .close {
      text-align: center;
      background-color: #232425;
      cursor: pointer;
      color: #fff;
      padding: 2.5px;

      &:hover {
        background-color: #3a3b3d;
      }
    }
  }

  .media-button {
    width: 36px;
    height: 36px;
    margin: 0 5px;
    cursor: pointer;
    background-repeat: no-repeat;
    background-size: 100%;
    background-position: center center;
    transition:
      background-size 0.3s,
      filter 0.3s;
    border-radius: 10px;

    &.video {
      filter: saturate(20%) brightness(2);
      background-image: url('/genet/music/video.svg');
    }

    &.reference {
      filter: saturate(20%) brightness(5);
      background-image: url('/genet/music/imslp.svg');
    }

    &:hover {
      background-size: 175%;
      filter: saturate(100%) brightness(1);
    }

    @include media.size(sm) {
      width: 30px;
      height: 30px;
      margin: 0 3px;
    }
  }

  .media {
    &-enter-active,
    &-leave-active {
      overflow: hidden;
      max-height: 100vh;
      transition: all 0.5s;
    }

    &-enter-from,
    &-leave-to {
      opacity: 0;
      max-height: 0;
      overflow: hidden;
    }
  }
}
</style>
