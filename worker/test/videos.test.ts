import { env } from 'cloudflare:test';

import { listVideos, rankVideos } from '../src/api/videos';

/**
 * What the video endpoints compute, against the real D1. The metric
 * definitions on their own are worker/test/ranking.test.ts.
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

describe('listVideos', () => {
  test('answers newest first', async () => {
    await insertChannel('UCaaa');
    await insertVideo('older', 'UCaaa', { publishedAt: '2024-01-01T00:00:00Z' });
    await insertVideo('newer', 'UCaaa', { publishedAt: '2026-01-01T00:00:00Z' });

    const page = await listVideos(env, 'UCaaa', { limit: 10, cursor: null });

    expect(page.videos.map((video) => video.videoId)).toEqual(['newer', 'older']);
    expect(page.nextCursor).toBeNull();
  });

  test('pages through without repeating or skipping', async () => {
    await insertChannel('UCaaa');

    for (let index = 0; index < 5; index += 1) {
      await insertVideo(`v${index}`, 'UCaaa', { publishedAt: `2026-01-0${index + 1}T00:00:00Z` });
    }

    const first = await listVideos(env, 'UCaaa', { limit: 2, cursor: null });

    expect(first.nextCursor).not.toBeNull();

    const second = await listVideos(env, 'UCaaa', { limit: 2, cursor: first.nextCursor });
    const third = await listVideos(env, 'UCaaa', { limit: 2, cursor: second.nextCursor });
    const seen = [...first.videos, ...second.videos, ...third.videos].map((video) => video.videoId);

    expect(seen).toEqual(['v4', 'v3', 'v2', 'v1', 'v0']);
    expect(third.nextCursor).toBeNull();
  });

  // Two videos can share a published_at, and a cursor on that column alone
  // would lose one of them at every page boundary.
  test('pages through videos published at the same instant', async () => {
    await insertChannel('UCaaa');

    for (const videoId of ['a', 'b', 'c']) {
      await insertVideo(videoId, 'UCaaa', { publishedAt: '2026-01-01T00:00:00Z' });
    }

    const first = await listVideos(env, 'UCaaa', { limit: 2, cursor: null });
    const second = await listVideos(env, 'UCaaa', { limit: 2, cursor: first.nextCursor });
    const seen = [...first.videos, ...second.videos].map((video) => video.videoId);

    expect(new Set(seen).size).toEqual(3);
  });

  test('answers with one channel videos and not another', async () => {
    await insertChannel('UCaaa');
    await insertChannel('UCbbb');
    await insertVideo('mine', 'UCaaa');
    await insertVideo('theirs', 'UCbbb');

    const page = await listVideos(env, 'UCaaa', { limit: 10, cursor: null });

    expect(page.videos.map((video) => video.videoId)).toEqual(['mine']);
  });
});

describe('rankVideos', () => {
  test('orders by the metric asked for', async () => {
    await insertChannel('UCaaa');
    await insertVideo('small', 'UCaaa', { type: 'video', viewCount: 10 });
    await insertVideo('big', 'UCaaa', { type: 'video', viewCount: 1000 });

    const ranking = await rankVideos(env, 'viewCount', 10);

    expect(ranking.videos.map((video) => video.videoId)).toEqual(['big', 'small']);
    expect(ranking.videos[0]?.metricValue).toEqual(1000);
  });

  test('crosses channels', async () => {
    await insertChannel('UCaaa');
    await insertChannel('UCbbb');
    await insertVideo('a', 'UCaaa', { type: 'video', viewCount: 10 });
    await insertVideo('b', 'UCbbb', { type: 'video', viewCount: 20 });

    expect((await rankVideos(env, 'viewCount', 10)).videos.map((video) => video.videoId)).toEqual(['b', 'a']);
  });

  test('leaves out what is not public', async () => {
    await insertChannel('UCaaa');
    await insertVideo('shown', 'UCaaa', { type: 'video', viewCount: 10 });
    await insertVideo('hidden', 'UCaaa', { type: 'video', viewCount: 1000, availability: 'private' });

    expect((await rankVideos(env, 'viewCount', 10)).videos.map((video) => video.videoId)).toEqual(['shown']);
  });

  // Every migrated row starts with a null type and duration. They are not
  // ranked as if those were zero; they appear once video-update has reached
  // them.
  test('leaves out a row that cannot supply the metric', async () => {
    await insertChannel('UCaaa');
    await insertVideo('ready', 'UCaaa', { type: 'video', viewCount: 10, durationSeconds: 100 });
    await insertVideo('migrated', 'UCaaa', { type: null, viewCount: 1000, durationSeconds: null });

    expect((await rankVideos(env, 'viewCountPerSecond', 10)).videos.map((video) => video.videoId)).toEqual(['ready']);
  });

  // Both columns are INTEGER, and SQLite's / on two integers is integer
  // division: without the cast every rate under one is zero and the ranking
  // is a list of ties.
  test('computes a rate as a fraction rather than by integer division', async () => {
    await insertChannel('UCaaa');
    await insertVideo('slow', 'UCaaa', { type: 'video', viewCount: 1, durationSeconds: 100 });
    await insertVideo('slower', 'UCaaa', { type: 'video', viewCount: 1, durationSeconds: 1000 });

    const ranking = await rankVideos(env, 'viewCountPerSecond', 10);

    expect(ranking.videos.map((video) => video.videoId)).toEqual(['slow', 'slower']);
    expect(ranking.videos[0]?.metricValue).toBeCloseTo(0.01);
  });

  test('does not divide by a duration of zero', async () => {
    await insertChannel('UCaaa');
    await insertVideo('instant', 'UCaaa', { type: 'video', viewCount: 10, durationSeconds: 0 });

    expect((await rankVideos(env, 'viewCountPerSecond', 10)).videos).toEqual([]);
  });

  test('answers with no more than the limit', async () => {
    await insertChannel('UCaaa');

    for (let index = 0; index < 5; index += 1) {
      await insertVideo(`v${index}`, 'UCaaa', { type: 'video', viewCount: index });
    }

    expect((await rankVideos(env, 'viewCount', 2)).videos).toHaveLength(2);
  });
});
