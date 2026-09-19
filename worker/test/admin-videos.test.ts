import { env } from 'cloudflare:test';

import { listVideos } from '../src/admin/videos';
import { clearEverything } from './reset-db';

beforeEach(clearEverything);

async function insertChannel(channelId: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO channel (channel_id, name, fullname, color_key, color_sub, color_light, color_back, activity_start_date)
     VALUES (?1, ?1, ?1, '#000000', '#000000', '#000000', '#000000', '2021-01-01')
     ON CONFLICT (channel_id) DO NOTHING`,
  )
    .bind(channelId)
    .run();
}

async function insertVideo(
  videoId: string,
  channelId: string,
  title: string,
  overrides: { publishedAt?: string; type?: string | null; availability?: string } = {},
): Promise<void> {
  await insertChannel(channelId);
  await env.DB.prepare(
    `INSERT INTO video (video_id, channel_id, title, published_at, availability, live_broadcast_content, type, fetched_at)
     VALUES (?1, ?2, ?3, ?4, ?5, 'none', ?6, ?4)`,
  )
    .bind(
      videoId,
      channelId,
      title,
      overrides.publishedAt ?? '2026-09-01T00:00:00Z',
      overrides.availability ?? 'public',
      overrides.type ?? 'streaming',
    )
    .run();
}

describe('listVideos', () => {
  test('lists every video, newest published first', async () => {
    await insertVideo('vid1', 'UCaaa', 'older', { publishedAt: '2026-08-01T00:00:00Z' });
    await insertVideo('vid2', 'UCaaa', 'newer', { publishedAt: '2026-09-01T00:00:00Z' });

    const response = await listVideos(env, null, null, null);
    const body = (await response.json()) as { videos: { videoId: string }[] };

    expect(body.videos.map((v) => v.videoId)).toEqual(['vid2', 'vid1']);
  });

  test('narrows by a substring of title', async () => {
    await insertVideo('vid1', 'UCaaa', 'ジェネットの歌枠');
    await insertVideo('vid2', 'UCaaa', '別の配信');

    const response = await listVideos(env, 'ジェネット', null, null);
    const body = (await response.json()) as { videos: { videoId: string }[] };

    expect(body.videos.map((v) => v.videoId)).toEqual(['vid1']);
  });

  test('narrows by channelId', async () => {
    await insertVideo('vid1', 'UCaaa', 'x');
    await insertVideo('vid2', 'UCbbb', 'y');

    const response = await listVideos(env, null, 'UCaaa', null);
    const body = (await response.json()) as { videos: { videoId: string }[] };

    expect(body.videos.map((v) => v.videoId)).toEqual(['vid1']);
  });

  test('refuses an unknown channelId with 400', async () => {
    const response = await listVideos(env, null, 'UCnope', null);

    expect(response.status).toEqual(400);
    expect(await response.json()).toEqual({ error: 'unknown channelId: UCnope' });
  });

  test('marks a video that has an override', async () => {
    await insertVideo('vid1', 'UCaaa', 'x');
    await env.DB.prepare(
      `INSERT INTO video_override (video_id, title, type, availability, memo, updated_at)
       VALUES ('vid1', '上書き後の題', NULL, NULL, NULL, '2026-09-01T00:00:00Z')`,
    ).run();

    const response = await listVideos(env, null, null, null);
    const body = (await response.json()) as { videos: { videoId: string; hasOverride: boolean }[] };

    expect(body.videos).toEqual([expect.objectContaining({ videoId: 'vid1', hasOverride: true })]);
  });

  test('does not mark a video with no override', async () => {
    await insertVideo('vid1', 'UCaaa', 'x');

    const response = await listVideos(env, null, null, null);
    const body = (await response.json()) as { videos: { hasOverride: boolean }[] };

    expect(body.videos[0]!.hasOverride).toEqual(false);
  });

  test('defaults to 50, refuses a limit above 100', async () => {
    expect((await listVideos(env, null, null, '101')).status).toEqual(400);
    expect((await listVideos(env, null, null, '100')).status).toEqual(200);
    expect((await listVideos(env, null, null, '0')).status).toEqual(400);
  });

  test('respects a limit within range', async () => {
    for (let i = 0; i < 5; i++) await insertVideo(`vid${i}`, 'UCaaa', `x${i}`);

    const response = await listVideos(env, null, null, '2');
    const body = (await response.json()) as { videos: unknown[] };

    expect(body.videos).toHaveLength(2);
  });

  // D1's own LIKE/GLOB pattern length limit is 50 bytes, the same reason
  // footprints.ts's listEvents refuses a q this long.
  test('refuses a q whose escaped, wrapped pattern would exceed the D1 LIKE limit', async () => {
    const response = await listVideos(env, 'a'.repeat(49), null, null);

    expect(response.status).toEqual(400);
  });
});
