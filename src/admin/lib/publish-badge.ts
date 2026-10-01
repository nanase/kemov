import { ref } from 'vue';

import { getJson } from './api';
import type { FootprintsPending } from './footprints-publish';
import type { InboxCounts } from './inbox';
import { publishBadgeCount } from './sidebar';

/**
 * The sidebar's counts: the 公開 item's, and the やること screens'. Reactive
 * values that `AdminShell.vue` draws and any screen can refresh: a button that
 * changes what is waiting (「公開待ちにする」, 「いま公開する」, 承認, 却下) must
 * move the counts in the same press, or the sidebar keeps showing the numbers
 * from when the page was opened. Both are read again together, since every
 * such press moves rows between them.
 */
const count = ref<number | null>(null);
const inbox = ref<InboxCounts | null>(null);

export const publishBadge = count;
export const inboxBadges = inbox;

/** Reads every count again; null - shown as no badge - for whichever cannot be read. */
export async function refreshPublishBadge(): Promise<void> {
  await Promise.all([
    getJson<FootprintsPending>('/footprints/pending').then(
      (pending) => (count.value = publishBadgeCount(pending)),
      () => (count.value = null),
    ),
    getJson<InboxCounts>('/inbox').then(
      (counts) => (inbox.value = counts),
      () => (inbox.value = null),
    ),
  ]);
}
