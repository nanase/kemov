import { kindLabel, targetLabel, type CollectTask } from '@/admin/lib/collect-tasks';

function task(overrides: Partial<CollectTask> = {}): CollectTask {
  return {
    kind: 'channel_stats',
    targetId: 'UCaaa',
    state: 'failed',
    attempts: 3,
    nextAttemptAt: null,
    updatedAt: '2026-09-19T00:00:00Z',
    checkedAt: null,
    displayName: null,
    isChannelFailure: true,
    ...overrides,
  };
}

describe('kindLabel', () => {
  test.each([
    ['channel_stats', 'チャンネル統計'],
    ['video_discover', '動画の一覧取得'],
    ['video_update', '動画の更新'],
    ['chat_replay', 'チャット'],
  ])('labels %s as %s', (kind, label) => {
    expect(kindLabel(kind)).toEqual(label);
  });

  test('falls back to the raw value for an unknown kind', () => {
    expect(kindLabel('future_kind')).toEqual('future_kind');
  });
});

describe('targetLabel', () => {
  test('prefers the worker-joined display name', () => {
    expect(targetLabel(task({ displayName: 'ケープペンギン', targetId: 'UCaaa' }))).toEqual('ケープペンギン');
  });

  test('falls back to the bare target id when there is no display name', () => {
    expect(targetLabel(task({ displayName: null, targetId: 'vidGhost' }))).toEqual('vidGhost');
  });
});
