<script setup lang="ts">
import { onBeforeUnmount, onMounted, useTemplateRef } from 'vue';

import { useDialogFocus } from '../useDialogFocus';

/**
 * One of the side panels, shown as a dialog where there is no room beside the
 * timeline.
 *
 * The panel itself does not change: below 1040px the rail goes and its
 * contents are reached from the band at the foot of the screen instead, so
 * the same list is the same list either way.
 */
const { heading } = defineProps<{ heading: string }>();

const emit = defineEmits<{ close: [] }>();

const card = useTemplateRef<HTMLDivElement>('card');

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') emit('close');
}

useDialogFocus(card);

onMounted(() => globalThis.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => globalThis.removeEventListener('keydown', onKeydown));
</script>

<template>
  <div class="scrim" @click.self="emit('close')">
    <div ref="card" class="card" role="dialog" aria-modal="true" :aria-label="heading" tabindex="-1">
      <header class="head">
        <h2>{{ heading }}</h2>
        <button type="button" class="icon" aria-label="閉じる" @click="emit('close')">✕</button>
      </header>
      <div class="body"><slot /></div>
    </div>
  </div>
</template>

<style scoped>
.scrim {
  display: grid;
  position: fixed;
  z-index: 44;
  inset: 0;
  place-items: start center;
  padding: 48px 12px 12px;
  overflow: auto;
  background: rgb(8 14 13 / 50%);
}

.card {
  display: flex;
  flex-direction: column;
  width: min(560px, 100%);
  max-height: calc(100vh - 60px);
  overflow: auto;
  border: 1px solid var(--k-line);
  border-radius: 8px;
  background: var(--k-surface);
  box-shadow: 0 24px 60px -24px rgb(0 0 0 / 55%);
}

.head {
  display: flex;
  position: sticky;
  z-index: 2;
  top: 0;
  gap: 8px;
  align-items: center;
  padding: 8px 10px 8px 16px;
  border-bottom: 1px solid var(--k-line);
  background: var(--k-surface-2);
}

.head h2 {
  flex: 1;
  margin: 0;
  font-size: 14px;
  font-weight: 700;
}

.icon {
  display: inline-grid;
  flex: none;
  place-items: center;
  width: 30px;
  height: 30px;
  border: 1px solid var(--k-line-2);
  border-radius: 6px;
  background: var(--k-surface);
  color: var(--k-text-2);
  font: inherit;
  cursor: pointer;
}

.icon:hover {
  background: var(--k-sunken);
}

.body {
  padding: 6px 14px 14px;
}
</style>
