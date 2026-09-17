import { env } from 'cloudflare:test';

/**
 * The constraints 0004_add_admin_overrides_and_twitch.sql adds. Nothing in
 * `worker/src/` reads or writes these tables yet - that is #144's later
 * tasks - so this is the schema on its own, exercised with raw SQL rather
 * than through application code.
 */

async function insertChannel(channelId: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO channel (channel_id, name, fullname, color_key, color_sub, color_light, color_back, activity_start_date)
     VALUES (?1, ?1, ?1, '#000000', '#000000', '#000000', '#000000', '2021-01-01')`,
  )
    .bind(channelId)
    .run();
}

async function insertVideo(videoId: string, channelId: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO video (video_id, channel_id, title, published_at, availability, live_broadcast_content, fetched_at)
     VALUES (?1, ?2, ?1, '2026-01-01T00:00:00Z', 'public', 'none', '2026-01-01T00:00:00Z')`,
  )
    .bind(videoId, channelId)
    .run();
}

async function insertSnapshot(channelId: string, fetchedAt: string): Promise<void> {
  await env.DB.prepare(
    'INSERT INTO channel_snapshot (channel_id, fetched_at, view_count, video_count) VALUES (?1, ?2, 0, 0)',
  )
    .bind(channelId, fetchedAt)
    .run();
}

beforeEach(async () => {
  await env.DB.prepare('DELETE FROM channel_snapshot_exclusion').run();
  await env.DB.prepare('DELETE FROM video_override').run();
  await env.DB.prepare('DELETE FROM collect_task').run();
  await env.DB.prepare('DELETE FROM channel_snapshot').run();
  await env.DB.prepare('DELETE FROM video').run();
  await env.DB.prepare('DELETE FROM channel').run();
});

describe('video_override', () => {
  test('accepts an override of just one column', async () => {
    await insertChannel('UCaaa');
    await insertVideo('vid1', 'UCaaa');

    await expect(
      env.DB.prepare("INSERT INTO video_override (video_id, title) VALUES ('vid1', 'renamed')").run(),
    ).resolves.toMatchObject({ success: true });
  });

  test('refuses a row that overrides none of the three columns', async () => {
    await insertChannel('UCaaa');
    await insertVideo('vid1', 'UCaaa');

    await expect(env.DB.prepare("INSERT INTO video_override (video_id) VALUES ('vid1')").run()).rejects.toThrow();
  });

  test('refuses a video that does not exist', async () => {
    await expect(
      env.DB.prepare("INSERT INTO video_override (video_id, title) VALUES ('nope', 'x')").run(),
    ).rejects.toThrow();
  });
});

describe('channel_snapshot_exclusion', () => {
  test('excludes a tick that exists', async () => {
    await insertChannel('UCaaa');
    await insertSnapshot('UCaaa', '2026-01-01T00:00:00Z');

    await expect(
      env.DB.prepare(
        "INSERT INTO channel_snapshot_exclusion (channel_id, fetched_at, reason) VALUES ('UCaaa', '2026-01-01T00:00:00Z', 'spike')",
      ).run(),
    ).resolves.toMatchObject({ success: true });
  });

  test('refuses a tick that does not exist', async () => {
    await insertChannel('UCaaa');

    await expect(
      env.DB.prepare(
        "INSERT INTO channel_snapshot_exclusion (channel_id, fetched_at, reason) VALUES ('UCaaa', '2026-01-01T00:00:00Z', 'spike')",
      ).run(),
    ).rejects.toThrow();
  });

  test('refuses an empty reason', async () => {
    await insertChannel('UCaaa');
    await insertSnapshot('UCaaa', '2026-01-01T00:00:00Z');

    await expect(
      env.DB.prepare(
        "INSERT INTO channel_snapshot_exclusion (channel_id, fetched_at, reason) VALUES ('UCaaa', '2026-01-01T00:00:00Z', '')",
      ).run(),
    ).rejects.toThrow();
  });
});

describe('collect_task.checked_at', () => {
  test('accepts a well-formed timestamp', async () => {
    await expect(
      env.DB.prepare(
        `INSERT INTO collect_task (kind, target_id, state, updated_at, checked_at)
         VALUES ('channel_stats', 'UCaaa', 'failed', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')`,
      ).run(),
    ).resolves.toMatchObject({ success: true });
  });

  test('refuses a timestamp shaped like something other than the schema shape', async () => {
    await expect(
      env.DB.prepare(
        `INSERT INTO collect_task (kind, target_id, state, updated_at, checked_at)
         VALUES ('channel_stats', 'UCaaa', 'failed', '2026-01-01T00:00:00Z', '2026-01-01 00:00:00')`,
      ).run(),
    ).rejects.toThrow();
  });
});

describe('channel.twitch', () => {
  test('round-trips a value', async () => {
    await env.DB.prepare(
      `INSERT INTO channel (channel_id, name, fullname, color_key, color_sub, color_light, color_back, activity_start_date, twitch)
       VALUES ('UCaaa', 'x', 'x', '#000000', '#000000', '#000000', '#000000', '2021-01-01', 'cape_kemov')`,
    ).run();

    expect(await env.DB.prepare("SELECT twitch FROM channel WHERE channel_id = 'UCaaa'").first()).toEqual({
      twitch: 'cape_kemov',
    });
  });
});
