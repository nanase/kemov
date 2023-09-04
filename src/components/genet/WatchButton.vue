<script lang="ts">
export type ClickWatchButton = { clickWatchButton: [url: string, position?: number] };
</script>

<script setup lang="ts">
import { computed } from 'vue';

const { url } = defineProps<{
  url: string;
}>();

const emit = defineEmits<ClickWatchButton>();

const protocol = computed(() => new URL(url).protocol);
const watchPath = computed(() => new URL(url).pathname);
const position = computed(() => Number(new URL(url).searchParams.get('t') ?? '0'));
</script>

<template>
  <button
    class="watch-button"
    v-if="protocol === 'yt:'"
    @click="emit('clickWatchButton', watchPath, position)"
    v-tooltip="'動画を視聴する'"
  ></button>
</template>

<style lang="scss">
.watch-button {
  @mixin icon($bdcolor, $bgcolor, $ntcolor) {
    background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 205.52 165.45"><path fill="#{$bgcolor}" stroke="#{$bdcolor}" stroke-linecap="round" stroke-linejoin="round" stroke-width="7.5" d="M71.616 3.75h102.35a27.74 27.74 0 0 1 27.8 27.8V133.9a27.74 27.74 0 0 1-27.8 27.8H71.616a27.74 27.74 0 0 1-27.8-27.8v-9.944L3.75 107.679l40.066-15.526V31.55a27.74 27.74 0 0 1 27.8-27.8z"/><path fill="#{$ntcolor}" d="m124.876 24.91-11.371 63.076c-5.959-.413-19.357-6.448-37.816.952-12.375 6.58-18.42 16.127-16.571 29.377 2.188 5.916 1.392 18.935 30.145 23.171 23.149 2.999 29.44-7.381 34.593-18.666 5.405-14.96 4.523-40.814 7.683-60.426 1.596-7.164 5.825-17.198 21.914-17.959 8.861.552 17.458 9.963 18.947 15.203.919 7.27-1.28 13.116-4.032 15.978-4.596 2.98-9.173 4.728-13.682 2.171-2.094-2.554-5.35-4.45-2.999-9.522 1.162-1.697 2.21-3.448 6.532-3.605 2.313-.86 3.393-2.555 2.186-5.799-2.137-1.943-3.596-4.302-9.455-3.967-6.566 1.16-8.857 5.441-9.896 10.511-1.233 7.343-.339 18.249 8.107 23.882 6.33 3.188 13.673 3.745 22.744-.174 7.242-3.924 9.686-9.907 12.61-15.686 2-5.631 5.257-19.185-3.567-26.774-6.347-5.969-11.488-12.174-27.07-14.48-4.56-.182-9.668.186-16.734 2.52 1.972-4.736 1.38-7.86-1.776-9.372-1.552-1.025-3.026-1.486-4.49-1.857-5.656-.21-5.285.72-6 1.446z"/></svg>');
  }

  @include icon('%231e1e1e', '%23ffffff', '%231e1e1e');

  cursor: pointer;
  background-repeat: no-repeat;
  background-size: 100%;
  background-position: center center;
  width: 20px;
  height: 1.2em;
  border: none;
  background-color: inherit;
  margin: 0 2px;
  transition: transform 0.3s;

  &:hover {
    @include icon('%23ea3223', '%23ea3223', '%23ffffff');

    transform: scale(1.25);
  }
}
</style>
