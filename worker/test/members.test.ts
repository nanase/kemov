import { env } from 'cloudflare:test';

import { listMembers, updateMember } from '../src/admin/members';
import { runBackup } from '../src/collector/backup';
import { backupKey, dayOf } from '../src/lib/backup';
import { clearEverything } from './reset-db';

beforeEach(clearEverything);

async function insertChannel(channelId: string, displayOrder = 0): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO channel (channel_id, name, fullname, color_key, color_sub, color_light, color_back,
                          activity_start_date, custom_url, thumbnail_url, fetched_at, display_order)
     VALUES (?1, ?1, ?1, '#000000', '#111111', '#222222', '#333333', '2021-01-01',
             '@handle', 'https://example.invalid/a.jpg', '2026-09-08T00:00:00Z', ?2)`,
  )
    .bind(channelId, displayOrder)
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

async function orderOf(): Promise<[string, number][]> {
  const { results } = await env.DB.prepare('SELECT channel_id, display_order FROM channel ORDER BY channel_id').all<{
    channel_id: string;
    display_order: number;
  }>();

  return results.map((row) => [row.channel_id, row.display_order]);
}

/** Every field updateMember requires, so a test overriding one does not also have to supply the rest. */
function validBody(overrides: Record<string, unknown> = {}) {
  return {
    name: 'つばき',
    fullname: 'つばき（フル）',
    globalname: 'Tsubaki',
    twitter: 'tsubaki_kemov',
    twitch: 'tsubaki__kemov',
    colorKey: '#123456',
    colorSub: '#234567',
    colorLight: '#345678',
    colorBack: '#456789',
    activityStartDate: '2021-04-01',
    activityEndDate: null,
    ...overrides,
  };
}

describe('listMembers', () => {
  test('orders members by display_order, then channel_id', async () => {
    await insertChannel('UCbbb', 1);
    await insertChannel('UCaaa', 1);
    await insertChannel('UCzzz', 0);

    const response = await listMembers(env);
    const body = (await response.json()) as { members: { channelId: string }[] };

    expect(body.members.map((member) => member.channelId)).toEqual(['UCzzz', 'UCaaa', 'UCbbb']);
  });

  test('reads every column, grouped and named for the admin site rather than the DB', async () => {
    await insertChannel('UCaaa');

    const response = await listMembers(env);
    const body = (await response.json()) as { members: unknown[] };

    expect(body.members).toEqual([
      {
        channelId: 'UCaaa',
        name: 'UCaaa',
        fullname: 'UCaaa',
        globalname: null,
        twitter: null,
        twitch: null,
        colorKey: '#000000',
        colorSub: '#111111',
        colorLight: '#222222',
        colorBack: '#333333',
        activityStartDate: '2021-01-01',
        activityEndDate: null,
        customUrl: '@handle',
        thumbnailUrl: 'https://example.invalid/a.jpg',
        fetchedAt: '2026-09-08T00:00:00Z',
        displayOrder: 0,
      },
    ]);
  });
});

describe('updateMember', () => {
  test('answers 404 for a member that does not exist', async () => {
    const response = await updateMember(env, 'UCnope', validBody());

    expect(response.status).toEqual(404);
    expect(await revisionRows()).toEqual([]);
  });

  test('saves the row and returns it with the revision it logged', async () => {
    await insertChannel('UCaaa');

    const response = await updateMember(env, 'UCaaa', validBody());

    expect(response.status).toEqual(200);

    const body = (await response.json()) as { member: { name: string; twitch: string | null }; revisionId: number };

    expect(body.member.name).toEqual('つばき');
    expect(body.member.twitch).toEqual('tsubaki__kemov');
    expect(typeof body.revisionId).toEqual('number');

    const stored = await env.DB.prepare('SELECT name, twitch FROM channel WHERE channel_id = ?1')
      .bind('UCaaa')
      .first<{ name: string; twitch: string }>();

    expect(stored).toEqual({ name: 'つばき', twitch: 'tsubaki__kemov' });
  });

  test('never touches custom_url, thumbnail_url or fetched_at - the collector owns those', async () => {
    await insertChannel('UCaaa');

    await updateMember(env, 'UCaaa', validBody());

    const stored = await env.DB.prepare(
      'SELECT custom_url, thumbnail_url, fetched_at FROM channel WHERE channel_id = ?1',
    )
      .bind('UCaaa')
      .first();

    expect(stored).toEqual({
      custom_url: '@handle',
      thumbnail_url: 'https://example.invalid/a.jpg',
      fetched_at: '2026-09-08T00:00:00Z',
    });
  });

  test('logs one revision row, with the row minus fetched_at and the API columns in table-column order', async () => {
    await insertChannel('UCaaa', 5);

    await updateMember(env, 'UCaaa', validBody());

    const rows = await revisionRows();

    expect(rows).toHaveLength(1);
    expect(rows[0].entity).toEqual('channel');
    expect(rows[0].entity_key).toEqual('UCaaa');
    expect(rows[0].action).toEqual('save');
    // Key order matters here - Object.keys reflects insertion order for
    // string keys, and every key below is one - so this also confirms the
    // body was built in channel's own column order, fetched_at, custom_url
    // and thumbnail_url left out.
    expect(Object.keys(JSON.parse(rows[0].body!))).toEqual([
      'channel_id',
      'name',
      'fullname',
      'globalname',
      'twitter',
      'color_key',
      'color_sub',
      'color_light',
      'color_back',
      'activity_start_date',
      'activity_end_date',
      'display_order',
      'twitch',
    ]);
    expect(JSON.parse(rows[0].body!)).toEqual({
      channel_id: 'UCaaa',
      name: 'つばき',
      fullname: 'つばき（フル）',
      globalname: 'Tsubaki',
      twitter: 'tsubaki_kemov',
      color_key: '#123456',
      color_sub: '#234567',
      color_light: '#345678',
      color_back: '#456789',
      activity_start_date: '2021-04-01',
      activity_end_date: null,
      display_order: 5,
      twitch: 'tsubaki__kemov',
    });
  });

  // What #224 is for: the nightly backup copies revision as it stands, and
  // its files are kept far longer than the 30 days the YouTube API allows.
  // Checked through the file itself rather than the row alone, so that a
  // value reaching the backup some other way would be caught here too.
  test('keeps custom_url and thumbnail_url out of the revision backup', async () => {
    await insertChannel('UCaaa');

    await updateMember(env, 'UCaaa', validBody());

    const { created_at: createdAt } = (await env.DB.prepare('SELECT created_at FROM revision').first<{
      created_at: string;
    }>())!;

    await runBackup(env, new Date(Date.parse(createdAt) + 86_400_000));

    const sql = await (await env.BACKUP.get(backupKey('revision', dayOf(createdAt))))!.text();

    expect(sql).toContain("'channel', 'UCaaa', 'save'");
    expect(sql).not.toContain('@handle');
    expect(sql).not.toContain('example.invalid');
    expect(sql).not.toContain('custom_url');
    expect(sql).not.toContain('thumbnail_url');
  });

  test('saving twice logs two revisions', async () => {
    await insertChannel('UCaaa');

    await updateMember(env, 'UCaaa', validBody());
    await updateMember(env, 'UCaaa', validBody({ name: 'べつの名前' }));

    expect(await revisionRows()).toHaveLength(2);
  });

  test('treats a left-out key the same as null, and refuses it when the column may not be null', async () => {
    await insertChannel('UCaaa');

    const withoutName: Record<string, unknown> = validBody();

    delete withoutName.name;

    const response = await updateMember(env, 'UCaaa', withoutName);

    expect(response.status).toEqual(400);
    expect(await response.json()).toEqual({ error: 'name must be a non-empty string' });
    expect(await revisionRows()).toEqual([]);
  });

  test('refuses a body that leaves activityEndDate out: a member is active or ended by a decision, not by omission', async () => {
    await insertChannel('UCaaa');

    const withoutEnd: Record<string, unknown> = validBody();

    delete withoutEnd.activityEndDate;

    const response = await updateMember(env, 'UCaaa', withoutEnd);

    expect(response.status).toEqual(400);
    expect(((await response.json()) as { error: string }).error).toMatch(/^activityEndDate must be given/);
    expect(await revisionRows()).toEqual([]);
  });

  test('accepts a left-out nullable column as null', async () => {
    await insertChannel('UCaaa');

    const withoutTwitch: Record<string, unknown> = validBody();

    delete withoutTwitch.twitch;

    const response = await updateMember(env, 'UCaaa', withoutTwitch);

    expect(response.status).toEqual(200);

    const stored = await env.DB.prepare('SELECT twitch FROM channel WHERE channel_id = ?1').bind('UCaaa').first();

    expect(stored).toEqual({ twitch: null });
  });

  test('refuses a column this endpoint does not let a caller update', async () => {
    await insertChannel('UCaaa');

    const response = await updateMember(env, 'UCaaa', validBody({ channelId: 'UCbbb' }));

    expect(response.status).toEqual(400);
    expect(await response.json()).toEqual({ error: 'channelId cannot be saved' });
    expect(await revisionRows()).toEqual([]);
  });

  // The order belongs to the list (saveMembers), so a stale form's own copy of
  // it cannot overwrite an order saved since.
  test('refuses displayOrder, and leaves the row where it was', async () => {
    await insertChannel('UCaaa', 3);

    const response = await updateMember(env, 'UCaaa', validBody({ displayOrder: 0 }));

    expect(response.status).toEqual(400);
    expect(await response.json()).toEqual({ error: 'displayOrder cannot be saved' });
    expect(await orderOf()).toEqual([['UCaaa', 3]]);
  });

  test.each([
    ['colorKey', '000000'],
    ['activityStartDate', '2021-1-1'],
    ['twitter', '@tsubaki'],
    ['twitch', 'ab'],
  ])('refuses an invalid %s without saving anything', async (key, value) => {
    await insertChannel('UCaaa');

    const response = await updateMember(env, 'UCaaa', validBody({ [key]: value }));

    expect(response.status).toEqual(400);
    expect(await revisionRows()).toEqual([]);
  });

  test('refuses an activityEndDate before activityStartDate', async () => {
    await insertChannel('UCaaa');

    const response = await updateMember(
      env,
      'UCaaa',
      validBody({ activityStartDate: '2024-01-01', activityEndDate: '2023-01-01' }),
    );

    expect(response.status).toEqual(400);
    expect(await revisionRows()).toEqual([]);
  });
});
