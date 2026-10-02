<script setup lang="ts">
import { previewOpen } from '../lib/preview';
</script>

<template>
  <button class="btn" type="button" :aria-pressed="previewOpen" @click="previewOpen = !previewOpen">
    {{ previewOpen ? 'プレビューを閉じる' : 'プレビュー' }}
  </button>
</template>
