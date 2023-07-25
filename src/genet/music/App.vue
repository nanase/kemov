<script setup lang="ts">
import StreamingItem from '@/components/genet/StreamingItem.vue';
import type { Streaming } from '@/types/genet';

import { load as loadYaml } from 'js-yaml';
import streamingYaml from './streaming.yml?raw';

const streamings = loadYaml(streamingYaml) as Streaming[];
</script>

<template>
  <div class="streaming-list">
    <StreamingItem v-for="streaming in streamings" :key="streaming.video.id" :data="streaming" />
  </div>
</template>
