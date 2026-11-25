import { ref } from 'vue';

import { getJson } from './api';

/** One data's answer in `GET /admin/api/drafts` (worker/src/admin/drafts.ts). */
export interface DataDrafts {
  drafts: number;
  needsPublish: boolean;
}

/** `GET /admin/api/drafts`: null for a data that could not be read. */
export interface DraftsResponse {
  footprints: DataDrafts | null;
  milestones: DataDrafts | null;
  genet: DataDrafts | null;
}

/**
 * The sidebar's drafts and marks (`GET /admin/api/drafts`): a reactive value
 * that `AdminShell.vue` draws and any screen can refresh. A button that
 * changes a row's status, or writes a public JSON, must move them in the
 * same press, or the sidebar keeps showing the numbers from when the page
 * was opened.
 */
const drafts = ref<DraftsResponse | null>(null);

export const sidebarDrafts = drafts;

// The latest read sent: an older answer that lands after a newer one is dropped, failed or not.
let sent = 0;

/** Reads them again; null - shown as no count and no mark - when they cannot be read. */
export async function refreshSidebarDrafts(): Promise<void> {
  const generation = ++sent;

  try {
    const body = await getJson<DraftsResponse>('/drafts');

    if (generation === sent) drafts.value = body;
  } catch {
    if (generation === sent) drafts.value = null;
  }
}
