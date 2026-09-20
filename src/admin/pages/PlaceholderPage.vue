<script setup lang="ts">
import { computed } from 'vue';

import { pageTitle } from '../lib/sidebar';

/** Every sidebar destination #144 does not build a screen for yet. */
const props = defineProps<{ page: string }>();

const name = computed(() => pageTitle(props.page));
</script>

<template>
  <div class="main solo">
    <div class="pane">
      <div class="toolbar">
        <h2>{{ name }}</h2>
      </div>
      <div class="empty">
        <b>{{ name }}</b>
        <div class="sub">後続のタスクで作成</div>
      </div>
    </div>
  </div>
</template>
