/**
 * 版の履歴 (#144's task 13) - `GET /admin/api/revisions[/:id]` and
 * `GET /admin/api/publications` (added alongside this screen).
 */

export interface RevisionListItem {
  revisionId: number;
  entity: string;
  entityKey: string;
  action: string;
  createdVia: string;
  createdAt: string;
}

export interface Revision extends RevisionListItem {
  body: Record<string, unknown> | null;
}

export interface Publication {
  publicationId: number;
  target: string;
  lastRevisionId: number;
  objectKey: string;
  byteLength: number;
  publishedAt: string;
}

const ENTITY_LABEL: Record<string, string> = {
  footprints_event: 'あしあと',
  genet_stream: 'ジェネット配信',
  genet_tune: 'ジェネット楽曲',
  genet_person: 'ジェネット人物',
  channel: 'メンバー',
  video_override: '配信・動画の上書き',
  channel_snapshot_exclusion: '統計の除外',
};

const ACTION_LABEL: Record<string, string> = {
  import: '収集',
  publish: '公開',
  withdraw: '取り下げ',
  save: '保存',
  delete: '削除',
};

const TARGET_LABEL: Record<string, string> = {
  footprints: 'あしあと',
  genet_music: 'ジェネット楽曲一覧',
};

// created_via's two values, in one place so nothing else spells 'admin' or
// 'claude_code' out as a label of its own - HQ's decision (2026-09-19).
const CREATED_VIA_LABEL: Record<string, string> = {
  admin: '管理サイト',
  claude_code: 'Claude Code',
};

export const ENTITIES = Object.keys(ENTITY_LABEL);
export const ACTIONS = Object.keys(ACTION_LABEL);

export function entityLabel(entity: string): string {
  return ENTITY_LABEL[entity] ?? entity;
}

export function actionLabel(action: string): string {
  return ACTION_LABEL[action] ?? action;
}

export function targetLabel(target: string): string {
  return TARGET_LABEL[target] ?? target;
}

export function createdViaLabel(createdVia: string): string {
  return CREATED_VIA_LABEL[createdVia] ?? createdVia;
}

export interface RevisionFilters {
  entity: string | null;
  action: string | null;
  from: string | null;
  to: string | null;
}

export function revisionsQuery(filters: RevisionFilters): string {
  const params = new URLSearchParams();

  if (filters.entity !== null) params.set('entity', filters.entity);
  if (filters.action !== null) params.set('action', filters.action);
  if (filters.from !== null) params.set('from', filters.from);
  if (filters.to !== null) params.set('to', filters.to);

  const qs = params.toString();

  return qs === '' ? '' : `?${qs}`;
}

const UNITS = ['B', 'KB', 'MB', 'GB'];

/** `byteLength` for a person to read - one decimal place once it is worth one, none below 10 of a unit. */
export function formatBytes(byteLength: number): string {
  let value = byteLength;
  let unit = 0;

  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }

  const text = unit === 0 ? String(value) : value < 10 ? value.toFixed(1) : value.toFixed(0);

  return `${text} ${UNITS[unit]}`;
}
