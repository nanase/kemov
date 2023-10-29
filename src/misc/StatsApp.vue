<script setup lang="ts">
import SiteNavigator from '@/components/common/SiteNavigator.vue';
</script>

<template>
  <SiteNavigator />
  <div class="stats-app">
    <div class="horizon"></div>
    <ul class="note">
      <li>このサイトはファンによる非公式のサイトです。</li>
    </ul>
  </div>
</template>

<style lang="scss">
@use '@/style/media';

.stats-app {
  .horizon {
    display: block;
    height: 1px;
    width: 100%;
    margin: 2em auto;
    background-color: #ebf0f5;
  }

  .note {
    padding-inline-start: 20px;
  }
}
</style>
