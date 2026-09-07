import { env } from 'cloudflare:test';

import { listChannels, getChannel, getHistory } from '../src/api/channels';
import { health } from '../src/api/health';
import { listLive } from '../src/api/live';
import { listVideos, rankVideos } from '../src/api/videos';

/**
 * What each endpoint computes, against the real D1 rather than a stand-in for
 * one. The routing that reaches them is worker/test/api.test.ts.
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

describe('listChannels', () => {
  test('answers with every channel even before any statistics exist', async () => {
    await insertChannel('UCaaa');
    await insertChannel('UCbbb');

    const { channels } = await listChannels(env);

    expect(channels.map((channel) => channel.channelId)).toEqual(['UCaaa', 'UCbbb']);
    expect(channels[0]?.fetchedAt).toBeNull();
    expect(channels[0]?.perDay.subscriberCount).toEqual({ value: null, reason: 'nothing collected' });
  });

  test('reports the newest reading and the change over an hour', async () => {
    await insertChannel('UCaaa');
    await insertSnapshot('UCaaa', '2026-09-07T11:00:00Z', { subscribers: 1000 });
    await insertSnapshot('UCaaa', '2026-09-07T12:00:00Z', { subscribers: 1050 });

    const { channels } = await listChannels(env);

    expect(channels[0]?.latest.subscriberCount).toEqual(1050);
    expect(channels[0]?.perHour.subscriberCount.value).toEqual(50);
  });

  // The reason this drives from `channel` rather than from the newest tick.
  // A channel whose collection failed writes no row for that run, so keying
  // off the global newest would drop it from the list - the channel would
  // disappear from the site because its statistics could not be collected.
  // On the day this was written, channel-stats failed 24 times in a row in
  // production for want of an API key.
  test('keeps a channel that missed the newest run', async () => {
    await insertChannel('UCaaa');
    await insertChannel('UCbbb');
    await insertSnapshot('UCaaa', '2026-09-07T12:00:00Z', { subscribers: 1050 });
    // UCbbb's newest is an hour older: it was not collected in the last run.
    await insertSnapshot('UCbbb', '2026-09-07T11:00:00Z', { subscribers: 2000 });

    const { channels } = await listChannels(env);

    expect(channels).toHaveLength(2);
    expect(channels.find((channel) => channel.channelId === 'UCbbb')).toMatchObject({
      fetchedAt: '2026-09-07T11:00:00Z',
      latest: { subscriberCount: 2000 },
    });
  });

  test('refuses to call a two-hour change a day', async () => {
    await insertChannel('UCaaa');
    await insertSnapshot('UCaaa', '2026-09-07T10:00:00Z', { subscribers: 1000 });
    await insertSnapshot('UCaaa', '2026-09-07T12:00:00Z', { subscribers: 1050 });

    const { channels } = await listChannels(env);

    expect(channels[0]?.perDay.subscriberCount).toEqual({ value: null, reason: 'history too short' });
    expect(channels[0]?.perHour.subscriberCount).toEqual({ value: null, reason: 'gap too wide' });
  });

  test('reports a hidden subscriber count as absent rather than as zero', async () => {
    await insertChannel('UCaaa');
    await insertSnapshot('UCaaa', '2026-09-07T11:00:00Z', { subscribers: null });
    await insertSnapshot('UCaaa', '2026-09-07T12:00:00Z', { subscribers: null });

    const { channels } = await listChannels(env);

    expect(channels[0]?.latest.subscriberCount).toBeNull();
    expect(channels[0]?.perHour.subscriberCount).toEqual({ value: null, reason: 'count not collected' });
    // The counts it does have are still reported.
    expect(channels[0]?.perHour.viewCount.value).toEqual(0);
  });
});

describe('getChannel', () => {
  test('is null for a channel that is not there', async () => {
    expect(await getChannel(env, 'UCnope')).toBeNull();
  });

  test('answers with the same shape as one row of the list', async () => {
    await insertChannel('UCaaa');
    await insertSnapshot('UCaaa', '2026-09-07T12:00:00Z');

    const { channels } = await listChannels(env);

    expect(await getChannel(env, 'UCaaa')).toEqual(channels[0]);
  });
});

describe('getHistory', () => {
  test('thins the readings to one per bucket, keeping the newest', async () => {
    await insertChannel('UCaaa');

    for (const [minute, views] of [
      ['00', 100],
      ['10', 110],
      ['50', 150],
    ] as const) {
      await insertSnapshot('UCaaa', `2026-09-07T12:${minute}:00Z`, { views });
    }

    const history = await getHistory(env, 'UCaaa', '2026-09-07T00:00:00Z', '2026-09-07T23:00:00Z', 3600);

    // One hour, one sample, and the last reading of that hour rather than an
    // average - these are cumulative totals, and an average of two totals is
    // not a total anything ever had.
    expect(history.samples).toHaveLength(1);
    expect(history.samples[0]).toMatchObject({ fetchedAt: '2026-09-07T12:50:00Z', viewCount: 150 });
  });

  test('answers with nothing outside the range asked for', async () => {
    await insertChannel('UCaaa');
    await insertSnapshot('UCaaa', '2026-09-01T12:00:00Z');
    await insertSnapshot('UCaaa', '2026-09-07T12:00:00Z');

    const history = await getHistory(env, 'UCaaa', '2026-09-05T00:00:00Z', '2026-09-08T00:00:00Z', 3600);

    expect(history.samples).toHaveLength(1);
  });
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
