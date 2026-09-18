<script setup lang="ts">
import { computed, ref, watch } from 'vue';

import { formatCount } from '../draw';
import type { Subject } from '../model';

/**
 * What a subscriber count on this page actually is.
 *
 * YouTube rounds every count it shows to three significant figures, so the
 * number on the page is the bottom of a range rather than a reading. The
 * three figures say how wide that range is once eleven of them are added up,
 * which is the part a reader cannot work out for themselves.
 *
 * Behind a button rather than on the page: it is true of every number here
 * and changes none of them.
 */
const { subjects } = defineProps<{ subjects: readonly Subject[] }>();

const open = ref(false);
const dialog = ref<HTMLElement | null>(null);

const range = computed(() => {
  const keys = ['最小値', '平均値', '最大値'];
  let low = 0;
  let high = 0;

  for (const subject of subjects) {
    const count = subject.counts.subscriberCount;

    // A member whose count was not read cannot be left out of the sum: what
    // came back would then be the range of the others, under a heading that
    // says it covers everyone. The three figures are unknown together.
    if (count === null) return keys.map((key) => ({ key, value: '不明' }));

    // The reading is rounded down to three figures, so the true count is
    // somewhere in the step it was rounded by.
    const step = Math.max(1, Math.pow(10, String(count).length - 3));

    low += count;
    high += count + step - 1;
  }

  return [formatCount(low), formatCount((low + high) / 2), formatCount(high)].map((value, index) => ({
    key: keys[index]!,
    value,
  }));
});

watch(open, async (on) => {
  if (!on) return;

  await Promise.resolve();
  dialog.value?.querySelector('button')?.focus();
});
</script>

<template>
  <button
    type="button"
    class="info"
    aria-haspopup="dialog"
    aria-label="チャンネル登録者数について"
    @click="open = true"
  >
    <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" stroke-width="1.4" />
      <circle cx="8" cy="4.4" r=".95" fill="currentColor" />
      <path d="M8 6.9v5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
    </svg>
  </button>

  <div v-if="open" class="scrim" @click="open = false"></div>
  <div
    v-if="open"
    ref="dialog"
    class="dialog"
    role="dialog"
    aria-modal="true"
    aria-labelledby="subscriber-note-title"
    @keydown.esc="open = false"
  >
    <button type="button" class="close" aria-label="閉じる" @click="open = false">×</button>
    <h2 id="subscriber-note-title">チャンネル登録者数について</h2>
    <div class="three">
      <div v-for="item in range" :key="item.key">
        <span class="key">{{ item.key }}</span>
        <span class="value n">{{ item.value }}</span>
      </div>
    </div>
    <p>
      YouTube
      の制約により、チャンネル登録者数の正確な数値はチャンネルの所有者のみに開示されます。それ以外の利用者には数値の上位3桁のみが開示されます。したがって、このサイトで表示している数値は上位3桁のみの最小値であり、正確な数値はこれ以上となります。
    </p>
  </div>
</template>

<style scoped>
.info {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: 0;
  background: none;
  color: var(--k-text-3);
  cursor: pointer;
}

.info:hover {
  color: var(--k-accent);
}

.info svg {
  width: 17px;
  height: 17px;
}

.scrim {
  position: absolute;
  inset: 0;
  z-index: 40;
  background: var(--k-scrim);
}

.dialog {
  display: grid;
  position: absolute;
  z-index: 45;
  top: 58px;
  right: 16px;
  left: 16px;
  gap: 9px;
  max-width: 440px;
  margin-inline: auto;
  padding: 14px 16px 16px;
  border: 1px solid var(--k-line-2);
  border-radius: 10px;
  background: var(--k-surface);
  box-shadow: var(--k-shadow);
}

.dialog h2 {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
}

.dialog p {
  margin: 0;
  color: var(--k-text-2);
  font-size: 12px;
  line-height: 1.7;
}

.close {
  position: absolute;
  top: 8px;
  right: 10px;
  width: 24px;
  height: 24px;
  border: 0;
  border-radius: 50%;
  background: none;
  color: var(--k-text-3);
  font: inherit;
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
}

.close:hover {
  background: var(--k-surface-2);
  color: var(--k-text);
}

.three {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1px;
  overflow: hidden;
  border: 1px solid var(--k-line);
  border-radius: 6px;
  background: var(--k-line);
}

.three > div {
  display: grid;
  gap: 1px;
  padding: 6px 8px;
  background: var(--k-surface-2);
}

.three .key {
  color: var(--k-text-3);
  font-size: 10px;
  letter-spacing: 0.06em;
}

.three .value {
  font-size: 13px;
  font-weight: 500;
}

@container (max-width: 430px) {
  .dialog {
    top: 48px;
    right: 10px;
    left: 10px;
    padding: 12px;
  }
}
</style>
