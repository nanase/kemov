import { env } from 'cloudflare:test';

import { listStreams, spanOf } from '../src/api/streams';
import { SPAN_CASES } from '../../test/fixtures/spanCases';

/**
 * What /api/streams computes, against the real D1. The routing that reaches
 * it is worker/test/api.test.ts.
 */

async function insertChannel(channelId: string, displayOrder = 0): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO channel (channel_id, name, fullname, color_key, color_sub, color_light, color_back, activity_start_date, display_order)
     VALUES (?1, ?1, ?1, '#000000', '#000000', '#000000', '#000000', '2021-01-01', ?2)`,
  )
    .bind(channelId, displayOrder)
    .run();
}

async function insertStream(
  videoId: string,
  channelId: string,
  actualStartTime: string,
  actualEndTime: string,
  overrides: {
    title?: string;
    availability?: string;
    durationSeconds?: number | null;
    viewCount?: number | null;
    chatMessageCount?: number | null;
  } = {},
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO video (video_id, channel_id, title, published_at, availability, live_broadcast_content,
                        type, duration_seconds, view_count, chat_message_count,
                        actual_start_time, actual_end_time, fetched_at)
     VALUES (?1, ?2, ?3, ?4, ?5, 'none', 'streaming', ?6, ?7, ?8, ?4, ?9, ?4)`,
  )
    .bind(
      videoId,
      channelId,
      overrides.title ?? videoId,
      actualStartTime,
      overrides.availability ?? 'public',
      overrides.durationSeconds ?? null,
      overrides.viewCount ?? null,
      overrides.chatMessageCount ?? null,
      actualEndTime,
    )
    .run();
}

beforeEach(async () => {
  await env.DB.prepare('DELETE FROM collect_task').run();
  await env.DB.prepare('DELETE FROM channel_snapshot').run();
  await env.DB.prepare('DELETE FROM video').run();
  await env.DB.prepare('DELETE FROM channel').run();
});

describe('spanOf', () => {
  test.each(SPAN_CASES)('%s', (_name, actualStartTime, actualEndTime, expected) => {
    expect(spanOf(actualStartTime, actualEndTime)).toEqual(expected);
  });
});

describe('listStreams', () => {
  test('answers every channel even with no streams yet', async () => {
    await insertChannel('UCaaa');

    const { channels } = await listStreams(env);

    expect(channels).toEqual([{ channelId: 'UCaaa', spans: [], recent: [] }]);
  });

  test('orders channels the same way /api/channels does', async () => {
    await insertChannel('UCbbb', 2);
    await insertChannel('UCaaa', 1);
    await insertChannel('UCccc', 0);

    const { channels } = await listStreams(env);

    expect(channels.map((channel) => channel.channelId)).toEqual(['UCccc', 'UCaaa', 'UCbbb']);
  });

  test('flattens spans oldest first', async () => {
    await insertChannel('UCaaa');
    await insertStream('newer', 'UCaaa', '2026-09-14T00:00:00Z', '2026-09-14T01:00:00Z');
    await insertStream('older', 'UCaaa', '2026-09-07T00:00:00Z', '2026-09-07T01:00:00Z');

    const { channels } = await listStreams(env);

    // Both spans start at the same JST time of week, 60 minutes long, so the
    // pairs repeat - what this checks is that 'older' comes first.
    expect(channels[0]?.spans).toEqual([1980, 60, 1980, 60]);
  });

  test('keeps only the five most recent streams, newest first', async () => {
    await insertChannel('UCaaa');

    for (let day = 1; day <= 7; day += 1) {
      await insertStream(`v${day}`, 'UCaaa', `2026-09-0${day}T00:00:00Z`, `2026-09-0${day}T01:00:00Z`);
    }

    const { channels } = await listStreams(env);

    expect(channels[0]?.recent.map((stream) => stream.videoId)).toEqual(['v7', 'v6', 'v5', 'v4', 'v3']);
  });

  test('answers a recent stream with the fields the detail needs', async () => {
    await insertChannel('UCaaa');
    await insertStream('v1', 'UCaaa', '2026-09-14T00:00:00Z', '2026-09-14T02:00:00Z', {
      title: '配信タイトル',
      durationSeconds: 7200,
      viewCount: 1234,
      chatMessageCount: 5678,
    });

    const { channels } = await listStreams(env);

    expect(channels[0]?.recent[0]).toEqual({
      videoId: 'v1',
      title: '配信タイトル',
      actualStartTime: '2026-09-14T00:00:00Z',
      actualEndTime: '2026-09-14T02:00:00Z',
      durationSeconds: 7200,
      viewCount: 1234,
      chatMessageCount: 5678,
    });
  });

  test('leaves out what is not public', async () => {
    await insertChannel('UCaaa');
    await insertStream('hidden', 'UCaaa', '2026-09-14T00:00:00Z', '2026-09-14T01:00:00Z', {
      availability: 'membership',
    });

    const { channels } = await listStreams(env);

    expect(channels[0]).toMatchObject({ spans: [], recent: [] });
  });

  test('leaves out a video that is not a finished stream', async () => {
    await insertChannel('UCaaa');
    await env.DB.prepare(
      `INSERT INTO video (video_id, channel_id, title, published_at, availability, live_broadcast_content,
                          type, scheduled_start_time, fetched_at)
       VALUES ('upcoming', 'UCaaa', 'upcoming', '2026-09-14T00:00:00Z', 'public', 'upcoming',
               'streaming', '2026-09-14T00:00:00Z', '2026-09-14T00:00:00Z')`,
    ).run();
    await env.DB.prepare(
      `INSERT INTO video (video_id, channel_id, title, published_at, availability, live_broadcast_content,
                          type, fetched_at)
       VALUES ('ordinary-video', 'UCaaa', 'ordinary-video', '2026-09-14T00:00:00Z', 'public', 'none',
               'video', '2026-09-14T00:00:00Z')`,
    ).run();

    const { channels } = await listStreams(env);

    expect(channels[0]).toMatchObject({ spans: [], recent: [] });
  });

  test('is the newest fetched_at among the streams it targets, or null with none', async () => {
    await insertChannel('UCaaa');

    expect((await listStreams(env)).fetchedAt).toBeNull();

    await env.DB.prepare(
      `INSERT INTO video (video_id, channel_id, title, published_at, availability, live_broadcast_content,
                          type, actual_start_time, actual_end_time, fetched_at)
       VALUES ('older', 'UCaaa', 'older', '2026-09-07T00:00:00Z', 'public', 'none',
               'streaming', '2026-09-07T00:00:00Z', '2026-09-07T01:00:00Z', '2026-09-07T02:00:00Z')`,
    ).run();
    await env.DB.prepare(
      `INSERT INTO video (video_id, channel_id, title, published_at, availability, live_broadcast_content,
                          type, actual_start_time, actual_end_time, fetched_at)
       VALUES ('newer', 'UCaaa', 'newer', '2026-09-14T00:00:00Z', 'public', 'none',
               'streaming', '2026-09-14T00:00:00Z', '2026-09-14T01:00:00Z', '2026-09-14T02:00:00Z')`,
    ).run();

    expect((await listStreams(env)).fetchedAt).toEqual('2026-09-14T02:00:00Z');
  });
});
