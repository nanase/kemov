import { env } from 'cloudflare:test';

import { runVideoDiscover, runVideoUpdate } from '../src/collector/video';

interface VideoRow {
  video_id: string;
  channel_id: string;
  title: string;
  published_at: string;
  availability: string;
  live_broadcast_content: string;
  type: string | null;
  duration_seconds: number | null;
  view_count: number | null;
  scheduled_start_time: string | null;
  actual_start_time: string | null;
  actual_end_time: string | null;
  fetched_at: string;
}

interface CollectTaskRow {
  kind: string;
  target_id: string;
  state: string;
  attempts: number;
  next_attempt_at: string | null;
}

async function insertChannel(channelId: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO channel (channel_id, name, fullname, color_key, color_sub, color_light, color_back, activity_start_date)
     VALUES (?1, ?1, ?1, '#000000', '#000000', '#000000', '#000000', '2021-01-01')`,
  )
    .bind(channelId)
    .run();
}

/** A stored video, as the collector would have left it on an earlier tick. */
async function insertVideo(
  videoId: string,
  channelId: string,
  overrides: {
    availability?: string;
    liveBroadcastContent?: string;
    fetchedAt?: string;
    scheduledStartTime?: string | null;
  } = {},
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO video (video_id, channel_id, title, published_at, availability,
                        live_broadcast_content, scheduled_start_time, fetched_at)
     VALUES (?1, ?2, ?1, '2026-01-01T00:00:00Z', ?3, ?4, ?5, ?6)`,
  )
    .bind(
      videoId,
      channelId,
      overrides.availability ?? 'public',
      overrides.liveBroadcastContent ?? 'none',
      overrides.scheduledStartTime ?? null,
      overrides.fetchedAt ?? '2026-01-01T00:00:00Z',
    )
    .run();
}

function playlistItemsResponse(videoIds: readonly string[], nextPageToken?: string): Response {
  return jsonResponse({
    items: videoIds.map((videoId) => ({ contentDetails: { videoId } })),
    nextPageToken,
  });
}

interface VideoStub {
  id: string;
  channelId: string;
  /** Left out of the response entirely when null, rather than defaulted. */
  title?: string | null;
  publishedAt?: string;
  duration?: string;
  privacyStatus?: string;
  viewCount?: number;
  liveStreamingDetails?: {
    scheduledStartTime?: string;
    actualStartTime?: string;
    actualEndTime?: string;
  };
}

function videosListResponse(videos: readonly VideoStub[]): Response {
  return jsonResponse({
    items: videos.map((video) => ({
      id: video.id,
      snippet: {
        channelId: video.channelId,
        title: video.title === null ? undefined : (video.title ?? video.id),
        publishedAt: video.publishedAt ?? '2026-05-05T01:02:03Z',
      },
      contentDetails: video.duration === undefined ? {} : { duration: video.duration },
      status: { privacyStatus: video.privacyStatus ?? 'public' },
      statistics: video.viewCount === undefined ? {} : { viewCount: String(video.viewCount) },
      liveStreamingDetails: video.liveStreamingDetails,
    })),
  });
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}

/**
 * Routes one fetch stub to whichever endpoint the URL names.
 *
 * `shorts` answers the /shorts/<id> probe. It defaults to the redirect
 * YouTube sends for anything that is not a short, so a test that says nothing
 * about shorts gets the common case rather than a failed probe.
 */
function apiStub(handlers: {
  playlistItems?: (url: URL) => Response;
  videos?: (url: URL) => Response;
  shorts?: (videoId: string) => Response;
}): ReturnType<typeof vi.fn<typeof fetch>> {
  return vi.fn<typeof fetch>(async (input) => {
    const url = new URL(input as string | URL);

    if (url.pathname.endsWith('/playlistItems')) {
      if (!handlers.playlistItems) throw new Error('unexpected PlaylistItems.list call');
      return handlers.playlistItems(url);
    }

    if (url.pathname.endsWith('/videos')) {
      if (!handlers.videos) throw new Error('unexpected Videos.list call');
      return handlers.videos(url);
    }

    if (url.pathname.startsWith('/shorts/')) {
      const videoId = url.pathname.slice('/shorts/'.length);

      return handlers.shorts ? handlers.shorts(videoId) : redirectAwayFromShorts(videoId);
    }

    throw new Error(`unexpected call to ${url.pathname}`);
  });
}

