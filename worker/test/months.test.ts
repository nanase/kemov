import { env } from 'cloudflare:test';

import { monthsSeries } from '../src/api/months';

/**
 * What /api/months computes, against the real D1.
 */

async function insertChannel(channelId: string, activityStartDate: string, activityEndDate: string | null = null) {
  await env.DB.prepare(
    `INSERT INTO channel (channel_id, name, fullname, color_key, color_sub, color_light, color_back,
                          activity_start_date, activity_end_date, display_order)
     VALUES (?1, ?1, ?1, '#000000', '#000000', '#000000', '#000000', ?2, ?3, 0)`,
  )
    .bind(channelId, activityStartDate, activityEndDate)
    .run();
}

async function insertSnapshot(channelId: string, fetchedAt: string, subscriberCount: number | null): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO channel_snapshot (channel_id, fetched_at, subscriber_count, view_count, video_count)
     VALUES (?1, ?2, ?3, 0, 0)`,
  )
    .bind(channelId, fetchedAt, subscriberCount)
    .run();
}

async function insertVideo(
  videoId: string,
  channelId: string,
  overrides: {
    publishedAt?: string;
    availability?: string;
    type?: string | null;
    durationSeconds?: number | null;
    viewCount?: number | null;
    chatMessageCount?: number | null;
    chatUniqueUserCount?: number | null;
  } = {},
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO video (video_id, channel_id, title, published_at, availability, live_broadcast_content,
                        type, duration_seconds, view_count, chat_message_count, chat_unique_user_count, fetched_at)
     VALUES (?1, ?2, ?1, ?3, ?4, 'none', ?5, ?6, ?7, ?8, ?9, ?10)`,
  )
    .bind(
      videoId,
      channelId,
      overrides.publishedAt ?? '2026-01-01T00:00:00Z',
      overrides.availability ?? 'public',
      overrides.type ?? 'streaming',
      overrides.durationSeconds ?? null,
      overrides.viewCount ?? null,
      overrides.chatMessageCount ?? null,
      overrides.chatUniqueUserCount ?? null,
      '2026-09-07T00:00:00Z',
    )
    .run();
}

async function insertOverride(
  videoId: string,
  overrides: { title?: string | null; type?: string | null; availability?: string | null } = {},
): Promise<void> {
  await env.DB.prepare(`INSERT INTO video_override (video_id, title, type, availability) VALUES (?1, ?2, ?3, ?4)`)
    .bind(videoId, overrides.title ?? null, overrides.type ?? null, overrides.availability ?? null)
    .run();
}

beforeEach(async () => {
  await env.DB.prepare('DELETE FROM collect_task').run();
  await env.DB.prepare('DELETE FROM channel_snapshot_exclusion').run();
  await env.DB.prepare('DELETE FROM video_override').run();
  await env.DB.prepare('DELETE FROM channel_snapshot').run();
  await env.DB.prepare('DELETE FROM video').run();
  await env.DB.prepare('DELETE FROM channel').run();
});

const now = new Date('2026-09-17T00:00:00Z');

