import { env } from 'cloudflare:test';

import {
  ackCollectTask,
  listCollectTasks,
  markCollectTaskUnavailable,
  retryCollectTask,
} from '../src/admin/collect-tasks';
import { clearEverything } from './reset-db';

beforeEach(clearEverything);

async function insertChannel(channelId: string, name = channelId): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO channel (channel_id, name, fullname, color_key, color_sub, color_light, color_back, activity_start_date)
     VALUES (?1, ?2, ?2, '#000000', '#000000', '#000000', '#000000', '2021-01-01')
     ON CONFLICT (channel_id) DO NOTHING`,
  )
    .bind(channelId, name)
    .run();
}

async function insertVideo(videoId: string, channelId: string, title = videoId): Promise<void> {
  await insertChannel(channelId);
  await env.DB.prepare(
    `INSERT INTO video (video_id, channel_id, title, published_at, availability, live_broadcast_content, type, fetched_at)
     VALUES (?1, ?2, ?3, '2026-09-01T00:00:00Z', 'public', 'none', 'video', '2026-09-01T00:00:00Z')`,
  )
    .bind(videoId, channelId, title)
    .run();
}

async function insertTask(
  kind: string,
  targetId: string,
  overrides: { state?: string; attempts?: number; nextAttemptAt?: string | null; checkedAt?: string | null } = {},
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO collect_task (kind, target_id, state, attempts, next_attempt_at, checked_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, '2026-09-01T00:00:00Z')`,
  )
    .bind(
      kind,
      targetId,
      overrides.state ?? 'failed',
      overrides.attempts ?? 1,
      overrides.nextAttemptAt ?? null,
      overrides.checkedAt ?? null,
    )
    .run();
}

const NOW = new Date('2026-09-19T12:00:00Z');

describe('listCollectTasks', () => {
  test('lists a failed, unacknowledged channel task with its channel name', async () => {
    await insertChannel('UCaaa', 'ケープペンギン');
    await insertTask('channel_stats', 'UCaaa');

    const body = (await (await listCollectTasks(env)).json()) as {
      collectTasks: { kind: string; targetId: string; displayName: string | null; isChannelFailure: boolean }[];
      count: number;
    };

    expect(body.collectTasks).toEqual([
      expect.objectContaining({
        kind: 'channel_stats',
        targetId: 'UCaaa',
        displayName: 'ケープペンギン',
        isChannelFailure: true,
      }),
    ]);
    expect(body.count).toEqual(1);
  });

  test('lists a failed, unacknowledged video task with its video title', async () => {
    await insertVideo('vid1', 'UCaaa', '配信アーカイブ');
    await insertTask('video_update', 'vid1');

    const body = (await (await listCollectTasks(env)).json()) as {
      collectTasks: { displayName: string | null; isChannelFailure: boolean }[];
    };

    expect(body.collectTasks).toEqual([
      expect.objectContaining({ displayName: '配信アーカイブ', isChannelFailure: false }),
    ]);
  });

  test('leaves out an acknowledged failure', async () => {
    await insertChannel('UCaaa');
    await insertTask('channel_stats', 'UCaaa', { checkedAt: '2026-09-10T00:00:00Z' });

    const body = (await (await listCollectTasks(env)).json()) as { collectTasks: unknown[] };

    expect(body.collectTasks).toEqual([]);
  });

  test('leaves out a settled task (done or unavailable)', async () => {
    await insertChannel('UCaaa');
    await insertTask('channel_stats', 'UCaaa', { state: 'done' });
    await insertVideo('vid1', 'UCaaa');
    await insertTask('video_update', 'vid1', { state: 'unavailable' });

    const body = (await (await listCollectTasks(env)).json()) as { collectTasks: unknown[] };

    expect(body.collectTasks).toEqual([]);
  });
});

