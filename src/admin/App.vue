<script setup lang="ts">
import AdminShell from './AdminShell.vue';
</script>

<template>
  <AdminShell>
    <router-view />
  </AdminShell>
</template>

<script lang="ts">
export default { name: 'App' };
</script>
