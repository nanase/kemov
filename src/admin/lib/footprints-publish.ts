/**
 * What the あしあと screens make of publishing (#185, #201, #281): the 状態
 * chip, and what the edit panel says after 「公開」, 「保存」 or
 * 「非公開に戻す」. `worker/src/admin/footprints-publish.ts` decides whether a
 * row may publish and says why not; the functions here only turn its answer
 * into words, so the screen never checks a row itself (#277's decision 1d).
 */

import { AdminApiError } from './api';
import { SAVE_TOAST } from './editing';
import { fieldForSaveError, type EventFieldKey, type FootAction } from './footprints';
import type { PublishMark } from './publish-mark';

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
 * was written, and a row changed after it was published has no new revision
 * - so `changed` alone must not enable it, or the button answers
 * "待っているものがありません".
 */
export function canPublishFootprints(state: FootprintsPending): boolean {
  return state.pending.length > 0;
}

/** The 状態 chip for one row. Every あしあと screen draws it from here. */
export function footprintsMarkFor(status: string): PublishMark {
  return status === 'published' ? { label: '公開中', tone: 'published' } : { label: '下書き', tone: 'draft' };
}

/** The words #277's decisions 1c and 1d give what the edit panel says. */
export const PUBLISH_TEXT = {
  refusedPublish: '公開できません',
  refusedPublishNote: '入力した内容は下書きとして保存しました。',
  refusedSave: '保存できません',
  refusedSaveNote: '公開中の行は、公開の条件を満たさないと保存できません。本番は前の内容のままです。',
  notWrittenPublish: '保存しましたが、本番に出せませんでした。もう一度「公開」を押してください。',
  notWrittenSave: '保存しましたが、本番に出せませんでした。もう一度「保存」を押してください。',
  notWithdrawn: '非公開に戻せません',
  notWithdrawnNote:
    '本番を書き直せませんでした。行は公開中のまま、本番も前の内容のままです。もう一度「非公開に戻す」を押してください。',
  failed: '保存できません',
  changedTitle: '本番は前の内容のままです',
  changedBody: '「保存」を押すと、いまの内容が本番に出ます。',
} as const;

/** The band above the fields. */
export interface PublishBand {
  title: string;
  /** Listed under the title, one reason each. */
  lines: readonly string[];
  note: string | null;
}

export type FootprintsAnswer =
  | { kind: 'done'; toast: string }
  | {
      kind: 'band';
      band: PublishBand;
      /** The fields to mark in red. */
      fields: readonly EventFieldKey[];
      /** Whether the request changed the row, so the table must be read again. */
      changed: boolean;
    };

interface ProblemsBody {
  problems: { field: EventFieldKey; message: string }[];
  saved: boolean;
}

function isProblemsBody(body: unknown): body is ProblemsBody {
  return (
    typeof body === 'object' &&
    body !== null &&
    'problems' in body &&
    Array.isArray(body.problems) &&
    'saved' in body &&
    typeof body.saved === 'boolean'
  );
}

function savedAnyway(body: unknown): boolean {
  return typeof body === 'object' && body !== null && 'saved' in body && body.saved === true;
}

/**
 * What the edit panel says after `action`, on a row that was `status` when
 * it was pressed (null for a row not saved yet). `error` is what the request
 * threw, or null when it succeeded.
 *
 * - A refusal lists the worker's reasons. Whether the fields were saved
 *   anyway is the worker's answer too: a draft's are, a published row's are
 *   not
 * - A 502 that says it saved is a save that went through while the public
 *   JSON could not be written. The button to press again is the one the row
 *   shows now: a draft stays a draft, so 「公開」 is still there
 * - Anything else is a save that failed, said as before #281
 */
export function footprintsAnswerFor(action: FootAction, status: string | null, error: unknown): FootprintsAnswer {
  if (error === null) {
    if (action === 'publish') return { kind: 'done', toast: SAVE_TOAST.publish };
    if (action === 'withdraw') return { kind: 'done', toast: SAVE_TOAST.withdraw };

    return { kind: 'done', toast: status === 'published' ? SAVE_TOAST.savePublished : SAVE_TOAST.saveDraft };
  }

  if (error instanceof AdminApiError && error.status === 400 && isProblemsBody(error.body)) {
    const { problems, saved } = error.body;

    return {
      kind: 'band',
      band: {
        title: saved ? PUBLISH_TEXT.refusedPublish : PUBLISH_TEXT.refusedSave,
        lines: problems.map((p) => p.message),
        note: saved ? PUBLISH_TEXT.refusedPublishNote : PUBLISH_TEXT.refusedSaveNote,
      },
      fields: problems.map((p) => p.field),
      changed: saved,
    };
  }

  if (error instanceof AdminApiError && error.status === 502) {
    if (action === 'withdraw') {
      return {
        kind: 'band',
        band: { title: PUBLISH_TEXT.notWithdrawn, lines: [], note: PUBLISH_TEXT.notWithdrawnNote },
        fields: [],
        changed: false,
      };
    }

    if (savedAnyway(error.body)) {
      return {
        kind: 'band',
        band: {
          title: status === 'published' ? PUBLISH_TEXT.notWrittenSave : PUBLISH_TEXT.notWrittenPublish,
          lines: [],
          note: null,
        },
        fields: [],
        changed: true,
      };
    }
  }

  const message = error instanceof Error ? error.message : String(error);
  const field = fieldForSaveError(message);

  return {
    kind: 'band',
    band: { title: PUBLISH_TEXT.failed, lines: [], note: message },
    fields: field === null ? [] : [field],
    changed: false,
  };
}
