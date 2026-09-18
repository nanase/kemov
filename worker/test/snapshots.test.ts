import { env } from 'cloudflare:test';

import { listSnapshots } from '../src/admin/snapshots';
import { clearEverything } from './reset-db';

beforeEach(clearEverything);

async function insertChannel(channelId: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO channel (channel_id, name, fullname, color_key, color_sub, color_light, color_back, activity_start_date)
     VALUES (?1, ?1, ?1, '#000000', '#000000', '#000000', '#000000', '2021-01-01')
     ON CONFLICT (channel_id) DO NOTHING`,
  )
    .bind(channelId)
    .run();
}

async function insertTick(channelId: string, fetchedAt: string, subs = 100): Promise<void> {
  await insertChannel(channelId);
  await env.DB.prepare(
    'INSERT INTO channel_snapshot (channel_id, fetched_at, subscriber_count, view_count, video_count) VALUES (?1, ?2, ?3, 200, 3)',
  )
    .bind(channelId, fetchedAt, subs)
    .run();
}

async function insertExclusion(channelId: string, fetchedAt: string, reason: string): Promise<void> {
  await env.DB.prepare('INSERT INTO channel_snapshot_exclusion (channel_id, fetched_at, reason) VALUES (?1, ?2, ?3)')
    .bind(channelId, fetchedAt, reason)
    .run();
}

const NOW = new Date('2026-09-19T12:00:00Z');

describe('listSnapshots', () => {
  test('defaults from/to to today in Japan time when both are omitted', async () => {
    // NOW is 2026-09-19T12:00:00Z, which is 2026-09-19 21:00 in Japan time.
    await insertTick('UCaaa', '2026-09-19T00:00:00Z');
    // The previous Japan-time day (2026-09-18 in JST is 2026-09-17T15:00Z..2026-09-18T14:59:59Z).
    await insertTick('UCaaa', '2026-09-18T00:00:00Z');

    const response = await listSnapshots(env, null, null, null, NOW);
    const body = (await response.json()) as { ticks: { fetchedAt: string }[] };

    expect(body.ticks.map((t) => t.fetchedAt)).toEqual(['2026-09-19T00:00:00Z']);
  });

  test('marks an excluded tick, with its reason', async () => {
    await insertTick('UCaaa', '2026-09-14T02:00:00Z');
    await insertExclusion('UCaaa', '2026-09-14T02:00:00Z', 'YouTube が異常な値を返した');

    const response = await listSnapshots(env, 'UCaaa', '2026-09-14', '2026-09-14', NOW);
    const body = (await response.json()) as { ticks: { excluded: boolean; reason: string | null }[] };

    expect(body.ticks).toEqual(
      [{ excluded: true, reason: 'YouTube が異常な値を返した' }].map((t) => expect.objectContaining(t)),
    );
  });

  test('does not mark a tick with no exclusion', async () => {
    await insertTick('UCaaa', '2026-09-14T02:00:00Z');

    const response = await listSnapshots(env, 'UCaaa', '2026-09-14', '2026-09-14', NOW);
    const body = (await response.json()) as { ticks: { excluded: boolean; reason: string | null }[] };

    expect(body.ticks[0]).toMatchObject({ excluded: false, reason: null });
  });

  test('narrows by channelId', async () => {
    await insertTick('UCaaa', '2026-09-14T02:00:00Z');
    await insertTick('UCbbb', '2026-09-14T02:00:00Z');

    const response = await listSnapshots(env, 'UCaaa', '2026-09-14', '2026-09-14', NOW);
    const body = (await response.json()) as { ticks: { channelId: string }[] };

    expect(body.ticks.map((t) => t.channelId)).toEqual(['UCaaa']);
  });

  test('refuses an unknown channelId with 400', async () => {
    const response = await listSnapshots(env, 'UCnope', null, null, NOW);

    expect(response.status).toEqual(400);
    expect(await response.json()).toEqual({ error: 'unknown channelId: UCnope' });
  });

  test('refuses from after to', async () => {
    const response = await listSnapshots(env, null, '2026-09-15', '2026-09-14', NOW);

    expect(response.status).toEqual(400);
  });

  test('refuses a malformed date', async () => {
    expect((await listSnapshots(env, null, '2026/09/14', null, NOW)).status).toEqual(400);
    expect((await listSnapshots(env, null, '2026-09-14', '2026/09/15', NOW)).status).toEqual(400);
  });

  test('groups ticks into a per-day summary, counting excluded ticks separately', async () => {
    await insertTick('UCaaa', '2026-09-14T00:00:00Z');
    await insertTick('UCaaa', '2026-09-14T00:10:00Z');
    await insertTick('UCaaa', '2026-09-15T00:00:00Z');
    await insertExclusion('UCaaa', '2026-09-14T00:10:00Z', 'x');

    const response = await listSnapshots(env, 'UCaaa', '2026-09-14', '2026-09-15', NOW);
    const body = (await response.json()) as { days: { date: string; ticks: number; excluded: number }[] };

    expect(body.days).toEqual([
      { date: '2026-09-14', ticks: 2, excluded: 1 },
      { date: '2026-09-15', ticks: 1, excluded: 0 },
    ]);
  });

  // 11 channels * 144 ticks/day would be 1,584 rows for one day - comfortably
  // under the limit. This pushes just one channel over it directly rather
  // than seeding hundreds of rows to prove the same point.
  test('refuses a range whose tick count exceeds the row limit', async () => {
    await insertChannel('UCaaa');

    const statements = [];

    for (let i = 0; i < 2001; i++) {
      const minute = String(i % 60).padStart(2, '0');
      const hour = String(Math.floor(i / 60) % 24).padStart(2, '0');
      const day = String(1 + Math.floor(i / 1440)).padStart(2, '0');

      statements.push(
        env.DB.prepare(
          'INSERT INTO channel_snapshot (channel_id, fetched_at, subscriber_count, view_count, video_count) VALUES (?1, ?2, 0, 0, 0)',
        ).bind('UCaaa', `2026-09-${day}T${hour}:${minute}:00Z`),
      );
    }

    for (let i = 0; i < statements.length; i += 50) {
      await env.DB.batch(statements.slice(i, i + 50));
    }

    const response = await listSnapshots(env, 'UCaaa', '2026-09-01', '2026-09-30', NOW);

    expect(response.status).toEqual(400);
  });
});
