import { ref } from 'vue';

import { getJson } from './api';
import type { FootprintsPending } from './footprints-publish';
import { publishBadgeCount } from './sidebar';

/**
 * The 公開 item's badge in the sidebar. A single reactive value that
 * `AdminShell.vue` draws and any screen can refresh: a button that changes what
 * is waiting (「公開待ちにする」, 「いま公開する」) must move the count in the same
 * press, or the sidebar keeps showing the number from when the page was opened.
 */
const count = ref<number | null>(null);

export const publishBadge = count;

/** Reads the count again; null - shown as no badge - when the pending list cannot be read. */
export async function refreshPublishBadge(): Promise<void> {
  try {
    count.value = publishBadgeCount(await getJson<FootprintsPending>('/footprints/pending'));
  } catch {
    count.value = null;
  }
}
