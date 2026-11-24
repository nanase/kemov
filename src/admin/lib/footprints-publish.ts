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

/**
 * The 状態 chip for one row. Every あしあと screen draws it from here. Not
 * `publishMarkFor` (publish-mark.ts): that one tells 公開待ち from 公開 for a
 * data publishing in two steps, and あしあと has no 公開待ち since #281.
 */
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
  withdrawnBehind: '非公開に戻しましたが、本番から外せませんでした',
  withdrawnBehindNote: '公開中のほかの行を「保存」すると、本番からも外れます。',
  /** The 公開 screen's, while the worker says the JSON may be behind. */
  behind: '本番のあしあとが記録と食い違っているかもしれません。',
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

/** The id of a band's `lines[index]` in the page, and of its note. */
export const bandReasonId = (index: number): string => `foot-reason-${index}`;
export const BAND_NOTE_ID = 'foot-band-note';

/**
 * The ids of what `band` says about `field`, for its control's
 * aria-describedby, or undefined when the band says nothing about it. A
 * refusal lists one reason for each field it marks, in the same order as
 * `fields`; any other band that marks a field says why in its note.
 */
export function bandReasonIds(
  band: PublishBand | null,
  fields: readonly EventFieldKey[],
  field: EventFieldKey,
): string | undefined {
  if (band === null || !fields.includes(field)) return undefined;

  if (band.lines.length === fields.length) {
    return fields.flatMap((f, i) => (f === field ? [bandReasonId(i)] : [])).join(' ');
  }

  return band.note === null ? undefined : BAND_NOTE_ID;
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

/** The status the row has now, as a 502 that saved anyway gives it, or null when the answer carries no row. */
function statusNow(body: unknown): string | null {
  if (typeof body !== 'object' || body === null || !('event' in body)) return null;

  const event = body.event;

  if (typeof event !== 'object' || event === null || !('status' in event)) return null;

  return typeof event.status === 'string' ? event.status : null;
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
 *   JSON could not be written, or could not be brought up to date after the
 *   change was recorded. The button to press again is the one the row shows
 *   now, read from the answer: a draft whose JSON could not be written stays
 *   a draft, so 「公開」 is still there, but one recorded as published shows
 *   「保存」. A withdraw that says it saved made the row a draft while the
 *   JSON may still have it, and the next publish of any row takes it out
 * - Anything else is a request that failed, said as before #281. A 404, a
 *   409 or a 5xx may mean the row is not what the screen shows - deleted or
 *   withdrawn elsewhere, or written before a later step failed - so the table
 *   is read again. A 400 changed nothing, and reading again would put back the
 *   fields over what was typed
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
    if (action === 'withdraw' && savedAnyway(error.body)) {
      return {
        kind: 'band',
        band: { title: PUBLISH_TEXT.withdrawnBehind, lines: [], note: PUBLISH_TEXT.withdrawnBehindNote },
        fields: [],
        changed: true,
      };
    }

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
          title:
            (statusNow(error.body) ?? status) === 'published'
              ? PUBLISH_TEXT.notWrittenSave
              : PUBLISH_TEXT.notWrittenPublish,
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
  const answered = error instanceof AdminApiError ? error.status : 0;

  return {
    kind: 'band',
    band: { title: PUBLISH_TEXT.failed, lines: [], note: message },
    fields: field === null ? [] : [field],
    changed: answered === 404 || answered === 409 || answered >= 500,
  };
}
