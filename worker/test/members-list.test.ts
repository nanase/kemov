import { env } from 'cloudflare:test';

import { addMember, deleteMember, listMembers, saveMembers } from '../src/admin/members';
import { listChannels } from '../src/api/channels';
import { runChannelStats } from '../src/collector/channel-stats';
import { clearEverything } from './reset-db';

// Adding, ordering and deleting (#211). members.test.ts has the read and the
// single-member save.

beforeEach(clearEverything);

// A YouTube channel id: UC and 22 characters.
const A = 'UCaaaaaaaaaaaaaaaaaaaaaa';
const B = 'UCbbbbbbbbbbbbbbbbbbbbbb';
const C = 'UCcccccccccccccccccccccc';
const NEW = 'UCnnnnnnnnnnnnnnnnnnnnnn';

async function insertChannel(channelId: string, displayOrder: number): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO channel (channel_id, name, fullname, color_key, color_sub, color_light, color_back,
                          activity_start_date, display_order)
     VALUES (?1, ?1, ?1, '#000000', '#111111', '#222222', '#333333', '2021-01-01', ?2)`,
  )
    .bind(channelId, displayOrder)
    .run();
}

async function seedThree(): Promise<void> {
  await insertChannel(A, 0);
  await insertChannel(B, 1);
  await insertChannel(C, 2);
}

/** What the public site's own ordering (`ORDER BY display_order, channel_id`) reads. */
async function publicOrder(): Promise<string[]> {
  const { results } = await env.DB.prepare('SELECT channel_id FROM channel ORDER BY display_order, channel_id').all<{
    channel_id: string;
  }>();

  return results.map((row) => row.channel_id);
}

async function revisions(): Promise<{ entity_key: string; action: string; body: string | null }[]> {
  const { results } = await env.DB.prepare('SELECT entity_key, action, body FROM revision ORDER BY revision_id').all<{
    entity_key: string;
    action: string;
    body: string | null;
  }>();

  return results;
}

function newMember(overrides: Record<string, unknown> = {}) {
  return {
    channelId: NEW,
    name: 'あたらしい',
    fullname: 'あたらしい（フル）',
    globalname: null,
    twitter: null,
    twitch: null,
    colorKey: '#123456',
    colorSub: '#234567',
    colorLight: '#345678',
    colorBack: '#456789',
    activityStartDate: '2026-10-01',
    activityEndDate: null,
    ...overrides,
  };
}

describe('addMember', () => {
  test('adds the member at the end of the list and logs a revision', async () => {
    await seedThree();

    const response = await addMember(env, newMember());

    expect(response.status).toEqual(201);
    expect(await publicOrder()).toEqual([A, B, C, NEW]);

    const rows = await revisions();

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ entity_key: NEW, action: 'save' });
    expect(JSON.parse(rows[0].body!)).toMatchObject({ channel_id: NEW, name: 'あたらしい', display_order: 3 });
  });

  // #224: revision is never trimmed, and the API lets the site keep these two
  // for 30 days. Every revision this file's routes write goes through the same
  // body, so a moved member is checked as well as an added one.
  test('keeps custom_url and thumbnail_url out of every revision body it writes', async () => {
    await env.DB.prepare(
      `INSERT INTO channel (channel_id, name, fullname, color_key, color_sub, color_light, color_back,
                            activity_start_date, custom_url, thumbnail_url, display_order)
       VALUES (?1, ?1, ?1, '#000000', '#111111', '#222222', '#333333', '2021-01-01',
               '@handle', 'https://example.invalid/a.jpg', 0)`,
    )
      .bind(A)
      .run();

    await saveMembers(env, { add: [newMember()], order: [NEW, A] });

    const rows = await revisions();

    expect(rows).toHaveLength(2);

    for (const row of rows) {
      const body = JSON.parse(row.body!) as Record<string, unknown>;

      expect(body).not.toHaveProperty('custom_url');
      expect(body).not.toHaveProperty('thumbnail_url');
    }
  });

  test('puts the first member of an empty list at 0', async () => {
    await addMember(env, newMember());

    const stored = await env.DB.prepare('SELECT display_order FROM channel').first();

    expect(stored).toEqual({ display_order: 0 });
  });

  test('leaves the columns the collector fills empty', async () => {
    await addMember(env, newMember());

    const stored = await env.DB.prepare('SELECT custom_url, thumbnail_url, fetched_at FROM channel').first();

    expect(stored).toEqual({ custom_url: null, thumbnail_url: null, fetched_at: null });
  });

  test('answers 409 for an id that is already a member, and changes nothing', async () => {
    await seedThree();

    const response = await addMember(env, newMember({ channelId: B }));

    expect(response.status).toEqual(409);
    expect(await revisions()).toEqual([]);
    expect(await publicOrder()).toEqual([A, B, C]);
  });

  test.each([
    ['channelId', 'UCshort'],
    ['channelId', null],
    ['name', ''],
    ['colorKey', '123456'],
    ['activityStartDate', '2026-02-30'],
    ['twitter', '@x'],
    ['twitch', 'ab'],
  ])('refuses an invalid %s (same rules as updateMember) and writes nothing', async (key, value) => {
    const response = await addMember(env, newMember({ [key]: value }));

    expect(response.status).toEqual(400);
    expect(await publicOrder()).toEqual([]);
    expect(await revisions()).toEqual([]);
  });

  test('refuses an activityEndDate before activityStartDate', async () => {
    const response = await addMember(env, newMember({ activityEndDate: '2026-01-01' }));

    expect(response.status).toEqual(400);
    expect(await publicOrder()).toEqual([]);
  });

  test('refuses a column a caller may not set', async () => {
    const response = await addMember(env, newMember({ displayOrder: 0 }));

    expect(response.status).toEqual(400);
    expect(await response.json()).toEqual({ error: 'displayOrder cannot be saved' });
  });

  // #211: what the collector reads is `SELECT channel_id FROM channel`
  // (collector/channel-stats.ts, collector/video.ts), with no filter, so a
  // row added here is in the next tick's list.
  test('is picked up by the next channel-stats tick', async () => {
    await addMember(env, newMember());

    const requested: string[] = [];
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      requested.push(String(input));

      return new Response(
        JSON.stringify({
          items: [
            {
              id: NEW,
              snippet: { customUrl: '@new', thumbnails: { default: { url: 'https://example.com/n.jpg' } } },
              statistics: { viewCount: '10', subscriberCount: '2', hiddenSubscriberCount: false, videoCount: '1' },
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });

    await runChannelStats(env, fetchImpl);

    expect(requested.join('\n')).toContain(NEW);

    const stored = await env.DB.prepare('SELECT custom_url, fetched_at FROM channel WHERE channel_id = ?1')
      .bind(NEW)
      .first<{ custom_url: string | null; fetched_at: string | null }>();

    expect(stored?.custom_url).toEqual('@new');
    expect(stored?.fetched_at).not.toBeNull();

    const snapshot = await env.DB.prepare('SELECT 1 FROM channel_snapshot WHERE channel_id = ?1').bind(NEW).first();

    expect(snapshot).not.toBeNull();
  });
});

describe('saveMembers', () => {
  test('sets every member to its place in the list, and logs a revision only for the ones that moved', async () => {
    await seedThree();

    const response = await saveMembers(env, { order: [C, A, B] });

    expect(response.status).toEqual(200);
    expect(await publicOrder()).toEqual([C, A, B]);

    // A: 0 -> 1, B: 1 -> 2, C: 2 -> 0 - all three moved.
    expect((await revisions()).map((row) => row.entity_key).sort()).toEqual([A, B, C]);
  });

  test('writes nothing for a member whose place did not change', async () => {
    await seedThree();

    await saveMembers(env, { order: [A, C, B] });

    expect((await revisions()).map((row) => row.entity_key).sort()).toEqual([B, C]);
  });

  test('renumbers a list with gaps and ties to 0..n-1', async () => {
    await insertChannel(A, 5);
    await insertChannel(B, 5);
    await insertChannel(C, 9);

    await saveMembers(env, { order: [A, B, C] });

    const { results } = await env.DB.prepare('SELECT display_order FROM channel ORDER BY display_order').all();

    expect(results.map((row) => row.display_order)).toEqual([0, 1, 2]);
    expect(await publicOrder()).toEqual([A, B, C]);
  });

  test('adds a member and reorders in the same save, at the place the list gives it', async () => {
    await seedThree();

    const response = await saveMembers(env, { add: [newMember()], order: [A, NEW, B, C] });

    expect(response.status).toEqual(200);
    expect(await publicOrder()).toEqual([A, NEW, B, C]);

    const body = (await response.json()) as { members: { channelId: string; displayOrder: number }[] };

    expect(body.members.map((member) => [member.channelId, member.displayOrder])).toEqual([
      [A, 0],
      [NEW, 1],
      [B, 2],
      [C, 3],
    ]);
  });

  test('writes nothing at all when the list is refused', async () => {
    await seedThree();

    // A is missing from the order: a list somebody else changed under this one.
    const response = await saveMembers(env, { add: [newMember()], order: [NEW, B, C] });

    expect(response.status).toEqual(409);
    expect(await publicOrder()).toEqual([A, B, C]);
    expect(await revisions()).toEqual([]);
  });

  test.each([
    ['a repeated id', (): string[] => [A, A, B]],
    ['an id that is not a member', (): string[] => [A, B, C, NEW]],
    ['too few ids', (): string[] => [A, B]],
  ])('refuses an order with %s (409)', async (_label, order) => {
    await seedThree();

    const response = await saveMembers(env, { order: order() });

    expect(response.status).toEqual(409);
    expect(await publicOrder()).toEqual([A, B, C]);
  });

  test('refuses an invalid new member without reordering anything', async () => {
    await seedThree();

    const response = await saveMembers(env, { add: [newMember({ colorKey: 'x' })], order: [NEW, A, B, C] });

    expect(response.status).toEqual(400);
    expect(await publicOrder()).toEqual([A, B, C]);
  });

  test('refuses an add for a member that already exists', async () => {
    await seedThree();

    const response = await saveMembers(env, { add: [newMember({ channelId: A })], order: [A, B, C] });

    expect(response.status).toEqual(409);
  });

  test.each([
    ['no order', {}],
    ['an order that is not a list', { order: 'A' }],
    ['an order of non-strings', { order: [1, 2] }],
    ['an add that is not a list', { add: 'x', order: [] }],
    ['an add of non-objects', { add: [1], order: [] }],
    ['a key it does not know', { order: [], extra: 1 }],
  ])('refuses %s (400)', async (_label, body) => {
    const response = await saveMembers(env, body);

    expect(response.status).toEqual(400);
  });

  // The public site's own endpoint, not only the ORDER BY it shares with
  // the admin list: months.ts and streams.ts order the same way
  // (`display_order, channel_id`), so this is the one read that has to move.
  test('the public channel list follows the saved order, a member just added included', async () => {
    await seedThree();
    await saveMembers(env, { add: [newMember()], order: [C, NEW, A, B] });

    const { channels } = await listChannels(env);

    expect(channels.map((channel) => channel.channelId)).toEqual([C, NEW, A, B]);
  });

  test('the list reads back in the saved order', async () => {
    await seedThree();
    await saveMembers(env, { order: [B, C, A] });

    const body = (await (await listMembers(env)).json()) as { members: { channelId: string }[] };

    expect(body.members.map((member) => member.channelId)).toEqual([B, C, A]);
  });
});

describe('deleteMember', () => {
  test('answers 404 for a member that does not exist', async () => {
    expect((await deleteMember(env, A)).status).toEqual(404);
  });

  test('deletes a member nothing has been recorded against, and logs the delete', async () => {
    await seedThree();

    const response = await deleteMember(env, B);

    expect(response.status).toEqual(200);
    expect(await publicOrder()).toEqual([A, C]);

    const rows = await revisions();

    expect(rows).toHaveLength(1);
    // revision's own CHECK: a delete carries no body.
    expect(rows[0]).toEqual({ entity_key: B, action: 'delete', body: null });
  });

  // The three tables that reference `channel`. Each one alone is enough to
  // refuse, and the refusal says which.
  test.each([
    [
      'channel_snapshot',
      `INSERT INTO channel_snapshot (channel_id, fetched_at, subscriber_count, view_count, video_count)
       VALUES ('${B}', '2026-09-08T00:00:00Z', 1, 2, 3)`,
    ],
    [
      'video',
      `INSERT INTO video (video_id, channel_id, title, published_at, availability, live_broadcast_content, fetched_at)
       VALUES ('vid1', '${B}', 't', '2026-09-01T00:00:00Z', 'public', 'none', '2026-09-01T00:00:00Z')`,
    ],
    [
      'footprints_event_member',
      `INSERT INTO footprints_event (date_precision, start_date, kind, title) VALUES ('day', '2026-09-01', 'other', 't')`,
    ],
  ])('refuses a member with a %s row, says why, and deletes nothing', async (table, insert) => {
    await seedThree();
    await env.DB.prepare(insert).run();

    if (table === 'footprints_event_member') {
      await env.DB.prepare(
        `INSERT INTO footprints_event_member (event_id, channel_id) SELECT event_id, '${B}' FROM footprints_event`,
      ).run();
    }

    const response = await deleteMember(env, B);

    expect(response.status).toEqual(409);

    const { error } = (await response.json()) as { error: string };

    expect(error).toContain(table);
    expect(error).toContain('activityEndDate');
    expect(await publicOrder()).toEqual([A, B, C]);
    expect(await revisions()).toEqual([]);
  });

  test('names every table that has rows, not only the first', async () => {
    await seedThree();
    await env.DB.prepare(
      `INSERT INTO channel_snapshot (channel_id, fetched_at, subscriber_count, view_count, video_count)
       VALUES ('${B}', '2026-09-08T00:00:00Z', 1, 2, 3)`,
    ).run();
    await env.DB.prepare(
      `INSERT INTO video (video_id, channel_id, title, published_at, availability, live_broadcast_content, fetched_at)
       VALUES ('vid1', '${B}', 't', '2026-09-01T00:00:00Z', 'public', 'none', '2026-09-01T00:00:00Z')`,
    ).run();

    const { error } = (await (await deleteMember(env, B)).json()) as { error: string };

    expect(error).toContain('channel_snapshot: 1');
    expect(error).toContain('video: 1');
    expect(error).not.toContain('footprints_event_member');
  });

  // collect_task has no foreign key: a member whose first fetch failed has a
  // `failed` task and nothing else, and deleting the member has to take it.
  test('takes the failed collect tasks aimed at the member, and only those', async () => {
    await seedThree();
    await env.DB.prepare(
      `INSERT INTO collect_task (kind, target_id, state, attempts, next_attempt_at, updated_at)
       VALUES ('channel_stats', ?1, 'failed', 1, '2026-09-08T00:00:00Z', '2026-09-08T00:00:00Z'),
              ('video_discover', ?1, 'failed', 1, '2026-09-08T00:00:00Z', '2026-09-08T00:00:00Z'),
              ('channel_stats', ?2, 'failed', 1, '2026-09-08T00:00:00Z', '2026-09-08T00:00:00Z'),
              ('video_update', ?1, 'failed', 1, '2026-09-08T00:00:00Z', '2026-09-08T00:00:00Z')`,
    )
      .bind(B, C)
      .run();

    expect((await deleteMember(env, B)).status).toEqual(200);

    const { results } = await env.DB.prepare('SELECT kind, target_id FROM collect_task ORDER BY kind, target_id').all();

    // The other member's task stays, and so does a kind whose target is a
    // video id that only happens to equal the channel id.
    expect(results).toEqual([
      { kind: 'channel_stats', target_id: C },
      { kind: 'video_update', target_id: B },
    ]);
  });

  test('leaves the collect tasks alone when the delete is refused', async () => {
    await seedThree();
    await env.DB.prepare(
      `INSERT INTO channel_snapshot (channel_id, fetched_at, subscriber_count, view_count, video_count)
       VALUES ('${B}', '2026-09-08T00:00:00Z', 1, 2, 3)`,
    ).run();
    await env.DB.prepare(
      `INSERT INTO collect_task (kind, target_id, state, attempts, updated_at)
       VALUES ('video_discover', ?1, 'failed', 1, '2026-09-08T00:00:00Z')`,
    )
      .bind(B)
      .run();

    expect((await deleteMember(env, B)).status).toEqual(409);

    const stored = await env.DB.prepare('SELECT count(*) AS n FROM collect_task').first();

    expect(stored).toEqual({ n: 1 });
  });

  test('a member added and then deleted before anything is recorded is gone', async () => {
    await seedThree();
    await addMember(env, newMember());

    expect((await deleteMember(env, NEW)).status).toEqual(200);
    expect(await publicOrder()).toEqual([A, B, C]);
  });
});
