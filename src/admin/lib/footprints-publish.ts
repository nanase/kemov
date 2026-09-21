/**
 * `GET /admin/api/footprints/pending` and what the あしあと screens and the
 * 公開 screen read from it (#185, #201). `worker/src/admin/footprints-publish.ts`
 * decides what is waiting; the functions here are the one place the admin
 * site turns that answer into a yes or no, so the 公開 screen, the あしあと
 * table and the edit panel cannot disagree about a row.
 */

import { publishMarkFor, type PublishMark } from './publish-mark';

export interface PendingFootprintsEntry {
  eventId: number;
  latestAction: string;
}

export interface ChangedFootprintsEntry {
  eventId: number;
  title: string;
}

export interface FootprintsPending {
  pending: PendingFootprintsEntry[];
  changed: ChangedFootprintsEntry[];
}

/**
 * The entry saying event `eventId` is waiting for 「いま公開する」 - its latest
 * revision is newer than the last run - or undefined when nothing is. `state`
 * is null when the pending list could not be read, which answers undefined too:
 * callers that must tell "not waiting" from "unknown" check `state` first.
 */
export function waitingEntryFor(state: FootprintsPending | null, eventId: number): PendingFootprintsEntry | undefined {
  return state?.pending.find((entry) => entry.eventId === eventId);
}

/** Whether a `published` row's public copy is older than its working row. */
export function isChangedSincePublish(state: FootprintsPending | null, eventId: number): boolean {
  return state?.changed.some((entry) => entry.eventId === eventId) ?? false;
}

/**
 * Whether 「いま公開する」 does anything. The worker builds the JSON only when
 * a revision is newer than the last run (`publishFootprintsNow`), and a row that
 * changed after it was published has no new revision - so `changed` alone
 * must not enable it, or the button answers "待っているものがありません".
 */
export function canPublishFootprints(state: FootprintsPending): boolean {
  return state.pending.length > 0;
}

/** The 状態 chip for one row - the table and the edit panel both draw it from here. */
export function footprintsMarkFor(status: string, eventId: number, state: FootprintsPending | null): PublishMark {
  return publishMarkFor(status, state === null ? null : waitingEntryFor(state, eventId) !== undefined);
}
