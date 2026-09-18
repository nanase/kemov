import { env } from 'cloudflare:test';

import {
  deleteSnapshotExclusion,
  listSnapshotExclusions,
  saveSnapshotExclusion,
} from '../src/admin/snapshot-exclusions';
import { clearEverything } from './reset-db';

beforeEach(clearEverything);

async function insertTick(channelId: string, fetchedAt: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO channel (channel_id, name, fullname, color_key, color_sub, color_light, color_back, activity_start_date)
     VALUES (?1, ?1, ?1, '#000000', '#000000', '#000000', '#000000', '2021-01-01')
     ON CONFLICT (channel_id) DO NOTHING`,
  )
    .bind(channelId)
    .run();

  await env.DB.prepare(
    `INSERT INTO channel_snapshot (channel_id, fetched_at, subscriber_count, view_count, video_count)
     VALUES (?1, ?2, 100, 200, 3)`,
  )
    .bind(channelId, fetchedAt)
    .run();
}

async function revisionRows(): Promise<{ entity: string; entity_key: string; action: string; body: string | null }[]> {
  const { results } = await env.DB.prepare(
    'SELECT entity, entity_key, action, body FROM revision ORDER BY revision_id',
  ).all<{
    entity: string;
    entity_key: string;
    action: string;
    body: string | null;
  }>();

  return results;
}

const TICK = '2026-09-08T00:00:00Z';

describe('listSnapshotExclusions', () => {
  test('orders by fetched_at, newest first', async () => {
    await insertTick('UCaaa', '2026-09-06T00:00:00Z');
    await insertTick('UCaaa', '2026-09-08T00:00:00Z');
    await insertTick('UCaaa', '2026-09-07T00:00:00Z');

    await saveSnapshotExclusion(env, 'UCaaa', '2026-09-06T00:00:00Z', { reason: 'a' });
    await saveSnapshotExclusion(env, 'UCaaa', '2026-09-08T00:00:00Z', { reason: 'b' });
    await saveSnapshotExclusion(env, 'UCaaa', '2026-09-07T00:00:00Z', { reason: 'c' });

    const response = await listSnapshotExclusions(env);
    const body = (await response.json()) as { snapshotExclusions: { fetchedAt: string }[] };

    expect(body.snapshotExclusions.map((row) => row.fetchedAt)).toEqual([
      '2026-09-08T00:00:00Z',
      '2026-09-07T00:00:00Z',
      '2026-09-06T00:00:00Z',
    ]);
  });
});

describe('saveSnapshotExclusion', () => {
  test('answers 404 when the tick itself does not exist', async () => {
    const response = await saveSnapshotExclusion(env, 'UCaaa', TICK, { reason: 'bot traffic' });

    expect(response.status).toEqual(404);
    expect(await revisionRows()).toEqual([]);
  });

  test('creates the exclusion and logs one revision', async () => {
    await insertTick('UCaaa', TICK);

    const response = await saveSnapshotExclusion(env, 'UCaaa', TICK, { reason: 'bot traffic' });

    expect(response.status).toEqual(200);

    const body = (await response.json()) as {
      snapshotExclusion: { channelId: string; fetchedAt: string; reason: string };
      revisionId: number;
    };

    expect(body.snapshotExclusion).toEqual({
      channelId: 'UCaaa',
      fetchedAt: TICK,
      reason: 'bot traffic',
      createdAt: expect.any(String),
    });
    expect(typeof body.revisionId).toEqual('number');
    expect(await revisionRows()).toHaveLength(1);
  });

  test('logs the row minus created_at, with entity_key as channel_id/fetched_at', async () => {
    await insertTick('UCaaa', TICK);

    await saveSnapshotExclusion(env, 'UCaaa', TICK, { reason: 'bot traffic' });

    const rows = await revisionRows();

    expect(rows[0].entity).toEqual('channel_snapshot_exclusion');
    expect(rows[0].entity_key).toEqual(`UCaaa/${TICK}`);
    expect(rows[0].action).toEqual('save');
    expect(Object.keys(JSON.parse(rows[0].body!))).toEqual(['channel_id', 'fetched_at', 'reason']);
    expect(JSON.parse(rows[0].body!)).toEqual({ channel_id: 'UCaaa', fetched_at: TICK, reason: 'bot traffic' });
  });

  test('updates the reason on a second save without moving created_at, and logs a second revision', async () => {
    await insertTick('UCaaa', TICK);

    const first = await saveSnapshotExclusion(env, 'UCaaa', TICK, { reason: 'first reason' });
    const firstBody = (await first.json()) as { snapshotExclusion: { createdAt: string } };

    const second = await saveSnapshotExclusion(env, 'UCaaa', TICK, { reason: 'second reason' });
    const secondBody = (await second.json()) as { snapshotExclusion: { reason: string; createdAt: string } };

    expect(secondBody.snapshotExclusion.reason).toEqual('second reason');
    expect(secondBody.snapshotExclusion.createdAt).toEqual(firstBody.snapshotExclusion.createdAt);
    expect(await revisionRows()).toHaveLength(2);
  });

  test('refuses an empty reason without saving anything', async () => {
    await insertTick('UCaaa', TICK);

    const response = await saveSnapshotExclusion(env, 'UCaaa', TICK, { reason: '' });

    expect(response.status).toEqual(400);
    expect(await revisionRows()).toEqual([]);

    const stored = await env.DB.prepare(
      'SELECT 1 FROM channel_snapshot_exclusion WHERE channel_id = ?1 AND fetched_at = ?2',
    )
      .bind('UCaaa', TICK)
      .first();

    expect(stored).toBeNull();
  });

  test('refuses a column this endpoint does not accept', async () => {
    await insertTick('UCaaa', TICK);

    const response = await saveSnapshotExclusion(env, 'UCaaa', TICK, {
      reason: 'x',
      createdAt: '2020-01-01T00:00:00Z',
    });

    expect(response.status).toEqual(400);
    expect(await response.json()).toEqual({ error: 'createdAt cannot be saved' });
    expect(await revisionRows()).toEqual([]);
  });
});

describe('deleteSnapshotExclusion', () => {
  test('answers 404 when there is no exclusion to delete', async () => {
    await insertTick('UCaaa', TICK);

    const response = await deleteSnapshotExclusion(env, 'UCaaa', TICK);

    expect(response.status).toEqual(404);
    expect(await revisionRows()).toEqual([]);
  });

  test('deletes the row and logs a delete revision with a null body', async () => {
    await insertTick('UCaaa', TICK);
    await saveSnapshotExclusion(env, 'UCaaa', TICK, { reason: 'x' });

    const response = await deleteSnapshotExclusion(env, 'UCaaa', TICK);

    expect(response.status).toEqual(200);

    const stored = await env.DB.prepare(
      'SELECT 1 FROM channel_snapshot_exclusion WHERE channel_id = ?1 AND fetched_at = ?2',
    )
      .bind('UCaaa', TICK)
      .first();

    expect(stored).toBeNull();

    const rows = await revisionRows();

    expect(rows).toHaveLength(2);
    expect(rows[1]).toEqual({
      entity: 'channel_snapshot_exclusion',
      entity_key: `UCaaa/${TICK}`,
      action: 'delete',
      body: null,
    });
  });
});
