import { env } from 'cloudflare:test';

import { runRetention } from '../src/collector/retention';
import { BACKUP_VIDEO_MAX_AGE_DAYS, backupVideoCutoff, isRetentionTick, retentionCutoff } from '../src/lib/retention';
import { clearEverything } from './reset-db';

/**
 * The hourly deletion of #223, against the real D1: the foreign keys are what
 * decide whether the order of its statements is right, and only the real
 * schema has them.
 */

/** 2026-10-07T01:00:00Z, the first tick of an hour. The cutoff is 2026-09-07T02:00:00Z. */
const NOW = new Date('2026-10-07T01:00:00Z');

async function insertChannel(channelId: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO channel (channel_id, name, fullname, color_key, color_sub, color_light, color_back, activity_start_date)
     VALUES (?1, ?1, ?1, '#000000', '#000000', '#000000', '#000000', '2021-01-01')`,
  )
    .bind(channelId)
    .run();
}

async function insertSnapshot(channelId: string, fetchedAt: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO channel_snapshot (channel_id, fetched_at, subscriber_count, view_count, video_count)
     VALUES (?1, ?2, 1000, 50000, 100)`,
  )
    .bind(channelId, fetchedAt)
    .run();
}

async function insertExclusion(channelId: string, fetchedAt: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO channel_snapshot_exclusion (channel_id, fetched_at, reason) VALUES (?1, ?2, 'test')`,
  )
    .bind(channelId, fetchedAt)
    .run();
}

/** A video, unavailable since `lastAvailableAt` when that is given. */
async function insertVideo(videoId: string, lastAvailableAt?: string | null): Promise<void> {
  const unavailable = lastAvailableAt !== undefined;

  await env.DB.prepare(
    `INSERT INTO video (video_id, channel_id, title, published_at, availability, live_broadcast_content,
                        fetched_at, last_available_at)
     VALUES (?1, 'UCaaa', ?1, '2026-01-01T00:00:00Z', ?2, 'none', '2026-10-07T00:50:00Z', ?3)`,
  )
    .bind(videoId, unavailable ? 'unavailable' : 'public', unavailable ? lastAvailableAt : null)
    .run();
}

/** Every row of every table that names `videoId`, by table. */
async function rowsNaming(videoId: string): Promise<Record<string, number>> {
  const row = await env.DB.prepare(
    `SELECT (SELECT count(*) FROM video WHERE video_id = ?1) AS video,
            (SELECT count(*) FROM video_override WHERE video_id = ?1) AS video_override,
            (SELECT count(*) FROM chat_author WHERE video_id = ?1) AS chat_author,
            (SELECT count(*) FROM collect_task WHERE target_id = ?1) AS collect_task,
            (SELECT count(*) FROM footprints_event WHERE video_id = ?1) AS footprints_event`,
  )
    .bind(videoId)
    .first<Record<string, number>>();

  return row ?? {};
}

async function snapshots(): Promise<string[]> {
  const { results } = await env.DB.prepare('SELECT fetched_at FROM channel_snapshot ORDER BY fetched_at').all<{
    fetched_at: string;
  }>();

  return results.map((row) => row.fetched_at);
}

beforeEach(async () => {
  await clearEverything();
  await insertChannel('UCaaa');
});

describe('retentionCutoff', () => {
  test('is 30 days less an hour before the run', () => {
    expect(retentionCutoff(NOW)).toEqual('2026-09-07T02:00:00Z');
  });
});

// The 2 days docs/reference/data.md gives for video/, held to the figures it
// is worked out from.
describe('backupVideoCutoff', () => {
  test('lets a video into video/ for 30 - 27 - 1 days after its last fetch', () => {
    expect(BACKUP_VIDEO_MAX_AGE_DAYS).toEqual(2);
    expect(backupVideoCutoff(new Date('2026-10-07T00:20:00Z'))).toEqual('2026-10-05T00:20:00Z');
  });
});

describe('isRetentionTick', () => {
  test('is the tick at the top of the hour, and only that one', () => {
    expect(isRetentionTick(new Date('2026-10-07T01:00:00Z'))).toBe(true);
    expect(isRetentionTick(new Date('2026-10-07T01:09:59Z'))).toBe(true);
    expect(isRetentionTick(new Date('2026-10-07T01:10:00Z'))).toBe(false);
    expect(isRetentionTick(new Date('2026-10-07T01:50:00Z'))).toBe(false);
  });
});

describe('runRetention', () => {
  // The round trip #223 asks for, in its own terms: rows 31, 30 and 29 days
  // old. The 30-day one goes too, being older than 30 days less an hour;
  // ../src/api/channels.ts reads the 30-day change against the oldest row
  // left instead (see channels.test.ts).
  test('deletes the snapshots 31 and 30 days old and keeps the one 29 days old', async () => {
    await insertSnapshot('UCaaa', '2026-09-06T01:00:00Z');
    await insertSnapshot('UCaaa', '2026-09-07T01:00:00Z');
    await insertSnapshot('UCaaa', '2026-09-08T01:00:00Z');

    await runRetention(env, NOW, NOW);

    expect(await snapshots()).toEqual(['2026-09-08T01:00:00Z']);
  });

  test('draws the line at the cutoff to the second', async () => {
    await insertSnapshot('UCaaa', '2026-09-07T01:59:59Z');
    await insertSnapshot('UCaaa', '2026-09-07T02:00:00Z');

    await runRetention(env, NOW, NOW);

    expect(await snapshots()).toEqual(['2026-09-07T02:00:00Z']);
  });

  test('does nothing on the other five ticks of the hour', async () => {
    await insertSnapshot('UCaaa', '2026-09-01T00:00:00Z');

    const at = new Date('2026-10-07T01:10:00Z');

    await runRetention(env, at, at);

    expect(await snapshots()).toEqual(['2026-09-01T00:00:00Z']);
  });

  // A :00 tick that starts twelve minutes late is still the :00 tick, and the
  // cutoff follows when it runs rather than when it was due.
  test('deletes on a late start of the hourly tick, with the cutoff from when it ran', async () => {
    await insertSnapshot('UCaaa', '2026-09-07T02:11:59Z');
    await insertSnapshot('UCaaa', '2026-09-07T02:12:00Z');

    await runRetention(env, NOW, new Date('2026-10-07T01:12:00Z'));

    expect(await snapshots()).toEqual(['2026-09-07T02:12:00Z']);
  });

  // The foreign key refuses to delete a snapshot an exclusion names, so the
  // exclusion has to go first, in the same batch.
  test('deletes the exclusion marking a deleted snapshot, and keeps one marking a kept snapshot', async () => {
    await insertSnapshot('UCaaa', '2026-09-06T00:00:00Z');
    await insertSnapshot('UCaaa', '2026-09-20T00:00:00Z');
    await insertExclusion('UCaaa', '2026-09-06T00:00:00Z');
    await insertExclusion('UCaaa', '2026-09-20T00:00:00Z');

    await runRetention(env, NOW, NOW);

    const { results } = await env.DB.prepare('SELECT fetched_at FROM channel_snapshot_exclusion').all();

    expect(results).toEqual([{ fetched_at: '2026-09-20T00:00:00Z' }]);
    expect(await snapshots()).toEqual(['2026-09-20T00:00:00Z']);
  });

  test('deletes an unavailable video past the line, with every row that holds a key to it', async () => {
    await insertVideo('gone', '2026-09-07T01:59:59Z');
    await env.DB.prepare(`INSERT INTO video_override (video_id, title) VALUES ('gone', 'x')`).run();
    await env.DB.prepare(`INSERT INTO chat_author (video_id, author_id) VALUES ('gone', 'a')`).run();

    for (const kind of ['video_discover', 'video_update', 'chat_replay']) {
      await env.DB.prepare(
        `INSERT INTO collect_task (kind, target_id, state, updated_at) VALUES (?1, 'gone', 'unavailable', '2026-10-07T00:50:00Z')`,
      )
        .bind(kind)
        .run();
    }

    await runRetention(env, NOW, NOW);

    expect(await rowsNaming('gone')).toEqual({
      video: 0,
      video_override: 0,
      chat_author: 0,
      collect_task: 0,
      footprints_event: 0,
    });
  });

  test('keeps an unavailable video inside the line', async () => {
    await insertVideo('recent', '2026-09-07T02:00:00Z');

    await runRetention(env, NOW, NOW);

    expect((await rowsNaming('recent')).video).toEqual(1);
  });

  // Nothing says when it was last fetched, so it is not kept on the chance
  // that it was recently.
  test('deletes an unavailable video with no last_available_at', async () => {
    await insertVideo('undated', null);

    await runRetention(env, NOW, NOW);

    expect((await rowsNaming('undated')).video).toEqual(0);
  });

  // An available video's values are refreshed by the sweep, so its age is
  // not retention's business however old its row is.
  test('keeps an available video', async () => {
    await insertVideo('public');
    await env.DB.prepare(`UPDATE video SET fetched_at = '2026-01-01T00:00:00Z' WHERE video_id = 'public'`).run();

    await runRetention(env, NOW, NOW);

    expect((await rowsNaming('public')).video).toEqual(1);
  });

  // A footprints event names a video without a foreign key, and what it
  // holds is what a person wrote. #223 leaves it.
  test('leaves a footprints event naming a deleted video', async () => {
    await insertVideo('gone', '2026-09-01T00:00:00Z');
    await env.DB.prepare(
      `INSERT INTO footprints_event (date_precision, start_date, kind, title, video_id)
       VALUES ('day', '2026-01-01', 'other', 'x', 'gone')`,
    ).run();

    await runRetention(env, NOW, NOW);

    expect(await rowsNaming('gone')).toMatchObject({ video: 0, footprints_event: 1 });
  });

  // A channel's own video_discover row shares the kind with video targets.
  test('leaves collect_task rows that name a channel', async () => {
    await insertVideo('gone', '2026-09-01T00:00:00Z');
    await env.DB.prepare(
      `INSERT INTO collect_task (kind, target_id, state, updated_at) VALUES ('video_discover', 'UCaaa', 'failed', '2026-10-07T00:50:00Z')`,
    ).run();

    await runRetention(env, NOW, NOW);

    const { results } = await env.DB.prepare('SELECT target_id FROM collect_task').all();

    expect(results).toEqual([{ target_id: 'UCaaa' }]);
  });

  // One batch: if any statement is refused, none of them has happened.
  test('deletes nothing when one statement of the batch fails', async () => {
    await insertSnapshot('UCaaa', '2026-09-01T00:00:00Z');
    await insertVideo('gone', '2026-09-01T00:00:00Z');
    // A trigger refusing the video's deletion stands in for any failure
    // after the snapshots have gone.
    await env.DB.prepare(
      `CREATE TRIGGER refuse_video_delete BEFORE DELETE ON video BEGIN SELECT RAISE(ABORT, 'refused'); END`,
    ).run();

    try {
      await expect(runRetention(env, NOW, NOW)).rejects.toThrow();
    } finally {
      await env.DB.prepare('DROP TRIGGER refuse_video_delete').run();
    }

    expect(await snapshots()).toEqual(['2026-09-01T00:00:00Z']);
    expect((await rowsNaming('gone')).video).toEqual(1);
  });
});