describe('retryCollectTask', () => {
  test('moves a failed task back to pending, due now', async () => {
    await insertChannel('UCaaa');
    await insertTask('channel_stats', 'UCaaa', { nextAttemptAt: '2026-09-19T13:00:00Z' });

    const response = await retryCollectTask(env, 'channel_stats', 'UCaaa', NOW);
    const body = (await response.json()) as { collectTask: { state: string; nextAttemptAt: string } };

    expect(body.collectTask.state).toEqual('pending');
    expect(body.collectTask.nextAttemptAt).toEqual('2026-09-19T12:00:00Z');
  });

  test('refuses an unknown task with 404', async () => {
    const response = await retryCollectTask(env, 'channel_stats', 'UCnope', NOW);

    expect(response.status).toEqual(404);
  });
});

describe('ackCollectTask', () => {
  test('sets checked_at without changing state', async () => {
    await insertChannel('UCaaa');
    await insertTask('channel_stats', 'UCaaa');

    const response = await ackCollectTask(env, 'channel_stats', 'UCaaa', NOW);
    const body = (await response.json()) as { collectTask: { state: string; checkedAt: string | null } };

    expect(body.collectTask).toEqual(expect.objectContaining({ state: 'failed', checkedAt: '2026-09-19T12:00:00Z' }));
  });

  test('refuses an unknown task with 404', async () => {
    const response = await ackCollectTask(env, 'channel_stats', 'UCnope', NOW);

    expect(response.status).toEqual(404);
  });
});

describe('markCollectTaskUnavailable', () => {
  test('settles a video_update failure: video.availability and collect_task.state both become unavailable', async () => {
    await insertVideo('vid1', 'UCaaa');
    await insertTask('video_update', 'vid1');

    const response = await markCollectTaskUnavailable(env, 'video_update', 'vid1', NOW);
    const body = (await response.json()) as { collectTask: { state: string; nextAttemptAt: string | null } };

    expect(body.collectTask).toEqual(expect.objectContaining({ state: 'unavailable', nextAttemptAt: null }));

    const video = await env.DB.prepare('SELECT availability FROM video WHERE video_id = ?1')
      .bind('vid1')
      .first<{ availability: string }>();

    expect(video?.availability).toEqual('unavailable');
  });

  test('settles a chat_replay failure the same way', async () => {
    await insertVideo('vid1', 'UCaaa');
    await insertTask('chat_replay', 'vid1');

    const response = await markCollectTaskUnavailable(env, 'chat_replay', 'vid1', NOW);

    expect(response.status).toEqual(200);

    const video = await env.DB.prepare('SELECT availability FROM video WHERE video_id = ?1')
      .bind('vid1')
      .first<{ availability: string }>();

    expect(video?.availability).toEqual('unavailable');
  });

  test('refuses a channel_stats failure with 400', async () => {
    await insertChannel('UCaaa');
    await insertTask('channel_stats', 'UCaaa');

    const response = await markCollectTaskUnavailable(env, 'channel_stats', 'UCaaa', NOW);

    expect(response.status).toEqual(400);
  });

  test('refuses a video_discover failure whose target is a channel, with 400', async () => {
    await insertChannel('UCaaa');
    await insertTask('video_discover', 'UCaaa');

    const response = await markCollectTaskUnavailable(env, 'video_discover', 'UCaaa', NOW);

    expect(response.status).toEqual(400);
  });

  test('allows a video_discover failure whose target is a video', async () => {
    await insertVideo('vid1', 'UCaaa');
    await insertTask('video_discover', 'vid1');

    const response = await markCollectTaskUnavailable(env, 'video_discover', 'vid1', NOW);

    expect(response.status).toEqual(200);
  });

  test('refuses a video failure with no video row (404): never creates one', async () => {
    await insertTask('video_update', 'vidGhost');

    const response = await markCollectTaskUnavailable(env, 'video_update', 'vidGhost', NOW);

    expect(response.status).toEqual(404);
  });

  test('refuses an unknown task with 404', async () => {
    const response = await markCollectTaskUnavailable(env, 'video_update', 'vidNope', NOW);

    expect(response.status).toEqual(404);
  });
});
