import { onBeforeUnmount, onMounted } from 'vue';
import { onBeforeRouteLeave } from 'vue-router';

import { EDITING_TEXT } from './editing';

/**
 * Asks before an edit panel's unsaved changes are thrown away (#277's 6-10):
 * when another row is selected, when ← 一覧 is pressed, when another screen
 * is opened, and when the tab is closed or reloaded.
 *
 * The panel calls `useUnsavedGuard` with its own test for changes. Leaving
 * for another screen and closing the tab are caught here; the other two are
 * the page's own buttons, which call `confirmDiscard` before they act. One
 * panel at a time, module-wide rather than per page, for the reason toast.ts
 * gives: only one screen is ever on view.
 */
let current: (() => boolean) | null = null;

export function useUnsavedGuard(isDirty: () => boolean): void {
  current = isDirty;

  // Closing or reloading the tab: browsers show only their own sentence, so
  // this asks without one, as MembersPage.vue does.
  function warnBeforeUnload(event: BeforeUnloadEvent): void {
    if (isDirty()) event.preventDefault();
  }

  onMounted(() => window.addEventListener('beforeunload', warnBeforeUnload));
  onBeforeUnmount(() => {
    window.removeEventListener('beforeunload', warnBeforeUnload);
    // A panel keyed by row is replaced by the next one; only the panel that
    // is still the current one clears it.
    if (current === isDirty) current = null;
  });
  onBeforeRouteLeave(() => !isDirty() || window.confirm(EDITING_TEXT.confirmDiscard));
}

/** True when nothing unsaved is open, or the user agreed to throw it away. */
export function confirmDiscard(): boolean {
  return current === null || !current() || window.confirm(EDITING_TEXT.confirmDiscard);
}
