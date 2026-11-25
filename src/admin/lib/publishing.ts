/**
 * What every data that publishes in one step (#277, #281) shows about it:
 * the 状態 chip, the buttons at the bottom of the edit panel, and what the
 * panel says after 「公開」, 「保存」 or 「非公開に戻す」. Each data reads its
 * own answers through `publishAnswerFor`, naming its row and its fields.
 *
 * The worker decides whether a row may publish and says why not; the
 * functions here only turn its answer into words, so the screen never checks
 * a row itself (#277's decision 1d).
 */

import { AdminApiError } from './api';
import { EDITING_TEXT, SAVE_TOAST } from './editing';
import type { PublishMark } from './publish-mark';

/** What the buttons at the bottom of the edit panel do. */
export type PublishAction = 'publish' | 'save' | 'withdraw';

/** What `publishAnswerFor` answers for: the buttons above, and 削除. */
export type AnsweredAction = PublishAction | 'delete';

/**
 * The 状態 chip for one row: its status, and nothing else - every publish
 * reaches the public site in the same request. Not `publishMarkFor`
 * (publish-mark.ts): that one tells 公開待ち from 公開 for a data publishing
 * in two steps.
 */
export function liveMarkFor(status: string): PublishMark {
  return status === 'published' ? { label: '公開中', tone: 'published' } : { label: '下書き', tone: 'draft' };
}

/**
 * The edit panel's buttons, left to right, the first being the primary one,
 * and what is said beside them (#277's decision 1a, 6-9). The worker refuses
 * to delete a published row (409), so 削除 is shown but cannot be pressed,
 * with the reason beside it.
 */
export interface PublishFoot {
  actions: readonly { action: PublishAction; label: string }[];
  /** Beside the buttons, or null. */
  note: string | null;
  deleteDisabled: boolean;
  /** Why 削除 cannot be pressed, or null when it can. */
  deleteReason: string | null;
}

export const FOOT_TEXT = {
  publish: '公開',
  save: '保存',
  withdraw: '非公開に戻す',
  liveNote: '保存するとすぐ本番に出ます',
  deleteReason: '公開中は削除できません。先に「非公開に戻す」を押してください。',
} as const;

