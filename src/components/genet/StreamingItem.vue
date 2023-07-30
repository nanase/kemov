<script setup lang="ts">
import { type Streaming, type VideoType } from '@/types/genet';
import VideoLink from '@/components/VideoLink.vue';
import MarkDown from '@/components/MarkDown.vue';
import { computed } from 'vue';
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

const thumbnailUrl = computed(() => `//i1.ytimg.com/vi/${props.data.video.id}/hqdefault.jpg`);
const thumbnailUrlCss = `url('${thumbnailUrl.value}')`;

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
</script>

<template>
  <div class="streaming-item">
    <div class="header">
      <div class="thumbnail">
        <VideoLink class="streaming-thumbnail" :video-id="data.video.id" :video-title="data.video.title" />
      </div>
      <div class="name">
        {{ insertBreakToName(data.shortname ?? data.name) }}
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
    <div class="tunes">
      <ul>
        <li class="tune" v-for="tune in data.tunes" :key="tune.title">
          <div class="tune-flex">
            <div class="tune-box">
              <div class="title">
                <MarkDown :source="tune.title" />
                <MarkDown class="original-title" v-if="tune.originalTitle != null" :source="tune.originalTitle" />
              </div>
              <span class="attribute" v-for="attribute in tune.attributes" :key="attribute.name">
                <span>{{ attribute.name }}: </span>
                <MarkDown :source="attribute.text" />
              </span>
              <MarkDown class="description" :source="tune.description" v-if="tune.description" />
            </div>
            <div class="media-box"></div>
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
}

.header {
  color: #fff;
  position: relative;
  overflow: hidden;
  z-index: 0;
  border-radius: 10px 10px 0 0;
  padding: 10px;

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

  .title {
    display: block;
    font-weight: bold;
  }

  .original-title {
    margin-left: 0.5em;
    font-family: Roboto, 'IBM Plex Sans JP', sans-serif;
    font-style: italic;
    font-size: 90%;
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
  width: 36px;
  height: 36px;
  margin: 0 5px;
  cursor: pointer;
  background-repeat: no-repeat;
  background-size: 100%;
  background-position: center center;
  background-image: url('/genet/video.svg');
  transition:
    background-size 0.3s,
    filter 0.3s;
  border-radius: 10px;
  filter: saturate(0%) brightness(2);

  &:hover {
    background-size: 175%;
    filter: saturate(100%) brightness(1);
  }
}
</style>