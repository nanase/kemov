<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, useTemplateRef } from 'vue';
import { TEXT_SIZES, TEXT_SIZE_STORAGE_KEY, parseTextSize, type TextSize } from './textSize';

// head.html has already applied any stored size to <html> before this
// mounts, so the attribute is the one source to start from.
const size = ref<TextSize>(parseTextSize(document.documentElement.dataset.textSize));
const open = ref(false);

const label = computed(() => `文字サイズ：${size.value}%`);

const root = useTemplateRef<HTMLElement>('root');
const button = useTemplateRef<HTMLButtonElement>('button');
const items = useTemplateRef<HTMLButtonElement[]>('items');

function apply(next: TextSize) {
  size.value = next;

  const element = document.documentElement;

  if (next === 100) delete element.dataset.textSize;
  else element.dataset.textSize = String(next);

  try {
    if (next === 100) localStorage.removeItem(TEXT_SIZE_STORAGE_KEY);
    else localStorage.setItem(TEXT_SIZE_STORAGE_KEY, String(next));
  } catch {
    // Without storage the size lasts until the page is left.
  }
}

async function show() {
  open.value = true;
  document.addEventListener('pointerdown', onOutside, true);
  await nextTick();
  items.value?.[TEXT_SIZES.indexOf(size.value)]?.focus();
}

function hide(returnFocus: boolean) {
  open.value = false;
  document.removeEventListener('pointerdown', onOutside, true);
  if (returnFocus) button.value?.focus();
}

function toggle() {
  if (open.value) hide(false);
  else void show();
}

function pick(next: TextSize) {
  apply(next);
  hide(true);
}

function onOutside(event: PointerEvent) {
  if (!root.value?.contains(event.target as Node)) hide(false);
}

/** The keys a menu answers to: the arrows walk it, Escape leaves it where it was opened from. */
function onMenuKeydown(event: KeyboardEvent) {
  const list = items.value ?? [];
  const at = list.indexOf(document.activeElement as HTMLButtonElement);

  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    const step = event.key === 'ArrowDown' ? 1 : -1;

    list[(at + step + list.length) % list.length]?.focus();
  } else if (event.key === 'Home' || event.key === 'End') {
    event.preventDefault();
    list[event.key === 'Home' ? 0 : list.length - 1]?.focus();
  } else if (event.key === 'Escape') {
    event.preventDefault();
    hide(true);
  } else if (event.key === 'Tab') {
    hide(false);
  }
}

onBeforeUnmount(() => document.removeEventListener('pointerdown', onOutside, true));
</script>

<template>
  <div ref="root" class="text-size">
    <button
      ref="button"
      type="button"
      class="opener"
      :aria-label="label"
      :title="label"
      aria-haspopup="menu"
      :aria-expanded="open"
      @click="toggle"
    >
      <svg
        viewBox="0 0 16 16"
        aria-hidden="true"
        focusable="false"
        fill="none"
        stroke="currentColor"
        stroke-width="1.4"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M0.9 13.5 3.4 7.3 5.9 13.5M1.75 11.4h3.3" />
        <path d="M6.6 13.5 10.8 2.5 15 13.5M7.9 10.2h5.8" />
      </svg>
    </button>
    <div v-if="open" class="menu" role="menu" aria-label="文字サイズ" @keydown="onMenuKeydown">
      <button
        v-for="option in TEXT_SIZES"
        ref="items"
        :key="option"
        type="button"
        role="menuitemradio"
        :aria-checked="option === size"
        tabindex="-1"
        @click="pick(option)"
      >
        <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false" class="check">
          <path
            d="M3.5 8.4 6.6 11.4 12.5 4.8"
            fill="none"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
        {{ option }}%
      </button>
    </div>
  </div>
</template>

<style scoped>
.text-size {
  position: relative;
  flex: none;
}

.opener {
  display: inline-grid;
  place-items: center;
  width: 30px;
  height: 30px;
  padding: 0;
  border: 1px solid var(--k-line-2);
  border-radius: 6px;
  background: var(--k-surface);
  color: var(--k-text-2);
  cursor: pointer;
}

.opener:hover,
.opener[aria-expanded='true'] {
  border-color: var(--k-accent);
  color: var(--k-text);
}

.opener svg {
  display: block;
  width: 15px;
  height: 15px;
}

.menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 1;
  display: grid;
  min-width: 96px;
  padding: 4px;
  border: 1px solid var(--k-line-2);
  border-radius: 8px;
  background: var(--k-surface);
  box-shadow: 0 8px 24px -12px rgb(0 0 0 / 35%);
}

.menu button {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px 5px 6px;
  border: 0;
  border-radius: 5px;
  background: none;
  color: var(--k-text-2);
  font-variant-numeric: tabular-nums;
  text-align: left;
  cursor: pointer;
}

.menu button:hover,
.menu button:focus-visible {
  background: var(--k-sunken);
  color: var(--k-text);
}

.menu button[aria-checked='true'] {
  color: var(--k-accent);
  font-weight: 600;
}

.check {
  width: 14px;
  height: 14px;
  visibility: hidden;
}

.menu button[aria-checked='true'] .check {
  visibility: visible;
}
</style>
