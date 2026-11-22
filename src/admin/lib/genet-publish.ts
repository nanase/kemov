/**
 * Pure logic for publishing ジェネット楽曲一覧 (#141, #144, #284) -
 * `GET /admin/api/genet/pending` and `POST /admin/api/genet/publish`'s
 * response shapes for PublishPage.vue, and what SetsPage.vue says after a
 * stream's 「公開」, 「保存」 or 「非公開に戻す」 and after a tune's 保存.
 * `worker/src/admin/genet-publish.ts` decides whether a stream or a tune may
 * reach the public JSON and says why not; the functions here only turn its
 * answer into words, so the screen never checks a row itself (#277's
 * decision 1d).
 */

import { AdminApiError } from './api';
import { SAVE_TOAST } from './editing';
import type { FootAction } from './footprints';
import { PUBLISH_TEXT, type PublishBand } from './footprints-publish';
import { fieldForSaveError as fieldForStreamSaveError, type StreamFieldError } from './genet-streams';
import { fieldForSaveError as fieldForTuneSaveError, type TuneFieldError } from './genet-tunes';

export type GenetEntity = 'genet_stream' | 'genet_tune' | 'genet_person';

export interface PendingGenetEntry {
  entity: GenetEntity;
  key: string;
  revisionId: number;
  latestAction: string;
}

export interface ChangedGenetEntry {
  entity: GenetEntity;
  key: string;
  title: string;
}

/** `GET /admin/api/genet/pending`'s response. */
export interface GenetPendingResponse {
  pending: PendingGenetEntry[];
  changed: ChangedGenetEntry[];
  /** The stored JSON is in an older shape, so a run builds it again with nothing else waiting. */
  shapeOutdated?: boolean;
  /** Whether the public JSON may say what no revision says: a write of it was sent that no check found up to date since. */
  behind?: boolean;
}

/**
 * Whether "いま公開する" can be pressed: something is waiting, the stored
 * JSON is in an older shape, or it may be behind. The worker builds again in
 * exactly these cases (`publishGenetMusicNow`), so the button must be neither
 * stricter nor looser. Not stricter: without the shape, a change of shape
 * could not reach the public JSON until somebody edited a row. Not looser: a
 * row changed after it was published has no revision newer than the last
 * run, so `changed` alone would enable a button that answers
 * "待っているものがありません" (#201).
 */
export function canPublishGenet(state: GenetPendingResponse): boolean {
  return state.pending.length > 0 || state.shapeOutdated === true || state.behind === true;
}

/** Whether the only reason to publish is the shape, so the screen can say so. */
export function publishesOnlyForShape(state: GenetPendingResponse): boolean {
  return state.pending.length === 0 && state.shapeOutdated === true && state.behind !== true;
}

/**
 * Whether `entity`/`key` is waiting for "いま公開する" - its latest revision is
 * newer than the last run. null when the pending list could not be read.
 */
export function isWaiting(state: GenetPendingResponse | null, entity: GenetEntity, key: string): boolean | null {
  return state === null ? null : state.pending.some((entry) => entry.entity === entity && entry.key === key);
}

/** Whether `entity`/`key` differs from what it was published as. */
export function isChangedSincePublish(state: GenetPendingResponse | null, entity: GenetEntity, key: string): boolean {
  return state?.changed.some((entry) => entry.entity === entity && entry.key === key) ?? false;
}

export interface GenetPublishResult {
  published: boolean;
  publicationId?: number;
  streamCount?: number;
  tuneCount?: number;
  personCount?: number;
  byteLength?: number;
}

const ENTITY_LABEL: Record<GenetEntity, string> = {
  genet_stream: '配信',
  genet_tune: '曲',
  genet_person: '人',
};

export function entityLabel(entity: GenetEntity): string {
  return ENTITY_LABEL[entity];
}

/** The words a tune's 保存 adds to #277's decisions, for a tune a published stream performs (#284's 6-5). */
export const TUNE_TEXT = {
  failed: '曲を保存できません',
  refusedNote: '公開中の配信で演奏している曲は、公開の条件を満たさないと保存できません。本番は前の内容のままです。',
  notWritten: '保存しましたが、本番に出せませんでした。もう一度「この曲を保存」を押してください。',
} as const;

/** The id of a band's `lines[index]` in the page, and of its note: the stream's band, or the open tune's. */
export const streamReasonId = (index: number): string => `sets-reason-${index}`;
export const STREAM_NOTE_ID = 'sets-band-note';
export const tuneReasonId = (index: number): string => `tune-reason-${index}`;
export const TUNE_NOTE_ID = 'tune-band-note';

/**
 * The ids of what `band` says about the parts of the form `matches` picks
 * out of `fields`, for a control's aria-describedby, or undefined when it
 * says nothing about them. A refusal lists one reason for each field it
 * marks, in the same order; any other band that marks a field says why in
 * its note. The same rule as あしあと's `bandReasonIds`.
 */
export function reasonIdsFor<F>(
  band: PublishBand | null,
  fields: readonly F[],
  matches: (field: F) => boolean,
  reasonId: (index: number) => string,
  noteId: string,
): string | undefined {
  if (band === null || !fields.some(matches)) return undefined;

  if (band.lines.length === fields.length) {
    return fields.flatMap((f, i) => (matches(f) ? [reasonId(i)] : [])).join(' ');
  }

  return band.note === null ? undefined : noteId;
}

