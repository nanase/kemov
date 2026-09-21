/**
 * Pure logic for publishing ジェネット楽曲一覧 (#141, #144) -
 * `GET /admin/api/genet/pending` and `POST /admin/api/genet/publish`'s own
 * response shapes, shared by PublishPage.vue's own section for this and (for
 * the badge count) SetsPage.vue.
 */

import { publishMarkFor, type PublishMark } from './publish-mark';

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
}

/**
 * Whether "いま公開する" can be pressed: something is waiting, or the stored
 * JSON is in an older shape. The worker builds again in exactly these cases
 * (`publishGenetMusicNow`), so the button must be neither stricter nor looser.
 * Not stricter: without the shape, a change of shape could not reach the
 * public JSON until somebody edited a row. Not looser: a row changed after it
 * was published has no revision newer than the last run, so `changed` alone
 * would enable a button that answers "待っているものがありません" (#201).
 */
export function canPublishGenet(state: GenetPendingResponse): boolean {
  return state.pending.length > 0 || state.shapeOutdated === true;
}

/** Whether the only reason to publish is the shape, so the screen can say so. */
export function publishesOnlyForShape(state: GenetPendingResponse): boolean {
  return state.pending.length === 0 && state.shapeOutdated === true;
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

/** The 状態 chip for one stream - the list, the edit header and the 公開 screen all draw it from here. */
export function streamMarkFor(status: string, videoId: string, state: GenetPendingResponse | null): PublishMark {
  return publishMarkFor(status, isWaiting(state, 'genet_stream', videoId));
}

/**
 * Whether a published stream is offered 「公開待ちにする」 again. A stream's own
 * changes are only part of it: publishing a stream also puts every tune and
 * person it performs, whose content changed, into the next run
 * (`publishStream`), and those rows have no screen of their own to do it from.
 * So it is offered when this stream changed, or when any tune or person did -
 * which stream a changed tune belongs to is not knowable from here. Another
 * stream having changed is no reason. null - unknown - offers it too, rather
 * than leaving the stream with no way forward.
 */
export function canRepublishStream(state: GenetPendingResponse | null, videoId: string): boolean {
  if (state === null) return true;

  return state.changed.some((entry) => entry.entity !== 'genet_stream' || entry.key === videoId);
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
