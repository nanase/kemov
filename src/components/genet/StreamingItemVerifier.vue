<script setup lang="ts">
import { computed } from 'vue';
import { type Streaming } from '@/types/genet';
import { empty, existsDuplicate } from '@/lib/array';

const props = defineProps<{
  data: Streaming;
}>();

const warnings = computed(() => ({
  invalidVideoId: empty(props.data.video.id),
  invalidVideoType:
    props.data.video.type !== 'live' && props.data.video.type !== 'short' && props.data.video.type !== 'video',
  noPublishedTime: !props.data.video.publishedAt.includes(':'),
  noName: empty(props.data.name),
  sameShortname: props.data.name === props.data.shortname,
  noCategory: empty(props.data.categories),
  noTune: empty(props.data.tunes),
  noTuneTitle: props.data.tunes.some((t) => empty(t.title)),
  sameTuneOriginalTitle: props.data.tunes.some((t) => t.title === t.originalTitle),
  noTuneAttributes: props.data.tunes.some((t) => empty(t.attributes)),
  noAttributeName: props.data.tunes.some((t) => t.attributes?.some((a) => empty(a.name))),
  noAttributeText: props.data.tunes.some((t) => t.attributes?.some((a) => empty(a.text))),
  sameAttributeName: props.data.tunes.some(
    (t) => t.attributes != null && existsDuplicate(t.attributes.map((a) => a.name)),
  ),
  sameAttributeText: props.data.tunes.some(
    (t) => t.attributes != null && existsDuplicate(t.attributes.map((a) => a.text)),
  ),
  noTuneDescription: props.data.tunes.some((t) => empty(t.description)),
  noReferenceLink: props.data.tunes.some((t) => t.references?.some((r) => empty(r.link))),
  noReferenceTitle: props.data.tunes.some((t) => t.references?.some((r) => empty(r.title))),
  sameReferenceLink: props.data.tunes.some(
    (t) => t.references != null && existsDuplicate(t.references.map((r) => r.link)),
  ),
  sameReferenceTitle: props.data.tunes.some(
    (t) => t.references != null && existsDuplicate(t.references.map((r) => r.title)),
  ),
  suspiciousReferenceTitle: props.data.tunes.some(
    (t) => t.references != null && t.references.some((r) => r.title?.includes('_')),
  ),
  noVideoId: props.data.tunes.some((t) => t.videos?.some((v) => empty(v.id))),
  noVideoTitle: props.data.tunes.some((t) => t.videos?.some((v) => empty(v.title))),
  sameVideoId: props.data.tunes.some((t) => t.videos != null && existsDuplicate(t.videos.map((v) => v.id))),
  sameVideoTitle: props.data.tunes.some((t) => t.videos != null && existsDuplicate(t.videos.map((v) => v.title))),
}));
</script>

<template>
  <div class="streaming-item-verifier">
    <div class="warning" v-if="warnings.invalidVideoId">{{ `invalidVideoId: ${props.data.video.id}` }}</div>
    <div class="warning" v-if="warnings.invalidVideoType">{{ `invalidVideoType: ${props.data.video.type}` }}</div>
    <div class="warning" v-if="warnings.noPublishedTime">{{ `noPublishedTime: ${props.data.video.publishedAt}` }}</div>
    <div class="warning" v-if="warnings.noName">{{ `noName: ${props.data.name}` }}</div>
    <div class="warning" v-if="warnings.sameShortname">{{ `sameShortname: ${props.data.shortname}` }}</div>
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
