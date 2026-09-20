<script setup lang="ts">
defineProps<{
  title: string;
}>();
</script>

<template>
  <div class="page-title">
    <slot name="icon"></slot>
    <h1>{{ title }}</h1>
    <span class="grow"></span>
    <span class="aside">
      <slot name="aside"></slot>
    </span>
  </div>
</template>

<style scoped>
.page-title {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 7px 12px;
}

h1 {
  margin: 0;
  font-size: 21px;
  font-weight: 700;
  line-height: 1.2;
}

.grow {
  flex: 1 1 10px;
  min-width: 0;
}

.aside {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

@container (max-width: 720px) {
  h1 {
    font-size: 17px;
  }
}
</style>
