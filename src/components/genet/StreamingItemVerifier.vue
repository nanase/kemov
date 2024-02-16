<script setup lang="ts">
import { computed } from 'vue';

import { type Streaming } from '@/type/genet/music';
import { empty, existsDuplicate } from '@/lib/array';

const { data } = defineProps<{
  data: Streaming;
}>();

const warnings = computed(() => ({
  invalidVideoId: empty(data.video.id),
  invalidVideoType: data.video.type !== 'live' && data.video.type !== 'short' && data.video.type !== 'video',
  noPublishedTime: !data.video.publishedAt.includes(':'),
  noName: empty(data.name),
  sameShortname: data.name === data.shortname,
  noCategory: empty(data.categories),
  noTune: empty(data.tunes),
  noTuneTitle: data.tunes.some((t) => empty(t.title)),
  sameTuneOriginalTitle: data.tunes.some((t) => t.title === t.originalTitle),
  noTuneAttributes: data.tunes.some((t) => empty(t.attributes)),
  noAttributeName: data.tunes.some((t) => t.attributes?.some((a) => empty(a.name))),
  noAttributeText: data.tunes.some((t) => t.attributes?.some((a) => empty(a.text))),
  sameAttributeName: data.tunes.some((t) => t.attributes != null && existsDuplicate(t.attributes.map((a) => a.name))),
  sameAttributeText: data.tunes.some((t) => t.attributes != null && existsDuplicate(t.attributes.map((a) => a.text))),
  noTuneDescription: data.tunes.some((t) => empty(t.description)),
  noReferenceLink: data.tunes.some((t) => t.references?.some((r) => empty(r.link))),
  noReferenceTitle: data.tunes.some((t) => t.references?.some((r) => empty(r.title))),
  sameReferenceLink: data.tunes.some((t) => t.references != null && existsDuplicate(t.references.map((r) => r.link))),
  sameReferenceTitle: data.tunes.some((t) => t.references != null && existsDuplicate(t.references.map((r) => r.title))),
  suspiciousReferenceTitle: data.tunes.some(
    (t) => t.references != null && t.references.some((r) => r.title?.includes('_')),
  ),
  noVideoId: data.tunes.some((t) => t.videos?.some((v) => empty(v.id))),
  noVideoTitle: data.tunes.some((t) => t.videos?.some((v) => empty(v.title))),
  sameVideoId: data.tunes.some((t) => t.videos != null && existsDuplicate(t.videos.map((v) => v.id))),
  sameVideoTitle: data.tunes.some((t) => t.videos != null && existsDuplicate(t.videos.map((v) => v.title))),
}));
</script>

<template>
  <div class="streaming-item-verifier">
    <div class="warning" v-if="warnings.invalidVideoId">{{ `invalidVideoId: ${data.video.id}` }}</div>
    <div class="warning" v-if="warnings.invalidVideoType">{{ `invalidVideoType: ${data.video.type}` }}</div>
    <div class="warning" v-if="warnings.noPublishedTime">{{ `noPublishedTime: ${data.video.publishedAt}` }}</div>
    <div class="warning" v-if="warnings.noName">{{ `noName: ${data.name}` }}</div>
    <div class="warning" v-if="warnings.sameShortname">{{ `sameShortname: ${data.shortname}` }}</div>
    <div class="warning" v-if="warnings.noCategory">{{ `noCategory` }}</div>
    <div class="warning" v-if="warnings.noTune">{{ `noTune` }}</div>
    <div class="warning" v-if="warnings.noTuneTitle">{{ `noTuneTitle` }}</div>
    <div class="warning" v-if="warnings.sameTuneOriginalTitle">{{ `sameTuneOriginalTitle` }}</div>
    <div class="warning" v-if="warnings.noTuneAttributes">{{ `noTuneAttributes` }}</div>
    <div class="warning" v-if="warnings.noAttributeName">{{ `noAttributeName` }}</div>
    <div class="warning" v-if="warnings.noAttributeText">{{ `noAttributeText` }}</div>
    <div class="warning" v-if="warnings.sameAttributeName">{{ `sameAttributeName` }}</div>
    <div class="warning" v-if="warnings.sameAttributeText">{{ `sameAttributeText` }}</div>
    <div class="warning" v-if="warnings.noTuneDescription">{{ `noTuneDescription` }}</div>
    <div class="warning" v-if="warnings.noReferenceLink">{{ `noReferenceLink` }}</div>
    <div class="warning" v-if="warnings.noReferenceTitle">{{ `noReferenceTitle` }}</div>
    <div class="warning" v-if="warnings.sameReferenceLink">{{ `sameReferenceLink` }}</div>
    <div class="warning" v-if="warnings.sameReferenceTitle">{{ `sameReferenceTitle` }}</div>
    <div class="warning" v-if="warnings.suspiciousReferenceTitle">{{ `suspiciousReferenceTitle` }}</div>
    <div class="warning" v-if="warnings.noVideoId">{{ `noVideoId` }}</div>
    <div class="warning" v-if="warnings.noVideoTitle">{{ `noVideoTitle` }}</div>
    <div class="warning" v-if="warnings.sameVideoId">{{ `sameVideoId` }}</div>
    <div class="warning" v-if="warnings.sameVideoTitle">{{ `sameVideoTitle` }}</div>
  </div>
</template>

<style lang="scss">
.streaming-item-verifier {
  .warning {
    background-color: #ffd024;
    font-weight: bold;

    &::before {
      content: '⚠ ';
    }
  }
}
</style>
