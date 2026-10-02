<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';

import { memberColor } from '@/lib/memberColor';
import VideoThumbnail from '@/videos/parts/VideoThumbnail.vue';
import type { Channel } from '@/type/api';

import { publicChannels } from '../../lib/public-data';
import { AVAILABILITY_LABEL, TYPE_LABEL, type CollectedVideo, type OverrideFormFields } from '../../lib/videos';

/**
 * A video as its overrides leave it. The public pages draw a video only as a
 * row of a ranking or a list, which means nothing alone, so this is a small
 * sample of what a row carries, with what each override changes beside it.
 *
 * An override wins over what was collected, the way the API's
 * `VIDEO_EFFECTIVE` reads it (`worker/src/lib/overrides.ts`).
 */
const props = defineProps<{
  video: CollectedVideo;
  fields: OverrideFormFields;
}>();

const channels = ref<Channel[]>([]);

const title = computed(() => props.fields.title ?? props.video.title);
const type = computed(() => props.fields.type ?? props.video.type);
const availability = computed(() => props.fields.availability ?? props.video.availability);
const channel = computed(() => channels.value.find((c) => c.channelId === props.video.channelId) ?? null);

onMounted(async () => {
  try {
    channels.value = await publicChannels();
  } catch {
    channels.value = [];
  }
});
</script>

<template>
  <div class="preview-video" :class="{ gone: availability !== 'public' }">
    <VideoThumbnail :video-id="video.videoId" size="mq" />
    <div class="preview-video-text">
      <div class="preview-video-title">{{ title }}</div>
      <div class="preview-member-sub">
        <span v-if="channel" class="preview-face">
          <i :style="{ background: memberColor(channel.color.key, false) }"></i>{{ channel.name }}
        </span>
        <span>{{ video.publishedAt.slice(0, 10) }}</span>
        <span>{{ type === null ? '種類不明' : (TYPE_LABEL[type] ?? type) }}</span>
      </div>
    </div>
  </div>
  <ul class="preview-notes">
    <li v-if="availability !== 'public'">
      公開状況が「{{
        AVAILABILITY_LABEL[availability] ?? availability
      }}」なので、公開ページの一覧・順位・月ごとの本数から消えます
    </li>
    <li v-if="fields.title !== null">題は、順位表・メンバーのページ・あしあとなど、題が出るすべての場所で変わります</li>
    <li v-if="fields.type !== null">種類を変えると、どの種類の順位表と月ごとの本数に数えるかも変わります</li>
  </ul>
</template>
