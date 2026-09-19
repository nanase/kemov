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