describe('monthsSeries', () => {
  test('answers with the months from the earliest debut to the current JST month', async () => {
    await insertChannel('UCaaa', '2026-07-15');

    const result = await monthsSeries(env, now);

    expect(result.months).toEqual(['2026-07', '2026-08', '2026-09']);
  });

  // The subscriber series left with #225: `channel_snapshot` keeps 30 days,
  // so it could only ever cover the last month or two. The statistics page
  // reads the published milestones instead.
  test('carries no subscriber series, whatever channel_snapshot holds', async () => {
    await insertChannel('UCaaa', '2026-07-01');
    await insertSnapshot('UCaaa', '2026-09-10T00:00:00Z', 1000);

    const result = await monthsSeries(env, now);

    expect(result.channels[0]).not.toHaveProperty('subscribers');
    expect(result.total).not.toHaveProperty('subscribers');
  });

  // The month boundary is JST midnight, which is 15:00 UTC the day before.
  // A video either side of it must land in the JST month, not the UTC one.
  test('puts a video either side of the JST month boundary in the right month', async () => {
    await insertChannel('UCaaa', '2026-08-01');
    await insertVideo('before', 'UCaaa', { publishedAt: '2026-08-31T14:59:59Z', type: 'streaming' });
    await insertVideo('after', 'UCaaa', { publishedAt: '2026-08-31T15:00:00Z', type: 'streaming' });

    const result = await monthsSeries(env, now);
    const channel = result.channels[0] as { streams: (number | null)[] };
    const august = result.months.indexOf('2026-08');
    const september = result.months.indexOf('2026-09');

    expect(channel.streams[august]).toEqual(1);
    expect(channel.streams[september]).toEqual(1);
  });

  test('is null before the member debuted and zero after, even with no videos', async () => {
    await insertChannel('UCaaa', '2026-08-15');

    const result = await monthsSeries(env, now);
    const channel = result.channels[0] as { streams: (number | null)[] };

    expect(result.months).toEqual(['2026-08', '2026-09']);
    expect(channel.streams).toEqual([0, 0]);
  });

  test('is null for a member before their own debut month, while another has data', async () => {
    await insertChannel('UCaaa', '2026-07-01');
    await insertChannel('UCbbb', '2026-09-01');
    await insertVideo('v', 'UCaaa', { publishedAt: '2026-07-01T00:00:00Z', type: 'streaming' });

    const result = await monthsSeries(env, now);
    const late = result.channels.find((channel) => (channel as { channelId: string }).channelId === 'UCbbb') as {
      streams: (number | null)[];
    };

    expect(result.months).toEqual(['2026-07', '2026-08', '2026-09']);
    expect(late.streams).toEqual([null, null, 0]);
  });

  test('is zero for a member after they ended activity, not null', async () => {
    await insertChannel('UCaaa', '2026-07-01', '2026-08-01');
    await insertVideo('v', 'UCaaa', { publishedAt: '2026-07-15T00:00:00Z', type: 'streaming' });

    const result = await monthsSeries(env, now);
    const channel = result.channels[0] as { streams: (number | null)[] };

    expect(result.months).toEqual(['2026-07', '2026-08', '2026-09']);
    expect(channel.streams).toEqual([1, 0, 0]);
  });

  test('counts each of the seven series correctly', async () => {
    await insertChannel('UCaaa', '2026-09-01');
    await insertVideo('stream', 'UCaaa', {
      type: 'streaming',
      durationSeconds: 3600,
      viewCount: 100,
      chatMessageCount: 50,
      chatUniqueUserCount: 10,
      publishedAt: '2026-09-01T00:00:00Z',
    });
    await insertVideo('video', 'UCaaa', {
      type: 'video',
      viewCount: 200,
      publishedAt: '2026-09-02T00:00:00Z',
    });
    await insertVideo('short', 'UCaaa', {
      type: 'shorts',
      viewCount: 300,
      publishedAt: '2026-09-03T00:00:00Z',
    });

    const result = await monthsSeries(env, now);
    const channel = result.channels[0] as Record<string, (number | null)[]>;
    const month = result.months.indexOf('2026-09');

    expect(channel.streams?.[month]).toEqual(1);
    expect(channel.videos?.[month]).toEqual(1);
    expect(channel.shorts?.[month]).toEqual(1);
    expect(channel.streamSeconds?.[month]).toEqual(3600);
    expect(channel.chatMessages?.[month]).toEqual(50);
    expect(channel.chatUniqueUsers?.[month]).toEqual(10);
    expect(channel.views?.[month]).toEqual(600);
  });

  test('a type override moves a video from one series to another', async () => {
    await insertChannel('UCaaa', '2026-09-01');
    await insertVideo('v', 'UCaaa', { type: 'video', publishedAt: '2026-09-01T00:00:00Z' });
    await insertOverride('v', { type: 'streaming' });

    const result = await monthsSeries(env, now);
    const channel = result.channels[0] as { streams: (number | null)[]; videos: (number | null)[] };
    const month = result.months.indexOf('2026-09');

    expect(channel.streams[month]).toEqual(1);
    expect(channel.videos[month]).toEqual(0);
  });

  test('leaves out a video overridden to a non-public availability', async () => {
    await insertChannel('UCaaa', '2026-09-01');
    await insertVideo('v', 'UCaaa', { type: 'streaming', publishedAt: '2026-09-01T00:00:00Z' });
    await insertOverride('v', { availability: 'private' });

    const result = await monthsSeries(env, now);
    const channel = result.channels[0] as { streams: (number | null)[] };
    const month = result.months.indexOf('2026-09');

    expect(channel.streams[month]).toEqual(0);
  });

  test('leaves out a video that is not public or not yet typed', async () => {
    await insertChannel('UCaaa', '2026-09-01');
    await insertVideo('private', 'UCaaa', { availability: 'private', type: 'streaming', viewCount: 1000 });
    await insertVideo('untyped', 'UCaaa', { type: null, viewCount: 1000 });

    const result = await monthsSeries(env, now);
    const channel = result.channels[0] as { views: (number | null)[]; streams: (number | null)[] };
    const month = result.months.indexOf('2026-09');

    expect(channel.views[month]).toEqual(0);
    expect(channel.streams[month]).toEqual(0);
  });

  test('sums the members into total, treating a null as nothing', async () => {
    await insertChannel('UCaaa', '2026-07-01');
    await insertChannel('UCbbb', '2026-09-01');
    await insertVideo('a', 'UCaaa', { publishedAt: '2026-07-15T00:00:00Z', type: 'streaming' });
    await insertVideo('b', 'UCbbb', { publishedAt: '2026-09-15T00:00:00Z', type: 'streaming' });

    const result = await monthsSeries(env, now);
    const july = result.months.indexOf('2026-07');
    const september = result.months.indexOf('2026-09');

    // July: only UCaaa exists (1), UCbbb is null-before-debut and counts as
    // nothing rather than as a hole in the sum.
    expect(result.total.streams?.[july]).toEqual(1);
    expect(result.total.streams?.[september]).toEqual(1);
  });

  test('reports the newest fetched_at among the videos it counts', async () => {
    await insertChannel('UCaaa', '2026-09-01');
    await insertVideo('older', 'UCaaa', { publishedAt: '2026-09-01T00:00:00Z' });

    const result = await monthsSeries(env, now);

    expect(result.fetchedAt).toEqual('2026-09-07T00:00:00Z');
  });

  test('is null when there is no video to count', async () => {
    await insertChannel('UCaaa', '2026-09-01');

    const result = await monthsSeries(env, now);

    expect(result.fetchedAt).toBeNull();
  });

  test('orders channels the same way /api/channels does', async () => {
    await env.DB.prepare(
      `INSERT INTO channel (channel_id, name, fullname, color_key, color_sub, color_light, color_back, activity_start_date, display_order)
       VALUES ('UCbbb', 'UCbbb', 'UCbbb', '#000000', '#000000', '#000000', '#000000', '2026-01-01', 2),
              ('UCaaa', 'UCaaa', 'UCaaa', '#000000', '#000000', '#000000', '#000000', '2026-01-01', 1),
              ('UCccc', 'UCccc', 'UCccc', '#000000', '#000000', '#000000', '#000000', '2026-01-01', 0)`,
    ).run();

    const result = await monthsSeries(env, now);

    expect(result.channels.map((channel) => (channel as { channelId: string }).channelId)).toEqual([
      'UCccc',
      'UCaaa',
      'UCbbb',
    ]);
  });

  test('answers with nothing when there is no channel at all', async () => {
    const result = await monthsSeries(env, now);

    expect(result).toEqual({
      fetchedAt: null,
      months: [],
      channels: [],
      total: {
        streams: [],
        videos: [],
        shorts: [],
        streamSeconds: [],
        chatMessages: [],
        chatUniqueUsers: [],
        views: [],
      },
    });
  });
});
