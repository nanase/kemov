import { env } from 'cloudflare:test';

import { listLive } from '../src/api/live';

/**
 * GET /api/live, against the real D1. The rule that recognises a free chat is
 * worker/test/video-rules.test.ts; this is the endpoint that applies it.
 */

async function insertChannel(channelId: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO channel (channel_id, name, fullname, color_key, color_sub, color_light, color_back, activity_start_date)
     VALUES (?1, ?1, ?1, '#000000', '#000000', '#000000', '#000000', '2021-01-01')`,
  )
    .bind(channelId)
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

describe('listLive', () => {
  const now = new Date('2026-09-07T12:00:00Z');

  test('answers with what is on air and what is announced', async () => {
    await insertChannel('UCaaa');
    await insertVideo('finished', 'UCaaa', { live: 'none' });
    await insertVideo('onair', 'UCaaa', { live: 'live' });
    await insertVideo('announced', 'UCaaa', {
      live: 'upcoming',
      scheduledStartTime: '2026-09-07T20:00:00Z',
    });

    const { streams } = await listLive(env, now);

    expect(streams.map((stream) => stream.videoId).sort()).toEqual(['announced', 'onair']);
  });

  test('says which state each stream is in', async () => {
    await insertChannel('UCaaa');
    await insertVideo('onair', 'UCaaa', { live: 'live' });

    expect((await listLive(env, now)).streams[0]).toMatchObject({ state: 'live', channelId: 'UCaaa' });
  });

  // What #64 built isFreeChatPlaceholder for, and the first caller it has.
  test('leaves out a free chat and says how many it left out', async () => {
    await insertChannel('UCaaa');
    await insertVideo('freechat', 'UCaaa', {
      live: 'upcoming',
      scheduledStartTime: '2028-09-01T12:30:00Z',
    });
    await insertVideo('real', 'UCaaa', {
      live: 'upcoming',
      scheduledStartTime: '2026-09-07T20:00:00Z',
    });

    const live = await listLive(env, now);

    expect(live.streams.map((stream) => stream.videoId)).toEqual(['real']);
    // Named rather than merely absent: a channel whose only upcoming stream is
    // a free chat otherwise looks like a channel with nothing scheduled.
    expect(live.excludedFreeChats).toEqual(1);
  });

  test('carries both the scheduled and the actual start', async () => {
    await insertChannel('UCaaa');
    await insertVideo('announced', 'UCaaa', {
      live: 'upcoming',
      scheduledStartTime: '2026-09-07T20:00:00Z',
    });

    expect((await listLive(env, now)).streams[0]).toMatchObject({
      scheduledStartTime: '2026-09-07T20:00:00Z',
      actualStartTime: null,
    });
  });

  test('carries no channel name or colour', async () => {
    await insertChannel('UCaaa');
    await insertVideo('onair', 'UCaaa', { live: 'live' });

    const stream = (await listLive(env, now)).streams[0] ?? {};

    expect(Object.keys(stream).sort()).toEqual([
      'actualStartTime',
      'channelId',
      'fetchedAt',
      'scheduledStartTime',
      'state',
      'title',
      'videoId',
    ]);
  });
});
