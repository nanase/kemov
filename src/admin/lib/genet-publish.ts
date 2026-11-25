/**
 * Pure logic for publishing ジェネット楽曲一覧 (#141, #144, #284) -
 * `GET /admin/api/genet/pending` and `POST /admin/api/genet/publish`'s
 * response shapes for the list's 「本番に反映」, and what SetsPage.vue says after a
 * stream's 「公開」, 「保存」 or 「非公開に戻す」 and after a tune's 保存.
 * `worker/src/admin/genet-publish.ts` decides whether a stream or a tune may
 * reach the public JSON and says why not; the functions here only turn its
 * answer into words, so the screen never checks a row itself (#277's
 * decision 1d).
 */

import { AdminApiError } from './api';
import { SAVE_TOAST } from './editing';
import { fieldForSaveError as fieldForStreamSaveError, type StreamFieldError } from './genet-streams';
import { fieldForSaveError as fieldForTuneSaveError, type TuneFieldError } from './genet-tunes';
import {
  bandReasonIdsWhere,
  publishAnswerFor,
  type AnsweredAction,
  type PublishAnswer,
  type PublishBand,
} from './publishing';

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
  behind: boolean;
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
  return state.pending.length > 0 || state.shapeOutdated === true || state.behind;
}

/** Whether the only reason to publish is the shape, so the screen can say so. */
export function publishesOnlyForShape(state: GenetPendingResponse): boolean {
  return state.pending.length === 0 && state.shapeOutdated === true && !state.behind;
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
 * lib/publishing.ts's `bandReasonIdsWhere` for one of the two bands: the
 * stream's, or the open tune's, each naming its lines and its note by its
 * own ids.
 */
export function streamBandReasonIds(
  band: PublishBand | null,
  fields: readonly StreamFieldError[],
  matches: (field: StreamFieldError) => boolean,
): string | undefined {
  return bandReasonIdsWhere(band, fields, matches, { reasonId: streamReasonId, noteId: STREAM_NOTE_ID });
}

export function tuneBandReasonIds(
  band: PublishBand | null,
  fields: readonly TuneFieldError[],
  matches: (field: TuneFieldError) => boolean,
): string | undefined {
  return bandReasonIdsWhere(band, fields, matches, { reasonId: tuneReasonId, noteId: TUNE_NOTE_ID });
}

export type GenetAnswer<F> = PublishAnswer<F>;

/**
 * What the editor says after `action` on a stream that was `status` when it
 * was pressed (null for one not saved yet) - lib/publishing.ts's
 * `publishAnswerFor`, with the stream coming back as `stream`, and each
 * reason a refusal lists marking the part of the form it is about: the
 * title, the video id, or one performance.
 */
export function streamAnswerFor(
  action: AnsweredAction,
  status: string | null,
  error: unknown,
): GenetAnswer<StreamFieldError> {
  return publishAnswerFor<StreamFieldError>(
    {
      rowKey: 'stream',
      fieldForSaveError: fieldForStreamSaveError,
      fieldOfProblem: (problem) => ({
        section: problem.field as StreamFieldError['section'],
        performanceIndex: typeof problem.performanceIndex === 'number' ? problem.performanceIndex : null,
        sceneIndex: null,
      }),
    },
    action,
    status,
    error,
  );
}

interface TuneProblem {
  attributeIndex: number;
  message: string;
}

function tuneProblemsOf(body: unknown): TuneProblem[] | null {
  if (typeof body !== 'object' || body === null || !('problems' in body) || !Array.isArray(body.problems)) return null;

  return body.problems as TuneProblem[];
}

function savedAnyway(body: unknown): boolean {
  return typeof body === 'object' && body !== null && 'saved' in body && body.saved === true;
}

/**
 * What the open tune says after its 保存. `published` is the worker's answer
 * when it went through: whether a published stream performs the tune, so
 * that the save reached the public JSON (#284's 6-5).
 *
 * A refusal is only ever for such a tune, and nothing was saved. A 502 that
 * says it saved went through while the public JSON could not be written.
 * Anything else is read as `publishAnswerFor` reads a failed save, under the
 * tune's own title.
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

  const answer = publishAnswerFor<TuneFieldError>(
    { rowKey: 'tune', fieldForSaveError: fieldForTuneSaveError },
    'save',
    null,
    error,
  );

  return answer.kind === 'band' ? { ...answer, band: { ...answer.band, title: TUNE_TEXT.failed } } : answer;
}
