import { env } from 'cloudflare:test';

import { health } from '../src/api/health';

/**
 * GET /api/health, against the real D1.
 */

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

async function insertVideo(videoId: string, channelId: string, fetchedAt = '2026-09-07T00:00:00Z'): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO video (video_id, channel_id, title, published_at, availability, live_broadcast_content, fetched_at)
     VALUES (?1, ?2, ?1, '2026-01-01T00:00:00Z', 'public', 'none', ?3)`,
  )
    .bind(videoId, channelId, fetchedAt)
    .run();
}

async function insertTask(
  kind: string,
  targetId: string,
  state: string,
  updatedAt = '2026-09-07T12:00:00Z',
  attempts = 1,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO collect_task (kind, target_id, state, attempts, next_attempt_at, updated_at)
     VALUES (?1, ?2, ?3, ?5, NULL, ?4)`,
  )
    .bind(kind, targetId, state, updatedAt, attempts)
    .run();
}

const jobNamed = async (name: string) => (await health(env)).jobs.find((job) => job.job === name);

beforeEach(async () => {
  await env.DB.prepare('DELETE FROM collect_task').run();
  await env.DB.prepare('DELETE FROM channel_snapshot').run();
  await env.DB.prepare('DELETE FROM video').run();
  await env.DB.prepare('DELETE FROM channel').run();
});