/** The buttons for a saved row whose `status` is `status`. A row not yet saved has its own (保存 and やめる). */
export function publishFootFor(status: string): PublishFoot {
  if (status === 'published') {
    return {
      actions: [
        { action: 'save', label: FOOT_TEXT.save },
        { action: 'withdraw', label: FOOT_TEXT.withdraw },
      ],
      note: FOOT_TEXT.liveNote,
      deleteDisabled: true,
      deleteReason: FOOT_TEXT.deleteReason,
    };
  }

  return {
    actions: [
      { action: 'publish', label: FOOT_TEXT.publish },
      { action: 'save', label: FOOT_TEXT.save },
    ],
    note: null,
    deleteDisabled: false,
    deleteReason: null,
  };
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
  withdrawnBehindNote: '公開の画面で「いま公開する」を押すと本番からも外れます',
  failed: '保存できません',
  removeFailed: '削除できません',
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
export function bandReasonIds<F extends string>(
  band: PublishBand | null,
  fields: readonly F[],
  field: F,
): string | undefined {
  return bandReasonIdsWhere(band, fields, (f) => f === field);
}

/**
 * `bandReasonIds` for fields that are not plain names - the ones `matches`
 * picks - and for a page with more than one band, each naming its lines and
 * its note by its own `ids`.
 */
export function bandReasonIdsWhere<F>(
  band: PublishBand | null,
  fields: readonly F[],
  matches: (field: F) => boolean,
  ids: { reasonId: (index: number) => string; noteId: string } = { reasonId: bandReasonId, noteId: BAND_NOTE_ID },
): string | undefined {
  if (band === null || !fields.some(matches)) return undefined;

  if (band.lines.length === fields.length) {
    return fields.flatMap((f, i) => (matches(f) ? [ids.reasonId(i)] : [])).join(' ');
  }

  return band.note === null ? undefined : ids.noteId;
}

export type PublishAnswer<F> =
  | { kind: 'done'; toast: string }
  | {
      kind: 'band';
      band: PublishBand;
      /** The fields to mark in red. */
      fields: readonly F[];
      /** Whether the request changed the row, so the table must be read again. */
      changed: boolean;
    };

/** One reason a refusal lists: the field it is about, and whatever else the worker says of it. */
export type RefusalProblem = { field: string; message: string } & Record<string, unknown>;

/** How one data's answers name its row and its fields. */
export interface AnswerShape<F> {
  /** The key the row comes back under in the worker's answer: `event`, `milestone`, `stream`. */
  rowKey: string;
  /** Which field a failed save's message is about, or null when it names none. */
  fieldForSaveError(message: string): F | null;
  /**
   * The field to mark for one reason a refusal lists. Without it, the
   * problem's `field` is the field - a data whose fields are plain names.
   */
  fieldOfProblem?(problem: RefusalProblem): F;
  /**
   * The note in place of the worker's message for a 502 that saved nothing:
   * the row changed under the request, and the public JSON it had written
   * could not be built again without the change. Without it the worker's
   * message is shown, as for any failure.
   */
  notMendedNote?: string;
}

interface ProblemsBody {
  problems: RefusalProblem[];
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

function savedNothing(body: unknown): boolean {
  return typeof body === 'object' && body !== null && 'saved' in body && body.saved === false;
}

/** The status the row has now, as a 502 that saved anyway gives it under `rowKey`, or null when the answer carries no row. */
function statusNow(body: unknown, rowKey: string): string | null {
  if (typeof body !== 'object' || body === null || !(rowKey in body)) return null;

  const row = (body as Record<string, unknown>)[rowKey];

  if (typeof row !== 'object' || row === null || !('status' in row)) return null;

  return typeof row.status === 'string' ? row.status : null;
}

/**
 * What the edit panel says after `action`, on a row that was `status` when
 * it was pressed (null for a row not saved yet). `error` is what the request
 * threw, or null when it succeeded.
 *
 * - A refusal lists the worker's reasons. Whether the fields were saved
 *   anyway is the worker's answer too: a draft's are, a published row's are
 *   not
 * - A 502 that says it saved nothing is a row that changed under the
 *   request while the public JSON it wrote could not be mended - a save's
 *   or a withdraw's: the target's `notMendedNote` says so, when it has one,
 *   and the table is read again
 * - A 502 that says it saved is a save that went through while the public
 *   JSON could not be written, or could not be brought up to date after the
 *   change was recorded. The button to press again is the one the row shows
 *   now, read from the answer: a draft whose JSON could not be written stays
 *   a draft, so 「公開」 is still there, but one recorded as published shows
 *   「保存」. A withdraw that says it saved made the row a draft while the
 *   JSON may still have it, and the next publish of any row takes it out
 * - Anything else is a request that failed. A 404, a 409 or a 5xx may mean
 *   the row is not what the screen shows - deleted or withdrawn elsewhere, or
 *   written before a later step failed - so the table is read again. A 400
 *   changed nothing, and reading again would put back the fields over what
 *   was typed
 */
export function publishAnswerFor<F>(
  shape: AnswerShape<F>,
  action: AnsweredAction,
  status: string | null,
  error: unknown,
): PublishAnswer<F> {
  if (error === null) {
    if (action === 'delete') return { kind: 'done', toast: EDITING_TEXT.removed };
    if (action === 'publish') return { kind: 'done', toast: SAVE_TOAST.publish };
    if (action === 'withdraw') return { kind: 'done', toast: SAVE_TOAST.withdraw };

    return { kind: 'done', toast: status === 'published' ? SAVE_TOAST.savePublished : SAVE_TOAST.saveDraft };
  }

  if (error instanceof AdminApiError && error.status === 400 && isProblemsBody(error.body)) {
    const { problems, saved } = error.body;
    const fieldOf = shape.fieldOfProblem ?? ((problem: RefusalProblem) => problem.field as F);

    return {
      kind: 'band',
      band: {
        title: saved ? PUBLISH_TEXT.refusedPublish : PUBLISH_TEXT.refusedSave,
        lines: problems.map((p) => p.message),
        note: saved ? PUBLISH_TEXT.refusedPublishNote : PUBLISH_TEXT.refusedSaveNote,
      },
      fields: problems.map(fieldOf),
      changed: saved,
    };
  }

  if (error instanceof AdminApiError && error.status === 502) {
    if (shape.notMendedNote !== undefined && savedNothing(error.body)) {
      return {
        kind: 'band',
        band: {
          title: action === 'withdraw' ? PUBLISH_TEXT.notWithdrawn : PUBLISH_TEXT.failed,
          lines: [],
          note: shape.notMendedNote,
        },
        fields: [],
        changed: true,
      };
    }

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
            (statusNow(error.body, shape.rowKey) ?? status) === 'published'
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
  const field = shape.fieldForSaveError(message);
  const answered = error instanceof AdminApiError ? error.status : 0;

  return {
    kind: 'band',
    band: { title: action === 'delete' ? PUBLISH_TEXT.removeFailed : PUBLISH_TEXT.failed, lines: [], note: message },
    fields: field === null ? [] : [field],
    changed: answered === 404 || answered === 409 || answered >= 500,
  };
}