export type GenetAnswer<F> =
  | { kind: 'done'; toast: string }
  | {
      kind: 'band';
      band: PublishBand;
      /** The parts of the form to mark in red. */
      fields: readonly F[];
      /** Whether the request changed the row, so the list must be read again. */
      changed: boolean;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function savedAnyway(body: unknown): boolean {
  return isRecord(body) && body.saved === true;
}

interface StreamProblem {
  field: 'title' | 'videoId' | 'performances';
  performanceIndex: number | null;
  message: string;
}

function streamProblemsOf(body: unknown): { problems: StreamProblem[]; saved: boolean } | null {
  if (!isRecord(body) || !Array.isArray(body.problems) || typeof body.saved !== 'boolean') return null;

  return { problems: body.problems as StreamProblem[], saved: body.saved };
}

/** The status the stream has now, as a 502 that saved anyway gives it, or null when the answer carries no stream. */
function statusNow(body: unknown): string | null {
  if (!isRecord(body) || !isRecord(body.stream)) return null;

  return typeof body.stream.status === 'string' ? body.stream.status : null;
}

/**
 * What the editor says after `action` on a stream that was `status` when it
 * was pressed. `error` is what the request threw, or null when it succeeded.
 * The same reading as あしあと's `footprintsAnswerFor`:
 *
 * - A refusal lists the worker's reasons, and says whether the fields were
 *   saved anyway - a draft's are, a published stream's are not
 * - A 502 that says it saved went through while the public JSON could not be
 *   written, or brought up to date after the change was recorded; the
 *   button to press again is the one the stream shows now
 * - Anything else failed. A 404, a 409 or a 5xx may mean the stream is not
 *   what the screen shows, so the list is read again; a 400 changed nothing
 */
export function streamAnswerFor(action: FootAction, status: string, error: unknown): GenetAnswer<StreamFieldError> {
  if (error === null) {
    if (action === 'publish') return { kind: 'done', toast: SAVE_TOAST.publish };
    if (action === 'withdraw') return { kind: 'done', toast: SAVE_TOAST.withdraw };

    return { kind: 'done', toast: status === 'published' ? SAVE_TOAST.savePublished : SAVE_TOAST.saveDraft };
  }

  const refusal = error instanceof AdminApiError && error.status === 400 ? streamProblemsOf(error.body) : null;

  if (refusal !== null) {
    const { problems, saved } = refusal;

    return {
      kind: 'band',
      band: {
        title: saved ? PUBLISH_TEXT.refusedPublish : PUBLISH_TEXT.refusedSave,
        lines: problems.map((p) => p.message),
        note: saved ? PUBLISH_TEXT.refusedPublishNote : PUBLISH_TEXT.refusedSaveNote,
      },
      fields: problems.map((p) => ({ section: p.field, performanceIndex: p.performanceIndex, sceneIndex: null })),
      changed: saved,
    };
  }

  if (error instanceof AdminApiError && error.status === 502) {
    if (action === 'withdraw') {
      return savedAnyway(error.body)
        ? {
            kind: 'band',
            band: { title: PUBLISH_TEXT.withdrawnBehind, lines: [], note: PUBLISH_TEXT.withdrawnBehindNote },
            fields: [],
            changed: true,
          }
        : {
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

  return failedAnswer(error, fieldForStreamSaveError);
}

interface TuneProblem {
  attributeIndex: number;
  message: string;
}

function tuneProblemsOf(body: unknown): TuneProblem[] | null {
  if (!isRecord(body) || !Array.isArray(body.problems)) return null;

  return body.problems as TuneProblem[];
}

/**
 * What the open tune says after its 保存. `published` is the worker's answer
 * when it went through: whether a published stream performs the tune, so
 * that the save reached the public JSON (#284's 6-5).
 *
 * A refusal is only ever for such a tune, and nothing was saved. A 502 that
 * says it saved went through while the public JSON could not be written.
 */
export function tuneAnswerFor(published: boolean, error: unknown): GenetAnswer<TuneFieldError> {
  if (error === null) return { kind: 'done', toast: published ? SAVE_TOAST.savePublished : SAVE_TOAST.saved };

  const problems = error instanceof AdminApiError && error.status === 400 ? tuneProblemsOf(error.body) : null;

  if (problems !== null) {
    return {
      kind: 'band',
      band: { title: TUNE_TEXT.failed, lines: problems.map((p) => p.message), note: TUNE_TEXT.refusedNote },
      fields: problems.map((p) => ({ section: 'attributes', index: p.attributeIndex })),
      changed: false,
    };
  }

  if (error instanceof AdminApiError && error.status === 502 && savedAnyway(error.body)) {
    return { kind: 'band', band: { title: TUNE_TEXT.notWritten, lines: [], note: null }, fields: [], changed: true };
  }

  const answer = failedAnswer(error, fieldForTuneSaveError);

  return answer.kind === 'band' ? { ...answer, band: { ...answer.band, title: TUNE_TEXT.failed } } : answer;
}

/** A request that failed in any other way: its message, and the part of the form it names. */
function failedAnswer<F>(error: unknown, fieldFor: (message: string) => F | null): GenetAnswer<F> {
  const message = error instanceof Error ? error.message : String(error);
  const field = fieldFor(message);
  const answered = error instanceof AdminApiError ? error.status : 0;

  return {
    kind: 'band',
    band: { title: PUBLISH_TEXT.failed, lines: [], note: message },
    fields: field === null ? [] : [field],
    changed: answered === 404 || answered === 409 || answered >= 500,
  };
}
