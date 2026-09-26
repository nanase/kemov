/**
 * `GET /admin/api/subscribers/pending` and what the 登録者数の節目 screen and
 * the 公開 screen read from it (#225), the same role footprints-publish.ts
 * plays for あしあと. `worker/src/admin/subscriber-milestones-publish.ts`
 * decides what is waiting; the functions here are the one place the admin
 * site turns that answer into a yes or no, so the table, the edit panel and
 * the 公開 screen cannot disagree about a row.
 */

import { publishMarkFor, type PublishMark } from './publish-mark';

export interface PendingMilestoneEntry {
  milestoneId: number;
  latestAction: string;
}

/** A published row whose working copy no longer matches the revision that made it live. */
export interface ChangedMilestoneEntry {
  milestoneId: number;
}

/** A row whose linked event is not, on the public timeline now, what the stored JSON says. */
export interface EventChangedMilestoneEntry {
  milestoneId: number;
  eventId: number;
}

export interface MilestonesPending {
  pending: PendingMilestoneEntry[];
  changed: ChangedMilestoneEntry[];
  eventChanged: EventChangedMilestoneEntry[];
  /** The stored JSON is in an older shape, so a run builds it again with nothing else waiting. */
  shapeOutdated: boolean;
}

/** The entry saying milestone `milestoneId` is waiting for 「いま公開する」, or undefined when nothing is (or `state` is unknown). */
export function waitingEntryFor(
  state: MilestonesPending | null,
  milestoneId: number,
): PendingMilestoneEntry | undefined {
  return state?.pending.find((entry) => entry.milestoneId === milestoneId);
}

/** Whether a `published` row's public copy is older than its working row. */
export function isChangedSincePublish(state: MilestonesPending | null, milestoneId: number): boolean {
  return state?.changed.some((entry) => entry.milestoneId === milestoneId) ?? false;
}

/** Whether the public JSON names the row's linked event as it was before the timeline changed it. */
export function isEventChanged(state: MilestonesPending | null, milestoneId: number): boolean {
  return state?.eventChanged.some((entry) => entry.milestoneId === milestoneId) ?? false;
}

/**
 * Whether 「いま公開する」 does anything - exactly when the worker builds
 * (`publishState`'s `needsBuild`), for the reason genet-publish.ts's
 * `canPublishGenet` gives. `eventChanged` counts: nothing but it says the
 * stored JSON is out of date when the timeline changes. `changed` does not:
 * those rows have no newer revision until 「公開待ちにする」 is pressed again.
 */
export function canPublishMilestones(state: MilestonesPending): boolean {
  return state.pending.length > 0 || state.eventChanged.length > 0 || state.shapeOutdated;
}

/** Whether the only reason to publish is the shape, so the screen can say so. */
export function publishesOnlyForShape(state: MilestonesPending): boolean {
  return state.pending.length === 0 && state.eventChanged.length === 0 && state.shapeOutdated;
}

/** The 状態 chip for one row - the table, the edit panel and the 公開 screen all draw it from here. */
export function milestoneMarkFor(status: string, milestoneId: number, state: MilestonesPending | null): PublishMark {
  return publishMarkFor(status, state === null ? null : waitingEntryFor(state, milestoneId) !== undefined);
}

export interface MilestonesPublishResult {
  published: boolean;
  publicationId?: number;
  milestoneCount?: number;
  byteLength?: number;
}
