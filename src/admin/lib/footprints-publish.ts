/**
 * What the あしあと screens make of publishing (#185, #201, #281): what
 * `GET /footprints/pending` says, and the edit panel's answers in
 * あしあと's own terms. What every data shares - the chip, the buttons and
 * the words - is lib/publishing.ts.
 */

import { fieldForSaveError, type EventFieldKey } from './footprints';
import { publishAnswerFor, type AnsweredAction, type PublishAnswer } from './publishing';

export interface PendingFootprintsEntry {
  eventId: number;
  latestAction: string;
}

export interface ChangedFootprintsEntry {
  eventId: number;
  title: string;
}

/** `GET /admin/api/footprints/pending`. */
export interface FootprintsPending {
  pending: PendingFootprintsEntry[];
  changed: ChangedFootprintsEntry[];
  /** Whether the public JSON may say what no revision says: a write of it was sent that no check found up to date since. */
  behind: boolean;
  /** Whether the public JSON holds other events than the records and today's whitelist build: a whitelist changed since it was written (#282). */
  outdated: boolean;
}

/**
 * Whether a `published` row's public copy is older than its working row -
 * since #281, a row whose save went through while the public JSON could not
 * be written, or one changed before then.
 */
export function isChangedSincePublish(state: FootprintsPending | null, eventId: number): boolean {
  return state?.changed.some((entry) => entry.eventId === eventId) ?? false;
}

/**
 * Whether the 公開 screen's 「いま公開する」 does anything for あしあと. The
 * worker builds the JSON only when a revision is newer than the last time it
 * was written, when the JSON may be behind, or when it is outdated, and a row changed after it was
 * published has no new revision - so `changed` alone must not enable it, or
 * the button answers "待っているものがありません".
 */
export function canPublishFootprints(state: FootprintsPending): boolean {
  return state.pending.length > 0 || state.behind || state.outdated;
}

/** The 公開 screen's, while the worker says the JSON may be behind. */
export const FOOTPRINTS_BEHIND_TEXT = '本番のあしあとが記録と食い違っているかもしれません。';

export type FootprintsAnswer = PublishAnswer<EventFieldKey>;

/** lib/publishing.ts's `publishAnswerFor` for an event: the row comes back as `event`. */
export function footprintsAnswerFor(action: AnsweredAction, status: string | null, error: unknown): FootprintsAnswer {
  return publishAnswerFor({ rowKey: 'event', fieldForSaveError }, action, status, error);
}
