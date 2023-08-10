<script setup lang="ts">
import { type Streaming, type VideoType } from '@/types/genet';
import { getThumbnailURL, getWatchURL } from '@/lib/youtube';
import VideoLink from '@/components/VideoLink.vue';
import VideoEmbed from '@/components/VideoEmbed.vue';
import MarkDown from '@/components/MarkDown.vue';
import StreamingItemVerifier from '@/components/genet/StreamingItemVerifier.vue';
import { computed, ref } from 'vue';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import 'dayjs/locale/ja';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.tz.setDefault('Asia/Tokyo');
dayjs.locale('ja');

const props = defineProps<{
  data: Streaming;
}>();

const thumbnailUrl = computed(() => {
  if (props.data.video.variety) {
    return '';
  }
  return getThumbnailURL(props.data.video.id, { size: 'hq' });
});
const thumbnailUrlCss = `url('${thumbnailUrl.value}')`;
const isDev = import.meta.env.DEV;
const parentMedia = ref<string>();
const targetMedia = ref<string>();
const mediaPosition = ref<number>();

function insertBreakToName(name: string) {
  const regex = name.match(/((?:\[[^\]]*\])|(?:【[^】]*】)*)([^[【]*)((?:\[[^\]]*\])|(?:【[^】]*】)*)/);

  if (regex) {
    return `${regex[1]}\n${regex[2]}\n${regex[3]}`.trim();
  } else {
    return name;
  }
}

function toDateTimeString(datetime: string): string {
  const day = dayjs(datetime).tz();

  if (day.isValid()) {
    if (datetime.indexOf(':') !== -1) {
      return day.format('YYYY/MM/DD (ddd) HH:mm');
    } else {
      return day.format('YYYY/MM/DD (ddd)');
    }
  } else {
    return datetime;
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

function setEmbedVideo(parentVideoId?: string, targetVideoId?: string, position?: number): void {
  parentMedia.value = parentVideoId;
  targetMedia.value = targetVideoId;
  mediaPosition.value = position;
}
</script>

<template>
  <div class="streaming-item">
    <StreamingItemVerifier v-if="isDev" :data="props.data" />
    <div class="header">
      <div class="thumbnail" v-if="!data.video.variety">
        <VideoLink class="streaming-thumbnail" :video-id="data.video.id" :video-title="data.video.title" />
      </div>
      <div class="name">
        <a :href="data.video.variety ? data.video.id : getWatchURL(data.video.id)" target="_blank" :alt="data.name">
          {{ insertBreakToName(data.shortname ?? data.name) }}
        </a>
      </div>
      <div class="published-at">
        {{ `${toDateTimeString(data.video.publishedAt)} ${videoTypeToString(data.video.type)}` }}
      </div>
      <div class="categories">
        <div class="category" v-for="category in data.categories" :key="category">
          {{ category }}
        </div>
      </div>
    </div>
    <Transition name="media">
      <div class="media-box" v-if="parentMedia === data.video.id && targetMedia != null">
        <VideoEmbed :video-id="targetMedia" :position="mediaPosition"></VideoEmbed>
        <div class="close" @click="setEmbedVideo()">閉じる</div>
      </div>
    </Transition>
    <div class="tunes">
      <ul>
        <li class="tune" v-for="tune in data.tunes" :key="tune.title">
          <div class="tune-flex">
            <div class="tune-box">
              <div class="title-box">
                <MarkDown class="title" :source="tune.title" />
                <MarkDown class="original-title" v-if="tune.originalTitle != null" :source="tune.originalTitle" />
              </div>
              <span class="attribute" v-for="attribute in tune.attributes" :key="attribute.name">
                <span>{{ attribute.name }}: </span>
                <MarkDown :source="attribute.text" />
              </span>
              <MarkDown class="description" :source="tune.description" v-if="tune.description" />
            </div>
            <div v-for="video in tune.videos" :key="video.id">
              <div
                class="media-button video"
                @click="setEmbedVideo(data.video.id, video.id, video.position)"
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
.header::before {
  background-image: v-bind('thumbnailUrlCss');
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
    padding-inline-start: 20px;
    margin-block: 0.5em;
  }

  a,
  a:visited,
  a:hover {
    color: inherit;
  }
}

.tune {
  margin-bottom: 5px;
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
    background-image: url('/genet/video.svg');
  }

  &.reference {
    filter: saturate(20%) brightness(5);
    background-image: url('/genet/imslp.svg');
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
</style>
