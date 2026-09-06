import { env } from 'cloudflare:test';

import { runChannelStats } from '../src/collector/channel-stats';
import { formatTimestamp } from '../src/lib/time';

interface ChannelRow {
  channel_id: string;
  name: string;
  custom_url: string | null;
  thumbnail_url: string | null;
  fetched_at: string | null;
}

interface ChannelSnapshotRow {
  channel_id: string;
  fetched_at: string;
  subscriber_count: number | null;
  view_count: number;
  video_count: number;
}

interface CollectTaskRow {
  kind: string;
  target_id: string;
  state: string;
  attempts: number;
  next_attempt_at: string | null;
}

// Every column channels.yml owns is required by the schema, so a test that
// only cares about the collector's three columns still has to supply them.
// The name is set to the id so a test can tell rows apart without a second
// lookup.
async function insertChannel(channelId: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO channel (channel_id, name, fullname, color_key, color_sub, color_light, color_back, activity_start_date)
     VALUES (?1, ?1, ?1, '#000000', '#000000', '#000000', '#000000', '2021-01-01')`,
  )
    .bind(channelId)
    .run();
}

function channelsListResponse(
  items: readonly {
    id: string;
    customUrl?: string;
    thumbnailUrl?: string;
    viewCount: number;
    subscriberCount: number;
    hiddenSubscriberCount?: boolean;
    videoCount: number;
  }[],
): Response {
  const body = {
    items: items.map((item) => ({
      id: item.id,
      snippet: {
        customUrl: item.customUrl,
        thumbnails: item.thumbnailUrl
          ? { default: { url: item.thumbnailUrl }, medium: { url: 'unused' }, high: { url: 'unused' } }
          : undefined,
      },
      statistics: {
        viewCount: String(item.viewCount),
        subscriberCount: String(item.subscriberCount),
        hiddenSubscriberCount: item.hiddenSubscriberCount ?? false,
        videoCount: String(item.videoCount),
      },
    })),
  };

  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}

async function allChannels(): Promise<ChannelRow[]> {
  return (await env.DB.prepare('SELECT channel_id, name, custom_url, thumbnail_url, fetched_at FROM channel ORDER BY channel_id').all<ChannelRow>())
    .results;
}

async function allSnapshots(): Promise<ChannelSnapshotRow[]> {
  return (
    await env.DB.prepare('SELECT channel_id, fetched_at, subscriber_count, view_count, video_count FROM channel_snapshot ORDER BY channel_id').all<ChannelSnapshotRow>()
  ).results;
}

async function allCollectTasks(): Promise<CollectTaskRow[]> {
  return (
    await env.DB.prepare("SELECT kind, target_id, state, attempts, next_attempt_at FROM collect_task WHERE kind = 'channel_stats' ORDER BY target_id").all<CollectTaskRow>()
  ).results;
}

describe('runChannelStats', () => {
  // Storage resets per test FILE, not per test: undocumented, and the
  // opposite of what #74's own setup.ts comment says. Reported to HQ; until
  // that is settled, each test clears its own way in rather than relying on
  // the previous test's rows being gone.
  beforeEach(async () => {
    await env.DB.prepare('DELETE FROM channel_snapshot').run();
    await env.DB.prepare("DELETE FROM collect_task WHERE kind = 'channel_stats'").run();
    await env.DB.prepare('DELETE FROM channel').run();
  });

  test('does nothing and calls the API for nobody when D1 has no channels', async () => {
    const fetchImpl = vi.fn();

    await runChannelStats(env, fetchImpl);

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(await allSnapshots()).toEqual([]);
  });

  test('writes one snapshot per channel, all sharing one fetched_at', async () => {
    await insertChannel('UCaaa');
    await insertChannel('UCbbb');

    const fetchImpl = vi.fn<typeof fetch>(async () =>
      channelsListResponse([
        { id: 'UCaaa', customUrl: '@aaa', thumbnailUrl: 'https://example.com/aaa.jpg', viewCount: 100, subscriberCount: 10, videoCount: 5 },
        { id: 'UCbbb', customUrl: '@bbb', thumbnailUrl: 'https://example.com/bbb.jpg', viewCount: 200, subscriberCount: 20, videoCount: 8 },
      ]),
    );

    await runChannelStats(env, fetchImpl);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    // callYouTubeApi always calls fetchImpl with a URL, never a Request or a
    // plain string; the wider type here is only typeof fetch's own.
    const requestedUrl = new URL(fetchImpl.mock.calls[0][0] as string | URL);
    expect(requestedUrl.searchParams.get('id')).toEqual('UCaaa,UCbbb');
    expect(requestedUrl.searchParams.get('part')).toEqual('snippet,statistics');

    const snapshots = await allSnapshots();
    expect(snapshots).toHaveLength(2);
    expect(snapshots[0].fetched_at).toEqual(snapshots[1].fetched_at);
    expect(snapshots).toEqual([
      { channel_id: 'UCaaa', fetched_at: snapshots[0].fetched_at, subscriber_count: 10, view_count: 100, video_count: 5 },
      { channel_id: 'UCbbb', fetched_at: snapshots[0].fetched_at, subscriber_count: 20, view_count: 200, video_count: 8 },
    ]);

    const channels = await allChannels();
    expect(channels).toEqual([
      { channel_id: 'UCaaa', name: 'UCaaa', custom_url: '@aaa', thumbnail_url: 'https://example.com/aaa.jpg', fetched_at: snapshots[0].fetched_at },
      { channel_id: 'UCbbb', name: 'UCbbb', custom_url: '@bbb', thumbnail_url: 'https://example.com/bbb.jpg', fetched_at: snapshots[0].fetched_at },
    ]);
  });

  test('keeps a channel untouched outside custom_url, thumbnail_url and fetched_at', async () => {
    await insertChannel('UCaaa');
    const before = (await allChannels())[0];

    await runChannelStats(
      env,
      vi.fn(async () => channelsListResponse([{ id: 'UCaaa', viewCount: 1, subscriberCount: 1, videoCount: 1 }])),
    );

    const after = (await allChannels())[0];
    expect(after.name).toEqual(before.name);
  });

  test('stores NULL rather than 0 when a channel hides its subscriber count', async () => {
    await insertChannel('UCaaa');

    await runChannelStats(
      env,
      vi.fn(async () =>
        channelsListResponse([{ id: 'UCaaa', viewCount: 1, subscriberCount: 0, hiddenSubscriberCount: true, videoCount: 1 }]),
      ),
    );

    expect((await allSnapshots())[0].subscriber_count).toBeNull();
  });

  test('records a missing channel in collect_task without losing the rest', async () => {
    await insertChannel('UCaaa');
    await insertChannel('UCbbb');
    const before = formatTimestamp(new Date());

    // Channels.list omits UCbbb, as it would for a deleted or private channel.
    await runChannelStats(
      env,
      vi.fn(async () => channelsListResponse([{ id: 'UCaaa', viewCount: 1, subscriberCount: 1, videoCount: 1 }])),
    );

    const snapshots = await allSnapshots();
    expect(snapshots.map((row) => row.channel_id)).toEqual(['UCaaa']);

    const tasks = await allCollectTasks();
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ kind: 'channel_stats', target_id: 'UCbbb', state: 'failed', attempts: 1 });
    expect(tasks[0].next_attempt_at).not.toBeNull();
    expect(tasks[0].next_attempt_at! > before).toBe(true);
  });

  test('records every channel in collect_task when the whole call fails', async () => {
    await insertChannel('UCaaa');
    await insertChannel('UCbbb');

    await runChannelStats(
      env,
      vi.fn(async () => new Response('quota exceeded', { status: 403 })),
    );

    expect(await allSnapshots()).toEqual([]);

    const tasks = await allCollectTasks();
    expect(tasks.map((row) => row.target_id)).toEqual(['UCaaa', 'UCbbb']);
    for (const task of tasks) {
      expect(task).toMatchObject({ state: 'failed', attempts: 1 });
    }
  });

  test('raises attempts on a channel that keeps missing across runs', async () => {
    await insertChannel('UCaaa');

    const missing = vi.fn(async () => channelsListResponse([]));

    await runChannelStats(env, missing);
    await runChannelStats(env, missing);

    const tasks = await allCollectTasks();
    expect(tasks).toEqual([expect.objectContaining({ target_id: 'UCaaa', attempts: 2 })]);
  });

  test('records a channel in collect_task when writing its snapshot fails', async () => {
    await insertChannel('UCaaa');

    // Fixed clock: two runs must land on the exact same fetchedAt for their
    // channel_snapshot INSERTs to collide, which real wall-clock time can
    // only promise if both happen to fall in the same second.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));

    try {
      const succeeds = vi.fn(async () =>
        channelsListResponse([{ id: 'UCaaa', viewCount: 1, subscriberCount: 1, videoCount: 1 }]),
      );

      await runChannelStats(env, succeeds);
      // Same fetchedAt, same channel: this run's channel_snapshot INSERT
      // collides with the row the first run just wrote - a real PRIMARY KEY
      // failure, not a mocked one.
      await runChannelStats(env, succeeds);
    } finally {
      vi.useRealTimers();
    }

    expect(await allSnapshots()).toHaveLength(1);

    const tasks = await allCollectTasks();
    expect(tasks).toEqual([expect.objectContaining({ target_id: 'UCaaa', state: 'failed', attempts: 1 })]);
  });

  test('asks Channels.list for up to 50 results, not the API default of 5', async () => {
    const channelIds = ['UCa', 'UCb', 'UCc', 'UCd', 'UCe', 'UCf'];
    await Promise.all(channelIds.map((id) => insertChannel(id)));

    const fetchImpl = vi.fn<typeof fetch>(async () =>
      channelsListResponse(channelIds.map((id) => ({ id, viewCount: 1, subscriberCount: 1, videoCount: 1 }))),
    );

    await runChannelStats(env, fetchImpl);

    const requestedUrl = new URL(fetchImpl.mock.calls[0][0] as string | URL);
    expect(requestedUrl.searchParams.get('maxResults')).toEqual('50');

    // Without maxResults set, Channels.list's own default of 5 would leave
    // the 6th channel out of the response and thus out of channel_snapshot.
    const snapshots = await allSnapshots();
    expect(snapshots.map((row) => row.channel_id).sort()).toEqual([...channelIds].sort());
    expect(await allCollectTasks()).toEqual([]);
  });
});
