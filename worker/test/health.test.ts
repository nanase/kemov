import { env } from 'cloudflare:test';

import { health, isUnhealthy, statusFor } from '../src/api/health';
import { BACKED_UP_TABLES, backupKey } from '../src/lib/backup';
import { CHAT_REPLAY_ACTIVITY_STALE_MINUTES, JOB_SUCCESS_STALE_MINUTES } from '../src/lib/health-thresholds';
import { formatTimestamp } from '../src/lib/time';

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

/** An ISO instant `minutes` before `now`, in collect_task's updated_at shape. */
const isoMinutesAgo = (now: Date, minutes: number) => formatTimestamp(new Date(now.getTime() - minutes * 60_000));

async function clearBucket(): Promise<void> {
  const listed = await env.BACKUP.list();

  await Promise.all(listed.objects.map((object) => env.BACKUP.delete(object.key)));
}

beforeEach(async () => {
  await env.DB.prepare('DELETE FROM collect_task').run();
  await env.DB.prepare('DELETE FROM channel_snapshot').run();
  await env.DB.prepare('DELETE FROM video').run();
  await env.DB.prepare('DELETE FROM channel').run();
  await clearBucket();
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
      // Not stale: chat-replay is graded on queued > 0, not on
      // lastSuccessAt, and an empty queue is what caught up looks like.
      stale: false,
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

// The backup job writes none of its own collect_task rows, which is #115:
// this is what /api/health reads instead, since the job's own tests
// (backup.test.ts) already cover what daysPresent and latestDay do with the
// bucket.
describe('backup', () => {
  const NOW = new Date('2026-09-10T00:20:00Z');

  test('reports every backed-up table, even one with no files', async () => {
    const { backup } = await health(env, NOW);

    expect(backup).toEqual(
      BACKED_UP_TABLES.map((table) => ({ table: table.name, latestDate: null, daysAgo: null, stale: true })),
    );
  });

  // The offset #110's isBackupStale reads around: channel_snapshot's newest
  // file names yesterday even when the job is working, so its daysAgo reads
  // as 1 here beside the others' 0, and neither is stale.
  test('reads the newest file of each table, and how many days old it is', async () => {
    await env.BACKUP.put(backupKey('video', '2026-09-10'), '');
    await env.BACKUP.put(backupKey('channel', '2026-09-10'), '');
    await env.BACKUP.put(backupKey('channel_snapshot', '2026-09-09'), '');

    const { backup } = await health(env, NOW);

    expect(Object.fromEntries(backup.map((table) => [table.table, table]))).toEqual({
      video: { table: 'video', latestDate: '2026-09-10', daysAgo: 0, stale: false },
      channel: { table: 'channel', latestDate: '2026-09-10', daysAgo: 0, stale: false },
      // daysAgo 1 is channel_snapshot's own normal reading (see #110's
      // isBackupStale), not the 2 that would fire for the other two tables.
      channel_snapshot: { table: 'channel_snapshot', latestDate: '2026-09-09', daysAgo: 1, stale: false },
    });
  });

  test('takes the newest of several files rather than the first listed', async () => {
    await env.BACKUP.put(backupKey('video', '2026-09-08'), '');
    await env.BACKUP.put(backupKey('video', '2026-09-10'), '');
    await env.BACKUP.put(backupKey('video', '2026-09-09'), '');

    const { backup } = await health(env, NOW);

    expect(backup.find((table) => table.table === 'video')).toMatchObject({ latestDate: '2026-09-10', daysAgo: 0 });
  });

  test('keeps one table file out of another', async () => {
    await env.BACKUP.put(backupKey('video', '2026-09-10'), '');

    const { backup } = await health(env, NOW);

    expect(backup.find((table) => table.table === 'channel')).toMatchObject({ latestDate: null, daysAgo: null });
  });
});

// #110: which field each job is graded on, and where the boundary falls.
// isBackupStale's own boundary is covered in health-thresholds.test.ts; this
// only checks that health() wires the right daysAgo into it per table, which
// the 'backup' describe above already does via its `stale` expectations.
describe('stale jobs', () => {
  const NOW = new Date('2026-09-10T12:00:00Z');
  const minutesAgo = (minutes: number) => isoMinutesAgo(NOW, minutes);

  test('a 34-minute-old success does not fire the ten-minute jobs', async () => {
    await insertTask('channel_stats', 'UCaaa', 'done', minutesAgo(JOB_SUCCESS_STALE_MINUTES - 1));

    expect((await health(env, NOW)).jobs.find((job) => job.job === 'channel-stats')).toMatchObject({
      stale: false,
    });
  });

  test('a 36-minute-old success fires the ten-minute jobs', async () => {
    await insertTask('video_update', 'v1', 'done', minutesAgo(JOB_SUCCESS_STALE_MINUTES + 1));

    expect((await health(env, NOW)).jobs.find((job) => job.job === 'video-update')).toMatchObject({ stale: true });
  });

  // isTimestampStale grades on >=, so the threshold itself is the stale side,
  // not the boundary's last healthy tick. health-thresholds.test.ts covers
  // this for the helper directly; this is the same boundary wired through a
  // real job.
  test('a success exactly at the threshold fires the ten-minute jobs', async () => {
    await insertTask('channel_stats', 'UCaaa', 'done', minutesAgo(JOB_SUCCESS_STALE_MINUTES));

    expect((await health(env, NOW)).jobs.find((job) => job.job === 'channel-stats')).toMatchObject({ stale: true });
  });

  // chat-replay's queue emptying is what working looks like once it has
  // caught up (see the comment on health() itself), so a stale lastSuccessAt
  // with nothing queued must not fire the same as it would for the other
  // three jobs.
  test('chat-replay with nothing queued is not stale no matter how old its last success is', async () => {
    await insertTask('chat_replay', 'v1', 'done', minutesAgo(10_000));

    expect((await health(env, NOW)).jobs.find((job) => job.job === 'chat-replay')).toMatchObject({
      queued: 0,
      stale: false,
    });
  });

  test('chat-replay with work queued is not stale inside its own activity threshold', async () => {
    await insertTask('chat_replay', 'v1', 'pending', minutesAgo(CHAT_REPLAY_ACTIVITY_STALE_MINUTES - 1));

    expect((await health(env, NOW)).jobs.find((job) => job.job === 'chat-replay')).toMatchObject({
      queued: 1,
      stale: false,
    });
  });

  // The state #89 was: work waiting and nobody working it.
  test('chat-replay with work queued is stale past its own activity threshold', async () => {
    await insertTask('chat_replay', 'v1', 'pending', minutesAgo(CHAT_REPLAY_ACTIVITY_STALE_MINUTES + 1));

    expect((await health(env, NOW)).jobs.find((job) => job.job === 'chat-replay')).toMatchObject({
      queued: 1,
      stale: true,
    });
  });

  // The same >= boundary as the ten-minute jobs above, wired through
  // chat-replay's own threshold rather than JOB_SUCCESS_STALE_MINUTES.
  test('chat-replay with work queued is stale exactly at its own activity threshold', async () => {
    await insertTask('chat_replay', 'v1', 'pending', minutesAgo(CHAT_REPLAY_ACTIVITY_STALE_MINUTES));

    expect((await health(env, NOW)).jobs.find((job) => job.job === 'chat-replay')).toMatchObject({
      queued: 1,
      stale: true,
    });
  });
});

describe('isUnhealthy', () => {
  const NOW = new Date('2026-09-10T00:20:00Z');

  async function seedFullyHealthy(): Promise<void> {
    for (const kind of ['channel_stats', 'video_discover', 'video_update']) {
      await insertTask(kind, 'UCaaa', 'done', isoMinutesAgo(NOW, 1));
    }

    await env.BACKUP.put(backupKey('video', '2026-09-10'), '');
    await env.BACKUP.put(backupKey('channel', '2026-09-10'), '');
    await env.BACKUP.put(backupKey('channel_snapshot', '2026-09-09'), '');
  }

  test('is false when every job and every table is within its threshold', async () => {
    await seedFullyHealthy();

    expect(isUnhealthy(await health(env, NOW))).toBe(false);
  });

  // One job stopped is enough, even with everything else - including the
  // other jobs and the whole backup - fine.
  test('is true when a single job is stale and everything else is not', async () => {
    await seedFullyHealthy();
    await env.DB.prepare(`UPDATE collect_task SET updated_at = ?1 WHERE kind = 'video_update'`)
      .bind(isoMinutesAgo(NOW, JOB_SUCCESS_STALE_MINUTES + 1))
      .run();

    expect(isUnhealthy(await health(env, NOW))).toBe(true);
  });

  // The same, from the backup side rather than the jobs side: #115's data can
  // fail this endpoint on its own, independent of collect_task.
  test('is true when a single backed-up table is stale and every job is not', async () => {
    await seedFullyHealthy();
    await env.BACKUP.delete(backupKey('channel_snapshot', '2026-09-09'));

    expect(isUnhealthy(await health(env, NOW))).toBe(true);
  });

  // The edge cache can outlive a deploy: for up to CACHE_SECONDS after this
  // shape shipped, a fresh cache hit can still be a body the previous version
  // of health() wrote, with no `stale` field on its jobs or tables at all.
  // Read that as unhealthy rather than as `undefined === true` reading
  // healthy, so an inherited cache entry cannot mask a real problem.
  test('is true when a job carries no stale field at all', () => {
    expect(isUnhealthy({ jobs: [{}] as never, backup: [{ stale: false }] as never })).toBe(true);
  });

  test('is true when a backed-up table carries no stale field at all', () => {
    expect(isUnhealthy({ jobs: [{ stale: false }] as never, backup: [{}] as never })).toBe(true);
  });
});

// statusFor is cachedJson's statusOf, called on health's answer after it has
// been round-tripped through the Cache API's storage as JSON (see cache.ts) -
// this checks the cast in statusFor survives that round trip, not just a
// direct call on health's own return value, which isUnhealthy's tests above
// already cover.
describe('statusFor', () => {
  test('is 200 for a healthy body that has been through JSON', () => {
    const body = JSON.parse(JSON.stringify({ jobs: [{ stale: false }], backup: [{ stale: false }] }));

    expect(statusFor(body)).toEqual(200);
  });

  test('is 503 for an unhealthy body that has been through JSON', () => {
    const body = JSON.parse(JSON.stringify({ jobs: [{ stale: true }], backup: [{ stale: false }] }));

    expect(statusFor(body)).toEqual(503);
  });

  // The cache-outlives-a-deploy case, at the level cachedJson actually reads
  // it: a body from before this PR, JSON round-tripped like any cache hit,
  // whose jobs and tables have no `stale` key for statusFor's cast to find.
  test('is 503 for a body shaped like health answered before #110, with no stale field', () => {
    const body = JSON.parse(
      JSON.stringify({
        jobs: [{ job: 'channel-stats', lastSuccessAt: '2026-09-10T12:00:00Z', queued: 0 }],
        backup: [{ table: 'video', latestDate: '2026-09-10', daysAgo: 0 }],
        databaseReadAt: '2026-09-10T12:00:00Z',
      }),
    );

    expect(statusFor(body)).toEqual(503);
  });
});
