import { env } from 'cloudflare:test';

import { listChannels, getChannel, getHistory, parseInstant, readHistoryRange } from '../src/api/channels';

/**
 * What the channel endpoints compute, against the real D1 rather than a
 * stand-in for one. The routing that reaches them is worker/test/api.test.ts.
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

beforeEach(async () => {
  await env.DB.prepare('DELETE FROM collect_task').run();
  await env.DB.prepare('DELETE FROM channel_snapshot').run();
  await env.DB.prepare('DELETE FROM video').run();
  await env.DB.prepare('DELETE FROM channel').run();
});

/** A channel with everything the deploy and the collector fill in. */
async function insertFullChannel(channelId: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO channel (channel_id, name, fullname, globalname, twitter,
                          color_key, color_sub, color_light, color_back,
                          activity_start_date, activity_end_date,
                          custom_url, thumbnail_url, fetched_at)
     VALUES (?1, 'カラカル', 'カラカル / Caracal', 'Caracal', 'Caracal_KEMOV',
             '#F38E0A', '#F8C112', '#FFEBA4', '#FFEBA4',
             '2021-04-26', '2022-05-21',
             '@caracal', 'https://yt3.example/photo.jpg', '2026-09-07T12:00:00Z')`,
  )
    .bind(channelId)
    .run();
}

describe('listChannels', () => {
  test('answers with every channel even before any statistics exist', async () => {
    await insertChannel('UCaaa');
    await insertChannel('UCbbb');

    const { channels } = await listChannels(env);

    expect(channels.map((channel) => channel.channelId)).toEqual(['UCaaa', 'UCbbb']);
    expect(channels[0]?.fetchedAt).toBeNull();
    expect(channels[0]?.perDay.subscriberCount).toEqual({ value: null, reason: 'nothing collected' });
  });

  // Every page that shows one of these numbers shows the streamer's name,
  // colour and avatar beside it. custom_url and thumbnail_url exist nowhere
  // else - channels.yml does not master them - so a front end without them
  // has no link to the channel and no picture to draw.
  test('answers with the streamer beside the numbers', async () => {
    await insertFullChannel('UCaaa');

    const { channels } = await listChannels(env);

    expect(channels[0]).toMatchObject({
      channelId: 'UCaaa',
      name: 'カラカル',
      fullname: 'カラカル / Caracal',
      globalname: 'Caracal',
      twitter: 'Caracal_KEMOV',
      color: { key: '#F38E0A', sub: '#F8C112', light: '#FFEBA4', back: '#FFEBA4' },
      activityStartDate: '2021-04-26',
      activityEndDate: '2022-05-21',
      customUrl: '@caracal',
      thumbnailUrl: 'https://yt3.example/photo.jpg',
    });
  });

  // Null rather than a broken image or a link to nowhere. A channel the
  // collector has never read has no avatar, and saying so lets the front end
  // draw something else.
  test('says a channel has no avatar rather than inventing one', async () => {
    await insertChannel('UCaaa');

    const { channels } = await listChannels(env);

    expect(channels[0]).toMatchObject({ customUrl: null, thumbnailUrl: null, globalname: null });
  });

  test('answers one channel with the same fields as the list', async () => {
    await insertFullChannel('UCaaa');

    expect(await getChannel(env, 'UCaaa')).toMatchObject({
      name: 'カラカル',
      customUrl: '@caracal',
      thumbnailUrl: 'https://yt3.example/photo.jpg',
    });
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

// No D1: this reads a query string and nothing else.
describe('readHistoryRange', () => {
  const now = new Date('2026-09-07T12:00:00Z');
  const range = (query: string) => readHistoryRange(new URLSearchParams(query), now);

  test('reaches back a week by the hour when asked for nothing', () => {
    expect(range('')).toEqual({
      from: '2026-08-31T12:00:00Z',
      to: '2026-09-07T12:00:00Z',
      bucketSeconds: 3600,
    });
  });

  test('takes the instants it is given', () => {
    expect(range('from=2026-09-01T00:00:00Z&to=2026-09-02T00:00:00Z')).toMatchObject({
      from: '2026-09-01T00:00:00Z',
      to: '2026-09-02T00:00:00Z',
    });
  });

  test('takes each bucket it offers', () => {
    expect(range('bucket=10m')).toMatchObject({ bucketSeconds: 600 });
    expect(range('bucket=day')).toMatchObject({ bucketSeconds: 86400 });
  });

  test('refuses a bucket it does not offer', () => {
    expect(range('bucket=fortnight')).toEqual({ error: expect.stringContaining('bucket must be one of') });
  });

  test('refuses a range that runs backwards', () => {
    expect(range('from=2026-09-07T00:00:00Z&to=2026-09-01T00:00:00Z')).toEqual({ error: 'from is after to' });
  });

  test('refuses a range longer than it will serve', () => {
    expect(range('from=2020-01-01T00:00:00Z&to=2026-09-07T00:00:00Z')).toEqual({
      error: expect.stringContaining('days apart'),
    });
  });

  // Absent and unreadable are different questions. Not asking gets the
  // default; asking for something unreadable gets refused, because standing
  // the default in there would answer a week's question as though it were the
  // one that was sent.
  test('refuses an instant it cannot read rather than defaulting it', () => {
    expect(range('from=yesterday')).toEqual({ error: 'from is not an instant' });
    expect(range('to=soon')).toEqual({ error: 'to is not an instant' });
  });

  test('takes a bare date as the day it names', () => {
    expect(range('from=2026-09-01&to=2026-09-02')).toMatchObject({
      from: '2026-09-01T00:00:00Z',
      to: '2026-09-02T00:00:00Z',
    });
  });

  test('refuses a date that is not on the calendar', () => {
    expect(range('from=2026-02-30')).toEqual({ error: 'from is not an instant' });
  });
});

// No D1 either: this reads one string.
describe('parseInstant', () => {
  test('takes an instant in the shape the schema stores', () => {
    expect(parseInstant('2026-09-07T12:00:00Z')).toEqual('2026-09-07T12:00:00Z');
  });

  test('takes a bare date as its midnight', () => {
    expect(parseInstant('2026-09-07')).toEqual('2026-09-07T00:00:00Z');
  });

  // new Date is not a validator. It refuses a thirteenth month but rolls a
  // thirtieth of February forward into March, so without the round trip these
  // would be answered - with 200, and with the wrong month's data.
  test('refuses a date the calendar does not have', () => {
    expect(parseInstant('2026-02-30')).toBeNull();
    expect(parseInstant('2026-04-31')).toBeNull();
    expect(parseInstant('2025-02-29')).toBeNull();
    expect(parseInstant('2026-13-01')).toBeNull();
  });

  test('refuses a time the clock does not have', () => {
    expect(parseInstant('2026-09-07T25:00:00Z')).toBeNull();
    expect(parseInstant('2026-09-07T12:60:00Z')).toBeNull();
  });

  // The schema's timestamp columns are this one shape and no other, so an
  // offset or a fraction is refused here rather than at the CHECK.
  test('refuses a shape the schema does not store', () => {
    expect(parseInstant('2026-9-7')).toBeNull();
    expect(parseInstant('2026-09-07T12:00:00+09:00')).toBeNull();
    expect(parseInstant('2026-09-07T12:00:00.000Z')).toBeNull();
    expect(parseInstant('1789180800000')).toBeNull();
    expect(parseInstant('')).toBeNull();
  });
});
