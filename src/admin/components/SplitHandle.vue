<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';

import {
  readSplit,
  SPLIT_DEFAULT,
  SPLIT_MAX,
  SPLIT_MIN,
  splitFromPointer,
  splitStorageKey,
  stepSplit,
} from '../lib/split';

/**
 * The bar between a page's list and the item open below it. It sits on the
 * top edge of the editor (`.inspector`, or `.editor` on ジェネット楽曲一覧) and
 * moves the line by writing `--split` on the `.main` that holds both, which
 * `shell.css` turns into the list's row height.
 *
 * Dragging, the arrow keys and a double click (back to the default) all move
 * it; where it was left is kept per page in this browser only.
 */
const route = useRoute();
const handle = ref<HTMLElement | null>(null);
const pct = ref(SPLIT_DEFAULT);
const dragging = ref(false);

function area(): HTMLElement | null {
  return handle.value?.closest<HTMLElement>('.main') ?? null;
}

function store(value: number | null): void {
  try {
    const key = splitStorageKey(route.path);

    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, String(value));
  } catch {
    // Storage can be blocked; the bar still moves, it just is not remembered.
  }
}

function apply(value: number): void {
  pct.value = value;
  area()?.style.setProperty('--split', `${value}%`);
}

function onPointerDown(event: PointerEvent): void {
  if (event.button !== 0) return;

  event.preventDefault();
  handle.value?.setPointerCapture(event.pointerId);
  dragging.value = true;
}

function onPointerMove(event: PointerEvent): void {
  const main = area();

  if (!dragging.value || main === null) return;

  const rect = main.getBoundingClientRect();

  apply(splitFromPointer(event.clientY, rect.top, rect.height));
}

function onPointerUp(): void {
  if (!dragging.value) return;

  dragging.value = false;
  store(pct.value);
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;

  event.preventDefault();
  apply(stepSplit(pct.value, event.key === 'ArrowUp' ? -1 : 1));
  store(pct.value);
}

function reset(): void {
  pct.value = SPLIT_DEFAULT;
  area()?.style.removeProperty('--split');
  store(null);
}

function storedSplit(): number | null {
  try {
    return readSplit(localStorage.getItem(splitStorageKey(route.path)));
  } catch {
    return null;
  }
}

onMounted(() => {
  const stored = storedSplit();

  if (stored !== null) apply(stored);
});
</script>

<template>
  <div
    ref="handle"
    class="split-handle"
    :class="{ drag: dragging }"
    role="separator"
    tabindex="0"
    aria-orientation="horizontal"
    aria-label="一覧と編集の仕切り"
    :aria-valuenow="pct"
    :aria-valuemin="SPLIT_MIN"
    :aria-valuemax="SPLIT_MAX"
    title="ドラッグで高さを変える（ダブルクリックで元に戻す）"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
    @dblclick="reset"
    @keydown="onKeydown"
  >
    <span class="grip" aria-hidden="true"></span>
  </div>
</template>