/** What YouTube answers for a video that is not a short. */
function redirectAwayFromShorts(videoId: string): Response {
  return new Response(null, { status: 303, headers: { location: `https://www.youtube.com/watch?v=${videoId}` } });
}

/** What YouTube answers for one that is. */
function servedAsShort(): Response {
  return new Response('', { status: 200 });
}

function callsTo(fetchImpl: ReturnType<typeof vi.fn<typeof fetch>>, endpoint: string): URL[] {
  return fetchImpl.mock.calls
    .map(([input]) => new URL(input as string | URL))
    .filter((url) => url.pathname.endsWith(`/${endpoint}`));
}

async function allVideos(): Promise<VideoRow[]> {
  return (
    await env.DB.prepare(
      `SELECT video_id, channel_id, title, published_at, availability, live_broadcast_content, type,
              duration_seconds, view_count, scheduled_start_time, actual_start_time, actual_end_time, fetched_at
         FROM video ORDER BY video_id`,
    ).all<VideoRow>()
  ).results;
}

async function tasks(kind: string): Promise<CollectTaskRow[]> {
  return (
    await env.DB.prepare(
      `SELECT kind, target_id, state, attempts, next_attempt_at FROM collect_task
        WHERE kind = ?1 ORDER BY target_id`,
    )
      .bind(kind)
      .all<CollectTaskRow>()
  ).results;
}

/**
 * Only the targets that did not come out of the tick collected. A settled
 * 'done' row is written for every target that did, so asking for everything
 * would answer with the whole batch.
 */
async function missed(kind: string): Promise<CollectTaskRow[]> {
  return (await tasks(kind)).filter((row) => row.state !== 'done');
}

// The database is per test file, not per test, so each test clears its own way
// in - see worker/test/setup.ts.
beforeEach(async () => {
  await env.DB.prepare('DELETE FROM collect_task').run();
  await env.DB.prepare('DELETE FROM video').run();
  await env.DB.prepare('DELETE FROM channel').run();
});

