import { env } from 'cloudflare:test';

import { deleteVideoOverride, listVideoOverrides, saveVideoOverride } from '../src/admin/video-overrides';
import { clearEverything } from './reset-db';

beforeEach(clearEverything);

const NOW = new Date('2026-09-18T00:00:00Z');

async function insertVideo(videoId: string, title = 'a title'): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO channel (channel_id, name, fullname, color_key, color_sub, color_light, color_back, activity_start_date)
     VALUES ('UCaaa', 'UCaaa', 'UCaaa', '#000000', '#000000', '#000000', '#000000', '2021-01-01')
     ON CONFLICT (channel_id) DO NOTHING`,
  ).run();

  await env.DB.prepare(
    `INSERT INTO video (video_id, channel_id, title, published_at, availability, live_broadcast_content,
                        type, duration_seconds, view_count, comment_count, fetched_at)
     VALUES (?1, 'UCaaa', ?2, '2026-09-01T00:00:00Z', 'public', 'none', 'video', 60, 0, 0, '2026-09-01T00:00:00Z')`,
  )
    .bind(videoId, title)
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

describe('listVideoOverrides', () => {
  test('joins in the video title, alongside every override column', async () => {
    await insertVideo('vid1', 'the collected title');
    await saveVideoOverride(env, 'vid1', { title: 'a corrected title' }, NOW);

    const response = await listVideoOverrides(env);
    const body = (await response.json()) as { videoOverrides: unknown[] };

    expect(body.videoOverrides).toEqual([
      {
        videoId: 'vid1',
        title: 'a corrected title',
        type: null,
        availability: null,
        memo: null,
        updatedAt: '2026-09-18T00:00:00Z',
        videoTitle: 'the collected title',
      },
    ]);
  });
});

describe('saveVideoOverride', () => {
  test('answers 404 when the video itself does not exist', async () => {
    const response = await saveVideoOverride(env, 'nope', { title: 'x' }, NOW);

    expect(response.status).toEqual(404);
    expect(await revisionRows()).toEqual([]);
  });

  test('creates an override and logs one revision', async () => {
    await insertVideo('vid1');

    const response = await saveVideoOverride(env, 'vid1', { availability: 'membership' }, NOW);

    expect(response.status).toEqual(200);

    const body = (await response.json()) as { videoOverride: { availability: string }; revisionId: number };

    expect(body.videoOverride.availability).toEqual('membership');
    expect(typeof body.revisionId).toEqual('number');
    expect(await revisionRows()).toHaveLength(1);
  });

  test('logs the row minus updated_at, in table-column order', async () => {
    await insertVideo('vid1');

    await saveVideoOverride(env, 'vid1', { title: 'fixed', memo: 'why' }, NOW);

    const rows = await revisionRows();

    expect(rows[0].entity).toEqual('video_override');
    expect(rows[0].entity_key).toEqual('vid1');
    expect(rows[0].action).toEqual('save');
    expect(Object.keys(JSON.parse(rows[0].body!))).toEqual(['video_id', 'title', 'type', 'availability', 'memo']);
    expect(JSON.parse(rows[0].body!)).toEqual({
      video_id: 'vid1',
      title: 'fixed',
      type: null,
      availability: null,
      memo: 'why',
    });
  });

  test('updates an existing override and refreshes updated_at, rather than making a second row', async () => {
    await insertVideo('vid1');

    await saveVideoOverride(env, 'vid1', { title: 'first' }, new Date('2026-09-17T00:00:00Z'));
    const response = await saveVideoOverride(env, 'vid1', { title: 'second' }, new Date('2026-09-18T00:00:00Z'));

    expect(response.status).toEqual(200);

    const { results } = await env.DB.prepare('SELECT title, updated_at FROM video_override WHERE video_id = ?1')
      .bind('vid1')
      .all();

    expect(results).toEqual([{ title: 'second', updated_at: '2026-09-18T00:00:00Z' }]);
    expect(await revisionRows()).toHaveLength(2);
  });

  test('refuses a save that leaves title, type and availability all null', async () => {
    await insertVideo('vid1');

    const response = await saveVideoOverride(env, 'vid1', { memo: 'just a memo' }, NOW);

    expect(response.status).toEqual(400);
    expect(await revisionRows()).toEqual([]);

    const stored = await env.DB.prepare('SELECT 1 FROM video_override WHERE video_id = ?1').bind('vid1').first();

    expect(stored).toBeNull();
  });

  test('refuses a column this endpoint does not accept', async () => {
    await insertVideo('vid1');

    const response = await saveVideoOverride(env, 'vid1', { title: 'x', videoId: 'vid2' }, NOW);

    expect(response.status).toEqual(400);
    expect(await response.json()).toEqual({ error: 'videoId cannot be saved' });
    expect(await revisionRows()).toEqual([]);
  });

  test.each([
    ['title', ''],
    ['type', 'song'],
    ['availability', 'hidden'],
    ['memo', 42],
  ])('refuses an invalid %s without saving anything', async (key, value) => {
    await insertVideo('vid1');

    const response = await saveVideoOverride(env, 'vid1', { title: 'x', [key]: value }, NOW);

    expect(response.status).toEqual(400);
    expect(await revisionRows()).toEqual([]);
  });
});

describe('deleteVideoOverride', () => {
  test('answers 404 when there is no override to delete', async () => {
    await insertVideo('vid1');

    const response = await deleteVideoOverride(env, 'vid1');

    expect(response.status).toEqual(404);
    expect(await revisionRows()).toEqual([]);
  });

  test('deletes the row and logs a delete revision with a null body', async () => {
    await insertVideo('vid1');
    await saveVideoOverride(env, 'vid1', { title: 'x' }, NOW);

    const response = await deleteVideoOverride(env, 'vid1');

    expect(response.status).toEqual(200);

    const stored = await env.DB.prepare('SELECT 1 FROM video_override WHERE video_id = ?1').bind('vid1').first();

    expect(stored).toBeNull();

    const rows = await revisionRows();

    expect(rows).toHaveLength(2);
    expect(rows[1]).toEqual({ entity: 'video_override', entity_key: 'vid1', action: 'delete', body: null });
  });
});
