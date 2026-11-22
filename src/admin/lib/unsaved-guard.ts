import { onBeforeUnmount, onMounted } from 'vue';
import { onBeforeRouteLeave } from 'vue-router';

import { EDITING_TEXT } from './editing';

/**
 * Asks before an edit panel's unsaved changes are thrown away (#277's 6-10):
 * when another row is selected, when ← 一覧 is pressed, when a filter is
 * changed, when another screen is opened, and when the tab is closed or
 * reloaded.
 *
 * The panel calls `useUnsavedGuard` with its own test for changes and its own
 * way to throw them away. Leaving for another screen and closing the tab are
 * caught here; the rest are the page's own controls, which call
 * `confirmDiscard` before they act. One panel at a time, module-wide rather
 * than per page: only one screen is ever on view.
 */
interface Guard {
  isDirty: () => boolean;
  discard: () => void;
}

let current: Guard | null = null;

export function useUnsavedGuard(isDirty: () => boolean, discard: () => void): void {
  const guard: Guard = { isDirty, discard };

  current = guard;

  // Closing or reloading the tab: browsers show only their own sentence, so
  // this asks without one.
  function warnBeforeUnload(event: BeforeUnloadEvent): void {
    if (isDirty()) event.preventDefault();
  }

  onMounted(() => window.addEventListener('beforeunload', warnBeforeUnload));
  onBeforeUnmount(() => {
    window.removeEventListener('beforeunload', warnBeforeUnload);
    // A panel keyed by row is replaced by the next one; only the panel that
    // is still the current one clears it.
    if (current === guard) current = null;
  });
  onBeforeRouteLeave(() => !isDirty() || window.confirm(EDITING_TEXT.confirmDiscard));
}

/**
 * True when nothing unsaved is open, or the user agreed to throw it away - in
 * which case it is thrown away here, so a panel that stays open (a filter
 * change that keeps its row, ← 一覧 on a narrow screen) shows the saved
 * values rather than the changes it was just told to drop.
 */
export function confirmDiscard(): boolean {
  if (current === null || !current.isDirty()) return true;
  if (!window.confirm(EDITING_TEXT.confirmDiscard)) return false;

  current.discard();

  return true;
}
