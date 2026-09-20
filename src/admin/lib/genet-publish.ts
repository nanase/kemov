/**
 * Pure logic for publishing ジェネット楽曲一覧 (#141, #144) -
 * `GET /admin/api/genet/pending` and `POST /admin/api/genet/publish`'s own
 * response shapes, shared by PublishPage.vue's own section for this and (for
 * the badge count) SetsPage.vue.
 */

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
 * Whether "いま公開する" can be pressed: something is waiting or changed, or the
 * stored JSON is in an older shape. The worker builds again in exactly these
 * cases (`publishGenetMusicNow`), so the button must not be stricter than it.
 * Without the last one, a change of shape could not reach the public JSON
 * until somebody edited a row.
 */
export function canPublishGenet(state: GenetPendingResponse): boolean {
  return state.pending.length > 0 || state.changed.length > 0 || state.shapeOutdated === true;
}

/** Whether the only reason to publish is the shape, so the screen can say so. */
export function publishesOnlyForShape(state: GenetPendingResponse): boolean {
  return state.pending.length === 0 && state.changed.length === 0 && state.shapeOutdated === true;
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
