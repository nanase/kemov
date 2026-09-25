import { env } from 'cloudflare:test';

import { deleteEvent } from '../src/admin/footprints';
import {
  createMilestone,
  deleteMilestone,
  getMilestone,
  listMilestones,
  updateMilestone,
} from '../src/admin/subscriber-milestones';
import { clearEverything } from './reset-db';

beforeEach(async () => {
  await clearEverything();
  await insertChannel('UCaaa');
  await insertChannel('UCbbb');
});

async function insertChannel(channelId: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO channel (channel_id, name, fullname, color_key, color_sub, color_light, color_back, activity_start_date)
     VALUES (?1, ?1, ?1, '#000000', '#000000', '#000000', '#000000', '2021-01-01')`,
  )
    .bind(channelId)
    .run();
}

async function insertEvent(kind: string): Promise<number> {
  const row = await env.DB.prepare(
    `INSERT INTO footprints_event (date_precision, start_date, kind, title)
     VALUES ('day', '2024-01-30', ?1, '記念配信') RETURNING event_id`,
  )
    .bind(kind)
    .first<{ event_id: number }>();

  return row!.event_id;
}

async function revisionCount(): Promise<number> {
  const row = await env.DB.prepare('SELECT count(*) AS n FROM revision').first<{ n: number }>();

  return row!.n;
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    channelId: 'UCaaa',
    datePrecision: 'day',
    reachedDate: '2024-01-29',
    subscriberCount: 20000,
    announcedBy: 'member',
    eventId: null,
    memo: null,
    sources: [{ url: 'https://x.com/example/status/1', title: '達成の投稿' }],
    ...overrides,
  };
}

interface Presented {
  milestoneId: number;
  channelId: string;
  datePrecision: string;
  reachedDate: string;
  subscriberCount: number;
  announcedBy: string;
  eventId: number | null;
  status: string;
  memo: string | null;
  sources: { url: string; title: string | null }[];
}

async function create(overrides: Record<string, unknown> = {}): Promise<Presented> {
  const response = await createMilestone(env, validBody(overrides));

  expect(response.status).toEqual(201);

  return ((await response.json()) as { milestone: Presented }).milestone;
}

async function errorOf(response: Response): Promise<string> {
  return ((await response.json()) as { error: string }).error;
}

describe('createMilestone', () => {
  test('creates the row and its sources in draft, and logs no revision', async () => {
    const milestone = await create();

    expect(milestone).toMatchObject({
      channelId: 'UCaaa',
      datePrecision: 'day',
      reachedDate: '2024-01-29',
      subscriberCount: 20000,
      announcedBy: 'member',
      eventId: null,
      status: 'draft',
      sources: [{ url: 'https://x.com/example/status/1', title: '達成の投稿' }],
    });
    expect(await revisionCount()).toEqual(0);
  });

  test('accepts a month when datePrecision is month', async () => {
    expect((await create({ datePrecision: 'month', reachedDate: '2022-11' })).reachedDate).toEqual('2022-11');
  });

  test('links a footprints event of kind milestone', async () => {
    const eventId = await insertEvent('milestone');

    expect((await create({ eventId })).eventId).toEqual(eventId);
  });

  test.each([
    [{ channelId: undefined }, 'channelId must be a string'],
    [{ channelId: 'UCnope' }, 'unknown channelId: UCnope'],
    [{ datePrecision: 'year' }, 'datePrecision must be day or month'],
    [{ reachedDate: '2024-02-30' }, 'reachedDate must be YYYY-MM-DD'],
    [{ datePrecision: 'month', reachedDate: '2024-02-01' }, 'reachedDate must be YYYY-MM'],
    [{ subscriberCount: 0 }, 'subscriberCount must be greater than 0'],
    [{ subscriberCount: 1.5 }, 'subscriberCount must be an integer'],
    [{ subscriberCount: '20000' }, 'subscriberCount must be an integer'],
    [{ announcedBy: 'fan' }, 'announcedBy must be one of member, official, listener'],
    [{ eventId: '1' }, 'eventId must be an integer or null'],
    [{ eventId: 999 }, 'no footprints event 999'],
    [{ memo: 1 }, 'memo must be a string or null'],
    [{ sources: [{ url: 'http://example.com' }] }, 'every source url must start with https://'],
    [{ sources: [{ url: 'https://' }] }, 'every source url must be a valid https URL'],
    [{ sources: [{ url: 'https:// example.com' }] }, 'every source url must be a valid https URL'],
    [
      { sources: [{ url: 'https://user:secret@example.com/a' }] },
      'every source url must not carry a user name or password',
    ],
    [{ sources: [{ url: 'https://user@example.com/a' }] }, 'every source url must not carry a user name or password'],
    [{ sources: 'https://example.com' }, 'sources must be an array of { url, title }'],
  ])('refuses %o with 400', async (overrides, message) => {
    const response = await createMilestone(env, validBody(overrides));

    expect(response.status).toEqual(400);
    expect(await errorOf(response)).toEqual(message);
  });

  test('refuses to link an event that is not a milestone', async () => {
    const eventId = await insertEvent('debut');
    const response = await createMilestone(env, validBody({ eventId }));

    expect(response.status).toEqual(400);
    expect(await errorOf(response)).toEqual(`footprints event ${eventId} is not a milestone`);
  });
});

describe('listMilestones and getMilestone', () => {
  test('lists oldest first, narrowed by channel and status', async () => {
    const later = await create({ reachedDate: '2024-01-29' });
    const earlier = await create({ reachedDate: '2021-12-01', subscriberCount: 10000 });
    const other = await create({ channelId: 'UCbbb' });

    const all = (await (await listMilestones(env, null, null)).json()) as { milestones: Presented[] };

    expect(all.milestones.map((m) => m.milestoneId)).toEqual([
      earlier.milestoneId,
      later.milestoneId,
      other.milestoneId,
    ]);

    const one = (await (await listMilestones(env, 'UCbbb', 'draft')).json()) as { milestones: Presented[] };

    expect(one.milestones.map((m) => m.milestoneId)).toEqual([other.milestoneId]);

    const none = (await (await listMilestones(env, null, 'published')).json()) as { milestones: Presented[] };

    expect(none.milestones).toEqual([]);
  });

  test('refuses an unknown status', async () => {
    expect((await listMilestones(env, null, 'live')).status).toEqual(400);
  });

  test('gets one, and answers 404 for one that does not exist', async () => {
    const milestone = await create();

    expect(((await (await getMilestone(env, milestone.milestoneId)).json()) as Presented).subscriberCount).toEqual(
      20000,
    );
    expect((await getMilestone(env, milestone.milestoneId + 1)).status).toEqual(404);
  });
});

describe('updateMilestone', () => {
  test('replaces the row and its sources, keeps status, and logs no revision', async () => {
    const milestone = await create();

    const response = await updateMilestone(
      env,
      milestone.milestoneId,
      validBody({
        subscriberCount: 15000,
        announcedBy: 'listener',
        sources: [{ url: 'https://x.com/listener/status/2' }, { url: 'https://x.com/listener/status/3' }],
      }),
    );

    expect(response.status).toEqual(200);

    const updated = ((await response.json()) as { milestone: Presented }).milestone;

    expect(updated).toMatchObject({
      subscriberCount: 15000,
      announcedBy: 'listener',
      status: 'draft',
      sources: [
        { url: 'https://x.com/listener/status/2', title: null },
        { url: 'https://x.com/listener/status/3', title: null },
      ],
    });
    expect(await revisionCount()).toEqual(0);
  });

  test('answers 404 for a milestone that does not exist, and 400 for a bad body', async () => {
    const milestone = await create();

    expect((await updateMilestone(env, milestone.milestoneId + 1, validBody())).status).toEqual(404);
    expect((await updateMilestone(env, milestone.milestoneId, validBody({ subscriberCount: -1 }))).status).toEqual(400);
  });
});

describe('deleteMilestone', () => {
  test('deletes a draft and its sources', async () => {
    const milestone = await create();

    expect((await deleteMilestone(env, milestone.milestoneId)).status).toEqual(200);
    expect((await getMilestone(env, milestone.milestoneId)).status).toEqual(404);

    const sources = await env.DB.prepare('SELECT count(*) AS n FROM subscriber_milestone_source').first<{
      n: number;
    }>();

    expect(sources!.n).toEqual(0);
  });

  test('refuses a published milestone with 409, and answers 404 for one that does not exist', async () => {
    const milestone = await create();

    await env.DB.prepare(`UPDATE subscriber_milestone SET status = 'published' WHERE milestone_id = ?1`)
      .bind(milestone.milestoneId)
      .run();

    expect((await deleteMilestone(env, milestone.milestoneId)).status).toEqual(409);
    expect((await deleteMilestone(env, milestone.milestoneId + 1)).status).toEqual(404);
  });
});

describe('deleteEvent with a linked milestone', () => {
  test('refuses with 409 rather than failing on the foreign key', async () => {
    const eventId = await insertEvent('milestone');
    const milestone = await create({ eventId });

    const response = await deleteEvent(env, eventId);

    expect(response.status).toEqual(409);
    expect(await errorOf(response)).toEqual(
      `subscriber milestone ${milestone.milestoneId} links to this event; unlink it there first`,
    );

    await updateMilestone(env, milestone.milestoneId, validBody({ eventId: null }));

    expect((await deleteEvent(env, eventId)).status).toEqual(200);
  });
});

// The CHECKs 0010_add_subscriber_milestone.sql declares, with raw SQL: the
// functions above refuse the same values first, so only this reaches them.
describe('subscriber_milestone', () => {
  const insert = (columns: Record<string, unknown>) => {
    const row = {
      channel_id: 'UCaaa',
      date_precision: 'day',
      reached_date: '2024-01-29',
      subscriber_count: 20000,
      announced_by: 'member',
      ...columns,
    };
    const names = Object.keys(row);

    return env.DB.prepare(
      `INSERT INTO subscriber_milestone (${names.join(', ')}) VALUES (${names.map((_, index) => `?${index + 1}`).join(', ')})`,
    )
      .bind(...Object.values(row))
      .run();
  };

  test('accepts a row', async () => {
    await expect(insert({})).resolves.toMatchObject({ success: true });
  });

  test.each([
    [{ channel_id: 'UCnope' }],
    [{ date_precision: 'year' }],
    [{ reached_date: '2024-1-29' }],
    [{ date_precision: 'month', reached_date: '2024-01-29' }],
    [{ subscriber_count: 0 }],
    [{ announced_by: 'fan' }],
    [{ event_id: 999 }],
  ])('refuses %o', async (columns) => {
    await expect(insert(columns)).rejects.toThrow();
  });

  test('refuses a source that is not https', async () => {
    const row = await insert({});

    await expect(
      env.DB.prepare(
        "INSERT INTO subscriber_milestone_source (milestone_id, position, url) VALUES (?1, 1, 'http://example.com')",
      )
        .bind(row.meta.last_row_id)
        .run(),
    ).rejects.toThrow();
  });
});
