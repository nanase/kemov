/**
 * 収集の失敗 (#144's task 13) - `GET`/`POST /admin/api/collect-tasks/...`
 * (added alongside this screen).
 */

export interface CollectTask {
  kind: string;
  targetId: string;
  state: string;
  attempts: number;
  nextAttemptAt: string | null;
  updatedAt: string;
  checkedAt: string | null;
  displayName: string | null;
  isChannelFailure: boolean;
}

const KIND_LABEL: Record<string, string> = {
  channel_stats: 'チャンネル統計',
  video_discover: '動画の一覧取得',
  video_update: '動画の更新',
  chat_replay: 'チャット',
};

/** The kind's Japanese name, or the raw value for a kind this screen does not know about (schema grew, screen has not caught up). */
export function kindLabel(kind: string): string {
  return KIND_LABEL[kind] ?? kind;
}

/** What to show for the failing row itself - its channel/video name when the worker's join found one, the bare id otherwise. */
export function targetLabel(task: CollectTask): string {
  return task.displayName ?? task.targetId;
}