describe('health', () => {
  test('reports on every job, even one that has done nothing', async () => {
    const { jobs } = await health(env);

    expect(jobs.map((job) => job.job)).toEqual(['channel-stats', 'video-discover', 'video-update', 'chat-replay']);
  });

  // Null is "never", which a monitor has to tell apart from "a while ago". A
  // job that has never run and a job that is failing look identical from the
  // failure side, and only the first means nobody has ever seen it work.
  test('says a job has never succeeded rather than guessing a time', async () => {
    expect(await jobNamed('chat-replay')).toMatchObject({ lastSuccessAt: null });
  });

  test('reads each job success from that job own done rows', async () => {
    await insertTask('channel_stats', 'UCaaa', 'done', '2026-09-07T12:00:00Z');
    await insertTask('video_discover', 'UCaaa', 'done', '2026-09-07T11:00:00Z');
    await insertTask('video_update', 'v1', 'done', '2026-09-07T10:00:00Z');
    await insertTask('chat_replay', 'v1', 'done', '2026-09-07T09:00:00Z');

    const { jobs } = await health(env);

    expect(Object.fromEntries(jobs.map((job) => [job.job, job.lastSuccessAt]))).toEqual({
      'channel-stats': '2026-09-07T12:00:00Z',
      'video-discover': '2026-09-07T11:00:00Z',
      'video-update': '2026-09-07T10:00:00Z',
      'chat-replay': '2026-09-07T09:00:00Z',
    });
  });

  // The tables the jobs write into cannot answer this, which took a second
  // look to see. Rows arriving is not the same news as a job running: a
  // migration writes videos nothing collected, and a row can sit there long
  // after the job that wrote it stopped.
  test('does not read success from the tables the jobs write into', async () => {
    await insertChannel('UCaaa');
    await insertSnapshot('UCaaa', '2026-09-07T12:00:00Z');
    await insertVideo('v1', 'UCaaa', '2026-09-07T12:00:00Z');

    const { jobs } = await health(env);

    expect(jobs.map((job) => job.lastSuccessAt)).toEqual([null, null, null, null]);
  });

  // The failure this separation is for. Both video jobs write video.fetched_at
  // and video-update runs every tick, so a shared reading would show
  // video-discover as current while it has been stopped for two days - a job
  // failing invisibly, which is the one thing this endpoint exists to catch.
  test('does not let one video job stand in for the other', async () => {
    await insertChannel('UCaaa');
    await insertVideo('v1', 'UCaaa', '2026-09-07T12:00:00Z');
    await insertTask('video_update', 'v1', 'done', '2026-09-07T12:00:00Z');
    await insertTask('video_discover', 'UCaaa', 'done', '2026-09-05T00:00:00Z');

    expect((await jobNamed('video-discover'))?.lastSuccessAt).toEqual('2026-09-05T00:00:00Z');
    expect((await jobNamed('video-update'))?.lastSuccessAt).toEqual('2026-09-07T12:00:00Z');
  });

  // chat-replay keeps a row per video as its resume position, so its queue is
  // the job working rather than the job stuck. Adding the two together would
  // give a number that rises when the job is busy and rises when it is broken.
  test('counts work waiting apart from work failing', async () => {
    await insertTask('chat_replay', 'v1', 'pending');
    await insertTask('chat_replay', 'v2', 'running');
    await insertTask('chat_replay', 'v3', 'failed');

    expect(await jobNamed('chat-replay')).toMatchObject({ queued: 2, failing: 1 });
  });

  // A count alone does not say whether the failures are still happening. A row
  // that failed 25 times and stopped being retried counts the same as one
  // failing now.
  test('says when something last failed, not only how many have', async () => {
    await insertTask('video_update', 'v1', 'failed', '2026-09-01T00:00:00Z');
    await insertTask('video_update', 'v2', 'failed', '2026-09-07T12:00:00Z');

    expect(await jobNamed('video-update')).toMatchObject({
      failing: 2,
      lastFailureAt: '2026-09-07T12:00:00Z',
    });
  });

  // Settled, and an answer rather than a fault. Reported so that a jump in it
  // can be seen, because that is how the thing deciding it would show a break.
  test('counts settled absences apart from failures', async () => {
    await insertTask('video_update', 'v1', 'unavailable');
    await insertTask('video_update', 'v2', 'failed');

    expect(await jobNamed('video-update')).toMatchObject({ unavailable: 1, failing: 1, queued: 0 });
  });

  test('does not count a settled success as work', async () => {
    await insertTask('video_update', 'v1', 'done');

    expect(await jobNamed('video-update')).toMatchObject({ queued: 0, failing: 0, unavailable: 0 });
  });

  test('keeps each job counts to itself', async () => {
    await insertTask('chat_replay', 'v1', 'failed');
    await insertTask('video_update', 'v2', 'failed');

    expect((await jobNamed('chat-replay'))?.failing).toEqual(1);
    expect((await jobNamed('video-update'))?.failing).toEqual(1);
    expect((await jobNamed('channel-stats'))?.failing).toEqual(0);
  });

  // video_discover is the one kind holding two sorts of target: a channel
  // whose playlist would not load, and a video that would not be written. A
  // channel id is 24 characters and a video id 11, but a video id can begin
  // 'UC' too, and one in production does - so nothing here separates them by
  // the id. They are counted together, which is what this endpoint means by
  // the job's failures.
  test('counts a channel target and a video target under the one kind', async () => {
    await insertTask('video_discover', 'UCEcMIuGR8WO2TwL9XIpjKtw', 'failed');
    await insertTask('video_discover', 'UCabcdefghi', 'failed');

    expect(await jobNamed('video-discover')).toMatchObject({ failing: 2 });
  });

  // Zero rows is not a clean bill of health: it is a job that has never
  // touched anything. What tells them apart is lastSuccessAt beside it.
  test('answers zero counts and no success for a job that has never run', async () => {
    expect(await jobNamed('chat-replay')).toEqual({
      job: 'chat-replay',
      lastSuccessAt: null,
      lastActivityAt: null,
      queued: 0,
      failing: 0,
      lastFailureAt: null,
      maxAttempts: 0,
      unavailable: 0,
    });
  });

  // The failure #89 was: the key was missing, every tick ran and every tick
  // failed. Read from lastSuccessAt alone that is indistinguishable from
  // nobody calling the job at all, and the two want different people woken.
  test('separates a job failing every tick from a job nothing is calling', async () => {
    await insertTask('channel_stats', 'UCaaa', 'done', '2026-09-07T09:00:00Z');
    await insertTask('channel_stats', 'UCbbb', 'failed', '2026-09-07T12:00:00Z');

    expect(await jobNamed('channel-stats')).toMatchObject({
      lastSuccessAt: '2026-09-07T09:00:00Z',
      lastActivityAt: '2026-09-07T12:00:00Z',
    });
  });

  // Any state counts as activity, not just the two a monitor asks about. A
  // chat-replay tick that carries a video over writes 'running' and nothing
  // else, and that tick is the job working.
  test('takes activity from whatever the job wrote last, in any state', async () => {
    await insertTask('chat_replay', 'v1', 'done', '2026-09-07T09:00:00Z');
    await insertTask('chat_replay', 'v2', 'running', '2026-09-07T12:00:00Z');

    expect(await jobNamed('chat-replay')).toMatchObject({ lastActivityAt: '2026-09-07T12:00:00Z' });
  });

  test('keeps one job activity out of another', async () => {
    await insertTask('video_update', 'v1', 'done', '2026-09-07T12:00:00Z');

    expect((await jobNamed('video-update'))?.lastActivityAt).toEqual('2026-09-07T12:00:00Z');
    expect((await jobNamed('video-discover'))?.lastActivityAt).toBeNull();
  });

  // How long, which the count and the timestamp between them do not say. Two
  // targets failing once is a blip; one failing twenty-five times running is
  // something nothing is going to fix on its own.
  test('says how many times in a row the worst target has failed', async () => {
    await insertTask('chat_replay', 'v1', 'failed', '2026-09-07T12:00:00Z', 2);
    await insertTask('chat_replay', 'v2', 'failed', '2026-09-07T12:00:00Z', 25);

    expect(await jobNamed('chat-replay')).toMatchObject({ failing: 2, maxAttempts: 25 });
  });

  // recordAbsent leaves attempts where it found them, so a settled row can
  // carry a large one for ever. Counting it would report trouble that is over.
  test('reads attempts only from what is still failing', async () => {
    await insertTask('video_update', 'v1', 'unavailable', '2026-09-07T12:00:00Z', 25);
    await insertTask('video_update', 'v2', 'failed', '2026-09-07T12:00:00Z', 3);

    expect(await jobNamed('video-update')).toMatchObject({ maxAttempts: 3 });
  });

  test('says nothing has failed in a row when nothing is failing', async () => {
    await insertTask('video_update', 'v1', 'done', '2026-09-07T12:00:00Z', 7);

    expect(await jobNamed('video-update')).toMatchObject({ failing: 0, maxAttempts: 0 });
  });

  test('says when it read the database', async () => {
    expect((await health(env)).databaseReadAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  });
});
