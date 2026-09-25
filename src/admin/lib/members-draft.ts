import { reactive } from 'vue';

import type { NewMemberFields } from './members';

/**
 * The メンバー list's unsaved changes (#211): the members added and the order
 * the list was moved to. Nothing here is written until the screen's own 保存,
 * which sends both in one request, so what the public site reads is never a
 * half-moved list.
 *
 * Module scope rather than the page's own state, so that going to another
 * screen and back does not silently throw the changes away. Closing the tab
 * still does - the page asks the browser to confirm that, see MembersPage.vue.
 */
export const draft = reactive<{
  /** In the order they were added. */
  added: NewMemberFields[];
  /** Every member's id in the order to show them, or null while the order has not been touched. */
  order: string[] | null;
}>({ added: [], order: null });

export function clearDraft(): void {
  draft.added = [];
  draft.order = null;
}