describe('runVideoDiscover', () => {
  test('calls nobody when D1 has no channels', async () => {
    const fetchImpl = apiStub({});

    await runVideoDiscover(env, fetchImpl);

    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('reads each channel uploads playlist and stores what it finds', async () => {
    await insertChannel('UCaaa');

    const fetchImpl = apiStub({
      playlistItems: () => playlistItemsResponse(['vid1']),
      videos: () => videosListResponse([{ id: 'vid1', channelId: 'UCaaa', duration: 'PT10M' }]),
    });

    await runVideoDiscover(env, fetchImpl);

    // UC -> UU, which costs 1 unit against Search.list' 100.
    expect(callsTo(fetchImpl, 'playlistItems')[0].searchParams.get('playlistId')).toEqual('UUaaa');

    expect(await allVideos()).toMatchObject([
      { video_id: 'vid1', channel_id: 'UCaaa', availability: 'public', live_broadcast_content: 'none', type: 'video' },
    ]);
  });

  // maxResults defaults to 5 on PlaylistItems.list even when playlistId names
  // a playlist holding more, so without it the 6th video onwards is dropped
  // silently. A constant alone would not catch its removal; this asks for the
  // videos back.
  test('asks for more than the default five and keeps all of them', async () => {
    await insertChannel('UCaaa');

    const found = ['v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v7'];
    const fetchImpl = apiStub({
      playlistItems: () => playlistItemsResponse(found),
      videos: () => videosListResponse(found.map((id) => ({ id, channelId: 'UCaaa', duration: 'PT10M' }))),
    });

    await runVideoDiscover(env, fetchImpl);

    expect(callsTo(fetchImpl, 'playlistItems')[0].searchParams.get('maxResults')).toEqual('50');
    expect((await allVideos()).map((row) => row.video_id)).toEqual(found);
  });

  test('leaves videos it already has alone', async () => {
    await insertChannel('UCaaa');
    await insertVideo('known', 'UCaaa');

    const fetchImpl = apiStub({
      playlistItems: () => playlistItemsResponse(['known', 'fresh']),
      videos: () => videosListResponse([{ id: 'fresh', channelId: 'UCaaa', duration: 'PT2M' }]),
    });

    await runVideoDiscover(env, fetchImpl);

    expect(callsTo(fetchImpl, 'videos')[0].searchParams.get('id')).toEqual('fresh');
  });

  // Only the newest page is read; the archive is #67's. That holds while the
  // newest page overlaps what is stored, and this says so when it stops
  // holding rather than leaving the videos behind it unmentioned.
  test('warns when the newest page is all new and more pages follow', async () => {
    await insertChannel('UCaaa');

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchImpl = apiStub({
      playlistItems: () => playlistItemsResponse(['v1', 'v2'], 'TOKEN_FOR_PAGE_2'),
      videos: () =>
        videosListResponse([
          { id: 'v1', channelId: 'UCaaa', duration: 'PT4M' },
          { id: 'v2', channelId: 'UCaaa', duration: 'PT4M' },
        ]),
    });

    await runVideoDiscover(env, fetchImpl);

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('older videos are not being reached'));

    warn.mockRestore();
  });

  test('says nothing when the newest page overlaps what is already stored', async () => {
    await insertChannel('UCaaa');
    await insertVideo('known', 'UCaaa');

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchImpl = apiStub({
      playlistItems: () => playlistItemsResponse(['fresh', 'known'], 'TOKEN_FOR_PAGE_2'),
      videos: () => videosListResponse([{ id: 'fresh', channelId: 'UCaaa', duration: 'PT4M' }]),
    });

    await runVideoDiscover(env, fetchImpl);

    expect(warn).not.toHaveBeenCalled();

    warn.mockRestore();
  });

  test('one channel playlist failing does not stop the others', async () => {
    await insertChannel('UCaaa');
    await insertChannel('UCbbb');

    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchImpl = apiStub({
      playlistItems: (url) =>
        url.searchParams.get('playlistId') === 'UUaaa'
          ? new Response('nope', { status: 500 })
          : playlistItemsResponse(['fromB']),
      videos: () => videosListResponse([{ id: 'fromB', channelId: 'UCbbb', duration: 'PT3M' }]),
    });

    await runVideoDiscover(env, fetchImpl);

    expect((await allVideos()).map((row) => row.video_id)).toEqual(['fromB']);
    // The channel is the target: no video id was learned to blame.
    expect(await missed('video_discover')).toMatchObject([{ target_id: 'UCaaa', state: 'failed', attempts: 1 }]);

    error.mockRestore();
  });

  test('records a channel that has never failed, so a monitor can see it is current', async () => {
    await insertChannel('UCaaa');

    await runVideoDiscover(
      env,
      apiStub({
        playlistItems: () => playlistItemsResponse(['fromA']),
        videos: () => videosListResponse([{ id: 'fromA', channelId: 'UCaaa', duration: 'PT3M' }]),
      }),
    );

    // The INSERT half of the upsert, which the test below only reaches by way
    // of the ON CONFLICT half.
    expect((await tasks('video_discover')).find((row) => row.target_id === 'UCaaa')).toMatchObject({
      state: 'done',
      attempts: 0,
    });
  });

  test('settles a channel that failed once its playlist is read again', async () => {
    await insertChannel('UCaaa');

    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    await runVideoDiscover(env, apiStub({ playlistItems: () => new Response('nope', { status: 500 }) }));
    error.mockRestore();

    expect(await missed('video_discover')).toMatchObject([{ target_id: 'UCaaa', state: 'failed', attempts: 1 }]);

    await runVideoDiscover(
      env,
      apiStub({
        playlistItems: () => playlistItemsResponse(['fromA']),
        videos: () => videosListResponse([{ id: 'fromA', channelId: 'UCaaa', duration: 'PT3M' }]),
      }),
    );

    // The channel's own row, not the video's: both are 'video_discover', and
    // only the one the failure was recorded against is at stake here.
    expect(await missed('video_discover')).toEqual([]);
    expect((await tasks('video_discover')).find((row) => row.target_id === 'UCaaa')).toMatchObject({
      state: 'done',
      attempts: 0,
      next_attempt_at: null,
    });
  });
});

describe('runVideoUpdate', () => {
  test('refreshes a stored video from the API', async () => {
    await insertChannel('UCaaa');
    await insertVideo('vid1', 'UCaaa');

    const fetchImpl = apiStub({
      videos: () =>
        videosListResponse([{ id: 'vid1', channelId: 'UCaaa', title: 'renamed', duration: 'PT30S', viewCount: 4200 }]),
      shorts: () => servedAsShort(),
    });

    await runVideoUpdate(env, fetchImpl);

    expect(await allVideos()).toMatchObject([
      { video_id: 'vid1', title: 'renamed', type: 'shorts', duration_seconds: 30, view_count: 4200 },
    ]);
  });

  // A thirty-second upload is the one case where the kind cannot be read off
  // the API response, so this is where the probe's answer lands. Redirected
  // away from /shorts/, it is a video - and the rule this replaces would have
  // said shorts from the length alone.
  test('takes a redirect away from /shorts/ as the video not being one', async () => {
    await insertChannel('UCaaa');
    await insertVideo('vid1', 'UCaaa');

    const fetchImpl = apiStub({
      videos: () => videosListResponse([{ id: 'vid1', channelId: 'UCaaa', title: 'clip', duration: 'PT30S' }]),
    });

    await runVideoUpdate(env, fetchImpl);

    expect(await allVideos()).toMatchObject([{ video_id: 'vid1', type: 'video', duration_seconds: 30 }]);
  });

  // The refusal case, which is the whole reason the probe answers three ways
  // rather than two. The kind is left unset, and the next sweep asks again.
  // Writing 'video' here would be #58's -1 in a different column.
  test('leaves the kind unset when the probe is refused', async () => {
    await insertChannel('UCaaa');
    await insertVideo('vid1', 'UCaaa');

    const fetchImpl = apiStub({
      videos: () => videosListResponse([{ id: 'vid1', channelId: 'UCaaa', title: 'clip', duration: 'PT30S' }]),
      shorts: () => new Response('denied', { status: 403 }),
    });

    await runVideoUpdate(env, fetchImpl);

    expect(await allVideos()).toMatchObject([{ video_id: 'vid1', type: null, duration_seconds: 30 }]);
  });

  // Not a detail of the request but the method itself. Without
  // redirect: 'manual' the probe follows the redirect to the video's own
  // watch page and reads that page's 200 as "this is a short", so every video
  // becomes one. Nothing else here would notice: the call succeeds either
  // way, and the stub answers whatever it is asked. Hence a test that names
  // the option, so that removing it fails something.
  test('asks without following the redirect, which is what the answer is', async () => {
    await insertChannel('UCaaa');
    await insertVideo('vid1', 'UCaaa');

    const fetchImpl = apiStub({
      videos: () => videosListResponse([{ id: 'vid1', channelId: 'UCaaa', title: 'clip', duration: 'PT30S' }]),
    });

    await runVideoUpdate(env, fetchImpl);

    const probe = fetchImpl.mock.calls.find(([input]) => String(input).includes('/shorts/'));

    expect(probe?.[1]?.redirect).toEqual('manual');
  });

  // The probe costs a request, so it is only spent where the answer is not
  // already settled. A stream is never a short, whatever its length.
  test('does not ask about a stream', async () => {
    await insertChannel('UCaaa');
    await insertVideo('vid1', 'UCaaa');

    const fetchImpl = apiStub({
      videos: () =>
        videosListResponse([
          {
            id: 'vid1',
            channelId: 'UCaaa',
            title: 'a stream that ended at once',
            duration: 'PT4S',
            liveStreamingDetails: { actualEndTime: '2026-09-07T13:00:04Z' },
          },
        ]),
      shorts: () => {
        throw new Error('the probe should not have been spent on a stream');
      },
    });

    await runVideoUpdate(env, fetchImpl);

    expect(await allVideos()).toMatchObject([{ video_id: 'vid1', type: 'streaming' }]);
  });

  test('does not ask about anything longer than a short can be', async () => {
    await insertChannel('UCaaa');
    await insertVideo('vid1', 'UCaaa');

    const fetchImpl = apiStub({
      videos: () => videosListResponse([{ id: 'vid1', channelId: 'UCaaa', title: 'a talk', duration: 'PT10M12S' }]),
      shorts: () => {
        throw new Error('the probe should not have been spent on a ten-minute video');
      },
    });

    await runVideoUpdate(env, fetchImpl);

    expect(await allVideos()).toMatchObject([{ video_id: 'vid1', type: 'video' }]);
  });

  // Videos.list does not accept maxResults alongside id, so the batch size is
  // held by chunking the id list instead. More than one chunk's worth here.
  test('chunks the id list at fifty and sends no maxResults', async () => {
    await insertChannel('UCaaa');

    const ids = Array.from({ length: 50 }, (_, index) => `v${String(index).padStart(3, '0')}`);

    for (const id of ids) await insertVideo(id, 'UCaaa');

    const fetchImpl = apiStub({
      videos: (url) =>
        videosListResponse(
          (url.searchParams.get('id') ?? '').split(',').map((id) => ({ id, channelId: 'UCaaa', duration: 'PT5M' })),
        ),
    });

    await runVideoUpdate(env, fetchImpl);

    const calls = callsTo(fetchImpl, 'videos');

    expect(calls).toHaveLength(1);
    expect(calls[0].searchParams.get('maxResults')).toBeNull();
    expect((calls[0].searchParams.get('id') ?? '').split(',')).toHaveLength(50);
    expect(await missed('video_update')).toEqual([]);
  });

  // The whole of #63's worst finding: 15 of 16 deleted or private videos were
  // still live or upcoming because the old collector wrote nothing when it had
  // nothing. A video that cannot be fetched is not live.
  test('clears the live state of a video the API no longer returns', async () => {
    await insertChannel('UCaaa');
    await insertVideo('gone', 'UCaaa', {
      liveBroadcastContent: 'live',
      scheduledStartTime: '2026-05-01T10:00:00Z',
    });

    const fetchImpl = apiStub({ videos: () => videosListResponse([]) });

    await runVideoUpdate(env, fetchImpl);

    expect(await allVideos()).toMatchObject([
      { video_id: 'gone', availability: 'unavailable', live_broadcast_content: 'none' },
    ]);
    // 'unavailable' rather than 'failed': the API answered, and the answer was
    // that this video is not there. It carries no retry deadline.
    expect(await tasks('video_update')).toMatchObject([
      { target_id: 'gone', state: 'unavailable', next_attempt_at: null },
    ]);
  });

  test('a call that never answered marks nothing unavailable', async () => {
    await insertChannel('UCaaa');
    await insertVideo('vid1', 'UCaaa', { liveBroadcastContent: 'live' });

    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchImpl = apiStub({ videos: () => new Response('boom', { status: 503 }) });

    await runVideoUpdate(env, fetchImpl);

    // Still live, because nothing was learned. Guessing 'unavailable' from a
    // failed call would be the same mistake in the other direction.
    expect(await allVideos()).toMatchObject([{ video_id: 'vid1', live_broadcast_content: 'live' }]);
    expect(await tasks('video_update')).toMatchObject([{ target_id: 'vid1', state: 'failed' }]);
    expect((await tasks('video_update'))[0].next_attempt_at).not.toBeNull();

    error.mockRestore();
  });

  // The third way to miss, and the one easiest to leave out: the call
  // answered, the video was in it, and writing that one row failed. Here the
  // API names a channel that violates video.channel_id's foreign key.
  test('a video whose own write fails still leaves a trace', async () => {
    await insertChannel('UCaaa');
    await insertVideo('vid1', 'UCaaa');
    await insertVideo('vid2', 'UCaaa');

    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchImpl = apiStub({
      videos: () =>
        videosListResponse([
          { id: 'vid1', channelId: 'UCmissing', duration: 'PT4M' },
          { id: 'vid2', channelId: 'UCaaa', title: 'fine', duration: 'PT4M' },
        ]),
    });

    await runVideoUpdate(env, fetchImpl);

    expect(await missed('video_update')).toMatchObject([{ target_id: 'vid1', state: 'failed' }]);
    // The one that could be written still was. The chunk goes in as one batch,
    // which is one transaction, so vid1 took vid2 down with it and only the
    // retry that isolates them got vid2 in.
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('retrying one video at a time'), expect.any(Error));
    expect((await allVideos()).find((row) => row.video_id === 'vid2')).toMatchObject({ title: 'fine' });

    error.mockRestore();
    warn.mockRestore();
  });

  // A pair is built before anything is sent, and building one throws for an
  // item missing a NOT NULL column. Escaping, that would reject the whole
  // chunk before a single statement ran, so the other videos would go
  // unwritten with nothing saying why.
  test('a video returned without the columns a row needs does not take the chunk with it', async () => {
    await insertChannel('UCaaa');
    await insertVideo('vid1', 'UCaaa');
    await insertVideo('vid2', 'UCaaa');

    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchImpl = apiStub({
      videos: () =>
        videosListResponse([
          { id: 'vid1', channelId: 'UCaaa', title: null, duration: 'PT4M' },
          { id: 'vid2', channelId: 'UCaaa', title: 'fine', duration: 'PT4M' },
        ]),
    });

    await runVideoUpdate(env, fetchImpl);

    expect(await missed('video_update')).toMatchObject([{ target_id: 'vid1', state: 'failed' }]);
    expect((await allVideos()).find((row) => row.video_id === 'vid2')).toMatchObject({ title: 'fine' });

    error.mockRestore();
  });

  // #63 asks for a selection with no hole in it. The sweep has no WHERE
  // clause, so a video cannot fail to match it; it only has to wait its turn.
  test('takes the least recently fetched first', async () => {
    await insertChannel('UCaaa');
    await insertVideo('newest', 'UCaaa', { fetchedAt: '2026-09-01T00:00:00Z' });
    await insertVideo('stalest', 'UCaaa', { fetchedAt: '2023-11-30T00:00:00Z' });
    await insertVideo('middle', 'UCaaa', { fetchedAt: '2025-03-26T00:00:00Z' });

    const fetchImpl = apiStub({
      videos: (url) =>
        videosListResponse(
          (url.searchParams.get('id') ?? '').split(',').map((id) => ({ id, channelId: 'UCaaa', duration: 'PT5M' })),
        ),
    });

    await runVideoUpdate(env, fetchImpl);

    expect((callsTo(fetchImpl, 'videos')[0].searchParams.get('id') ?? '').split(',')).toEqual([
      'stalest',
      'middle',
      'newest',
    ]);
  });

  test('takes live and upcoming streams even when they were fetched most recently', async () => {
    await insertChannel('UCaaa');
    await insertVideo('live', 'UCaaa', { liveBroadcastContent: 'live', fetchedAt: '2026-09-06T21:30:00Z' });

    for (let index = 0; index < 60; index += 1) {
      await insertVideo(`old${String(index).padStart(3, '0')}`, 'UCaaa', { fetchedAt: '2023-01-01T00:00:00Z' });
    }

    const fetchImpl = apiStub({
      videos: (url) =>
        videosListResponse(
          (url.searchParams.get('id') ?? '').split(',').map((id) => ({ id, channelId: 'UCaaa', duration: 'PT5M' })),
        ),
    });

    await runVideoUpdate(env, fetchImpl);

    const requested = (callsTo(fetchImpl, 'videos')[0].searchParams.get('id') ?? '').split(',');

    expect(requested).toContain('live');
    // And the sweep still got the rest of the tick rather than being crowded
    // out, which is what keeps "every video eventually" a number.
    expect(requested).toHaveLength(50);
  });

  // The cap is what stops a channel that goes live on everything from filling
  // every tick with streams and starving the sweep forever.
  test('caps how much of a tick live streams may take', async () => {
    await insertChannel('UCaaa');

    for (let index = 0; index < 40; index += 1) {
      await insertVideo(`live${String(index).padStart(3, '0')}`, 'UCaaa', {
        liveBroadcastContent: 'live',
        fetchedAt: '2026-09-06T21:30:00Z',
      });
    }

    for (let index = 0; index < 40; index += 1) {
      await insertVideo(`old${String(index).padStart(3, '0')}`, 'UCaaa', { fetchedAt: '2023-01-01T00:00:00Z' });
    }

    const fetchImpl = apiStub({
      videos: (url) =>
        videosListResponse(
          (url.searchParams.get('id') ?? '').split(',').map((id) => ({ id, channelId: 'UCaaa', duration: 'PT5M' })),
        ),
    });

    await runVideoUpdate(env, fetchImpl);

    const requested = (callsTo(fetchImpl, 'videos')[0].searchParams.get('id') ?? '').split(',');

    expect(requested.filter((id) => id.startsWith('live'))).toHaveLength(20);
    expect(requested.filter((id) => id.startsWith('old'))).toHaveLength(30);
  });

  test('records a stream ending as soon as the API reports an end time', async () => {
    await insertChannel('UCaaa');
    await insertVideo('stream', 'UCaaa', { liveBroadcastContent: 'live' });

    const fetchImpl = apiStub({
      videos: () =>
        videosListResponse([
          {
            id: 'stream',
            channelId: 'UCaaa',
            duration: 'PT2H5M1S',
            liveStreamingDetails: {
              scheduledStartTime: '2026-09-06T22:00:00Z',
              actualStartTime: '2026-09-06T22:01:12Z',
              actualEndTime: '2026-09-07T00:06:13Z',
            },
          },
        ]),
    });

    await runVideoUpdate(env, fetchImpl);

    expect(await allVideos()).toMatchObject([
      {
        video_id: 'stream',
        live_broadcast_content: 'none',
        type: 'streaming',
        duration_seconds: 7501,
        actual_end_time: '2026-09-07T00:06:13Z',
      },
    ]);
  });

  test('stores no duration for a stream that has not finished', async () => {
    await insertChannel('UCaaa');
    await insertVideo('stream', 'UCaaa');

    const fetchImpl = apiStub({
      videos: () =>
        videosListResponse([
          {
            id: 'stream',
            channelId: 'UCaaa',
            // What the API reports while a stream is running.
            duration: 'P0D',
            liveStreamingDetails: {
              scheduledStartTime: '2026-09-06T22:00:00Z',
              actualStartTime: '2026-09-06T22:01:12Z',
            },
          },
        ]),
    });

    await runVideoUpdate(env, fetchImpl);

    expect(await allVideos()).toMatchObject([
      { video_id: 'stream', live_broadcast_content: 'live', type: 'streaming', duration_seconds: null },
    ]);
  });

  // The schema's CHECK refuses an offset and a fractional second, both of
  // which the API sends.
  test('converts the timestamps the API sends into the shape the schema takes', async () => {
    await insertChannel('UCaaa');
    await insertVideo('stream', 'UCaaa');

    const fetchImpl = apiStub({
      videos: () =>
        videosListResponse([
          {
            id: 'stream',
            channelId: 'UCaaa',
            publishedAt: '2026-09-06T14:13:29.123-07:00',
            duration: 'P0D',
            liveStreamingDetails: { scheduledStartTime: '2026-09-06T22:00:00+00:00' },
          },
        ]),
    });

    await runVideoUpdate(env, fetchImpl);

    expect(await allVideos()).toMatchObject([
      {
        video_id: 'stream',
        published_at: '2026-09-06T21:13:29Z',
        scheduled_start_time: '2026-09-06T22:00:00Z',
      },
    ]);
  });

  test('settles the task row once a video comes back', async () => {
    await insertChannel('UCaaa');
    await insertVideo('vid1', 'UCaaa');

    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    await runVideoUpdate(env, apiStub({ videos: () => new Response('boom', { status: 503 }) }));

    expect(await tasks('video_update')).toMatchObject([{ target_id: 'vid1', state: 'failed' }]);

    await runVideoUpdate(
      env,
      apiStub({ videos: () => videosListResponse([{ id: 'vid1', channelId: 'UCaaa', duration: 'PT9M' }]) }),
    );

    // Otherwise 'unavailable' and 'failed' would mean "was, once" rather than
    // "is".
    expect(await tasks('video_update')).toMatchObject([
      { target_id: 'vid1', state: 'done', attempts: 0, next_attempt_at: null },
    ]);

    error.mockRestore();
  });

  test('warns instead of calling the API when D1 has no videos', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchImpl = apiStub({});

    await runVideoUpdate(env, fetchImpl);

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith('video-update: no videos in D1 to refresh');

    warn.mockRestore();
  });
});
