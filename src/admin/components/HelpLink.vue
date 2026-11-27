<script setup lang="ts">
import { HELP_TEXT, helpUrl, type HelpSection } from '../lib/help';

defineProps<{ section: HelpSection }>();
</script>

<template>
  <a class="btn quiet" :href="helpUrl(section)" target="_blank" rel="noopener">{{ HELP_TEXT }}</a>
</template>
