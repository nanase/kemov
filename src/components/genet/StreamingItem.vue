<script setup lang="ts">
import { type Streaming, type VideoType, type Video, type EmbeddedVideo } from '@/types/genet';
import { getThumbnailURL, getWatchURL } from '@/lib/youtube';
import { JST, toDateTimeText } from '@/lib/date';
import VideoLink from '@/components/VideoLink.vue';
import VideoEmbed from '@/components/VideoEmbed.vue';
import MarkDown from '@/components/MarkDown.vue';
import StreamingItemVerifier from '@/components/genet/StreamingItemVerifier.vue';
import { computed, ref } from 'vue';

const { data } = defineProps<{
  data: Streaming;
}>();

const thumbnailUrlCss = computed(() => {
  if (data.video.variety) {
    return "url('')";
  }
  return `url('${getThumbnailURL(data.video.id, { size: 'hq' })}`;
});
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

function videoTypeToString(type: VideoType): string {
  switch (type) {
    case 'live':
      return 'ライブ配信';
    case 'video':
      return '動画投稿';
    case 'short':
      return 'ショート投稿';
    default:
      return '投稿';
  }
}

function setEmbedVideo(parentVideo?: Video, targetVideo?: EmbeddedVideo): void {
  parentMedia.value = parentVideo;
  targetMedia.value = targetVideo;
}

function clickWatchLinkHandler(id: string, position?: number): void {
  setEmbedVideo(data.video, { id, position });
}
</script>

<template>
  <div class="streaming-item">
    <StreamingItemVerifier v-if="isDev" :data="data" />
    <div class="header">
      <div class="thumbnail" v-if="!data.video.variety">
        <VideoLink class="streaming-thumbnail" :video="data.video" :title="data.shortname ?? data.name" />
      </div>
      <div class="name">
        <a :href="data.video.variety ? data.video.id : getWatchURL(data.video.id)" target="_blank" :title="data.name">
          {{ insertBreakToName(data.shortname ?? data.name) }}
        </a>
      </div>
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
    <div class="tunes">
      <ul>
        <li class="tune" v-for="tune in data.tunes" :key="tune.title">
          <div class="tune-flex">
            <div class="tune-box">
              <div class="title-box">
                <MarkDown class="title" :source="tune.title" :inline="true" />
                <MarkDown class="original-title" v-if="tune.originalTitle != null" :source="tune.originalTitle" />
              </div>
              <span class="attribute" v-for="attribute in tune.attributes" :key="attribute.name">
                <span>{{ attribute.name }}: </span>
                <MarkDown :source="attribute.text" />
              </span>
              <MarkDown
                class="description"
                :source="tune.description"
                v-if="tune.description"
                @clickWatchLink="clickWatchLinkHandler"
              />
            </div>
            <div v-for="video in tune.videos" :key="video.id">
              <div
                class="media-button video"
                @click="setEmbedVideo(data.video, video)"
                v-tooltip.auto-end="video.description ? `動画を視聴する: ${video.description}` : '動画を視聴する'"
              ></div>
            </div>
            <div v-for="reference in tune.references" :key="reference.link">
              <a
                :href="reference.link"
                target="_blank"
                :alt="reference.title"
                v-tooltip.auto-end="`IMSLPへのリンク: ${reference.title}`"
              >
                <div class="media-button reference"></div>
              </a>
            </div>
          </div>
        </li>
      </ul>
    </div>
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

  .thumbnail {
    width: 400px;
    margin: 10px auto;

    @include media.size(md) {
      width: 320px;
    }

    @include media.size(sm) {
      width: 240px;
    }
  }

  .streaming-thumbnail {
    width: 400px;
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

  .name {
    font-weight: bold;
    font-size: 125%;
    text-align: center;
    white-space: pre-line;

    a {
      color: #fff;
      text-decoration: none;
    }
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

    ul {
      padding-inline-start: 0;
      margin-block: 0.5em;
    }

    a,
    a:visited,
    a:hover {
      color: inherit;
    }
  }

  .tune {
    margin-bottom: 10px;
    list-style: none;
    padding: 0 10px 0 25px;
    background-image: url('/genet/music/note.svg');
    background-repeat: no-repeat;
    background-position: 2px 6px;
    background-size: 12px;

    @include media.size(sm) {
      padding: 0 16px 0 24px;
      background-position: 0 4px;
    }
  }

  .tune-flex {
    display: flex;
  }

  .tune-box {
    flex: 1;

    .title-box {
      display: block;
      font-weight: bold;
      word-break: break-all;
    }

    .title {
      margin-right: 0.5em;
      word-break: keep-all;
      display: block;
    }

    .original-title {
      font-family: Roboto, 'IBM Plex Sans JP', sans-serif;
      font-style: italic;
      font-size: 90%;
      word-break: keep-all;
      display: block;
      margin-bottom: 0.3em;
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

  .yt-link {
    @mixin icon($bdcolor, $bgcolor, $ntcolor) {
      background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 205.52 165.45"><path fill="#{$bgcolor}" stroke="#{$bdcolor}" stroke-linecap="round" stroke-linejoin="round" stroke-width="7.5" d="M71.616 3.75h102.35a27.74 27.74 0 0 1 27.8 27.8V133.9a27.74 27.74 0 0 1-27.8 27.8H71.616a27.74 27.74 0 0 1-27.8-27.8v-9.944L3.75 107.679l40.066-15.526V31.55a27.74 27.74 0 0 1 27.8-27.8z"/><path fill="#{$ntcolor}" d="m124.876 24.91-11.371 63.076c-5.959-.413-19.357-6.448-37.816.952-12.375 6.58-18.42 16.127-16.571 29.377 2.188 5.916 1.392 18.935 30.145 23.171 23.149 2.999 29.44-7.381 34.593-18.666 5.405-14.96 4.523-40.814 7.683-60.426 1.596-7.164 5.825-17.198 21.914-17.959 8.861.552 17.458 9.963 18.947 15.203.919 7.27-1.28 13.116-4.032 15.978-4.596 2.98-9.173 4.728-13.682 2.171-2.094-2.554-5.35-4.45-2.999-9.522 1.162-1.697 2.21-3.448 6.532-3.605 2.313-.86 3.393-2.555 2.186-5.799-2.137-1.943-3.596-4.302-9.455-3.967-6.566 1.16-8.857 5.441-9.896 10.511-1.233 7.343-.339 18.249 8.107 23.882 6.33 3.188 13.673 3.745 22.744-.174 7.242-3.924 9.686-9.907 12.61-15.686 2-5.631 5.257-19.185-3.567-26.774-6.347-5.969-11.488-12.174-27.07-14.48-4.56-.182-9.668.186-16.734 2.52 1.972-4.736 1.38-7.86-1.776-9.372-1.552-1.025-3.026-1.486-4.49-1.857-5.656-.21-5.285.72-6 1.446z"/></svg>');
    }

    @include icon('%231e1e1e', '%23ffffff', '%231e1e1e');

    cursor: pointer;
    background-repeat: no-repeat;
    background-size: 100%;
    background-position: center center;
    width: 20px;
    height: 1.2em;
    border: none;
    background-color: inherit;
    margin: 0 2px;
    transition: transform 0.3s;

    &:hover {
      @include icon('%23ea3223', '%23ea3223', '%23ffffff');

      transform: scale(1.25);
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
