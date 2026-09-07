import { env } from 'cloudflare:test';

import { health } from '../src/api/health';

/**
 * GET /api/health, against the real D1.
 */

async function insertChannel(channelId: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO channel (channel_id, name, fullname, color_key, color_sub, color_light, color_back, activity_start_date)
     VALUES (?1, ?1, ?1, '#000000', '#000000', '#000000', '#000000', '2021-01-01')`,
  )
    .bind(channelId)
    .run();
}

async function insertSnapshot(
  channelId: string,
  fetchedAt: string,
  values: { subscribers?: number | null; views?: number; videos?: number } = {},
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO channel_snapshot (channel_id, fetched_at, subscriber_count, view_count, video_count)
     VALUES (?1, ?2, ?3, ?4, ?5)`,
  )
    .bind(
      channelId,
      fetchedAt,
      values.subscribers === undefined ? 1000 : values.subscribers,
      values.views ?? 50000,
      values.videos ?? 100,
    )
    .run();
}

async function insertVideo(
  videoId: string,
  channelId: string,
  overrides: {
    publishedAt?: string;
    availability?: string;
    live?: string;
    type?: string | null;
    durationSeconds?: number | null;
    viewCount?: number | null;
    scheduledStartTime?: string | null;
  } = {},
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO video (video_id, channel_id, title, published_at, availability, live_broadcast_content,
                        type, duration_seconds, view_count, scheduled_start_time, fetched_at)
     VALUES (?1, ?2, ?1, ?3, ?4, ?5, ?6, ?7, ?8, ?9, '2026-09-07T00:00:00Z')`,
  )
    .bind(
      videoId,
      channelId,
      overrides.publishedAt ?? '2026-01-01T00:00:00Z',
      overrides.availability ?? 'public',
      overrides.live ?? 'none',
      overrides.type ?? null,
      overrides.durationSeconds ?? null,
      overrides.viewCount ?? null,
      overrides.scheduledStartTime ?? null,
    )
    .run();
}

beforeEach(async () => {
  await env.DB.prepare('DELETE FROM collect_task').run();
  await env.DB.prepare('DELETE FROM channel_snapshot').run();
  await env.DB.prepare('DELETE FROM video').run();
  await env.DB.prepare('DELETE FROM channel').run();
});

describe('health', () => {
  test('says a job has never succeeded rather than guessing a time', async () => {
    const { jobs } = await health(env);

    expect(jobs.find((job) => job.job === 'chat-replay')).toEqual({
      job: 'chat-replay',
      lastSuccessAt: null,
      pending: 0,
    });
  });

  test('reads each job success from where that job writes its results', async () => {
    await insertChannel('UCaaa');
    await insertSnapshot('UCaaa', '2026-09-07T12:00:00Z');
    await insertVideo('v1', 'UCaaa');

    const { jobs } = await health(env);
    const byName = Object.fromEntries(jobs.map((job) => [job.job, job.lastSuccessAt]));

    expect(byName['channel-stats']).toEqual('2026-09-07T12:00:00Z');
    expect(byName['video-discover']).toEqual('2026-09-07T00:00:00Z');
  });

  test('counts each job unsettled work separately', async () => {
    await env.DB.prepare(
      `INSERT INTO collect_task (kind, target_id, state, attempts, next_attempt_at, updated_at)
       VALUES ('chat_replay', 'v1', 'failed', 3, '2026-09-07T13:00:00Z', '2026-09-07T12:00:00Z'),
              ('chat_replay', 'v2', 'pending', 0, NULL, '2026-09-07T12:00:00Z'),
              ('video_update', 'v3', 'failed', 1, '2026-09-07T13:00:00Z', '2026-09-07T12:00:00Z'),
              ('video_update', 'v4', 'done', 0, NULL, '2026-09-07T12:00:00Z')`,
    ).run();

    const { jobs } = await health(env);
    const byName = Object.fromEntries(jobs.map((job) => [job.job, job.pending]));

    expect(byName['chat-replay']).toEqual(2);
    // 'done' is settled and is not waiting for anything.
    expect(byName['video-update']).toEqual(1);
    expect(byName['channel-stats']).toEqual(0);
  });
});
