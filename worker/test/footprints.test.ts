import { env } from 'cloudflare:test';

import { createEvent, deleteEvent, getEvent, listEvents, readEvents, updateEvent } from '../src/admin/footprints';
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

async function revisionCount(): Promise<number> {
  const row = await env.DB.prepare('SELECT count(*) AS n FROM revision').first<{ n: number }>();

  return row!.n;
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    datePrecision: 'day',
    startDate: '2025-01-01',
    startsAt: null,
    endDate: null,
    kind: 'debut',
    emphasized: false,
    title: 'デビュー',
    place: 'YouTube',
    supplement: null,
    videoId: null,
    sourcePending: true,
    memo: null,
    channelIds: [],
    sources: [],
    ...overrides,
  };
}

describe('createEvent', () => {
  test('creates the row, its members and its sources, and logs no revision', async () => {
    await insertChannel('UCaaa');

    const response = await createEvent(
      env,
      validBody({ channelIds: ['UCaaa'], sources: [{ url: 'https://example.com/a', title: 'a' }] }),
    );

    expect(response.status).toEqual(201);

    const body = (await response.json()) as { event: { eventId: number; channelIds: string[]; sources: unknown[] } };

    expect(body.event.channelIds).toEqual(['UCaaa']);
    expect(body.event.sources).toEqual([{ url: 'https://example.com/a', title: 'a' }]);
    expect(await revisionCount()).toEqual(0);
  });

  test('always creates in draft, regardless of what the body carries', async () => {
    const response = await createEvent(env, validBody());
    const body = (await response.json()) as { event: { status: string } };

    expect(body.event.status).toEqual('draft');
  });

  test.each([
    ['datePrecision', 'week'],
    ['startDate', '2025-1-1'],
    ['kind', 'party'],
  ])('refuses an invalid %s without creating anything', async (key, value) => {
    const response = await createEvent(env, validBody({ [key]: value }));

    expect(response.status).toEqual(400);
    expect((await listEvents(env, null, null).then((r) => r.json())) as { events: unknown[] }).toEqual({ events: [] });
  });

  test('refuses startsAt on a month-precision event', async () => {
    const response = await createEvent(
      env,
      validBody({ datePrecision: 'month', startDate: '2025-01', startsAt: '2025-01-01T00:00:00Z' }),
    );

    expect(response.status).toEqual(400);
  });

  test('refuses startsAt whose Japan-time date does not match startDate', async () => {
    // 2025-01-01T15:00:00Z is 2025-01-02 in Japan time (+9).
    const response = await createEvent(env, validBody({ startsAt: '2025-01-01T15:00:00Z' }));

    expect(response.status).toEqual(400);
  });

  test('accepts startsAt whose Japan-time date does match startDate', async () => {
    // 2025-01-01T20:00:00Z is 2025-01-02 05:00 in Japan time.
    const response = await createEvent(env, validBody({ startDate: '2025-01-02', startsAt: '2025-01-01T20:00:00Z' }));

    expect(response.status).toEqual(201);
  });

  test('refuses an endDate before startDate', async () => {
    const response = await createEvent(env, validBody({ endDate: '2024-12-31' }));

    expect(response.status).toEqual(400);
  });

  test('accepts a month-shaped endDate', async () => {
    const response = await createEvent(env, validBody({ endDate: '2025-02' }));

    expect(response.status).toEqual(201);
  });

  test('refuses a source whose url is not https://', async () => {
    const response = await createEvent(env, validBody({ sources: [{ url: 'http://example.com', title: null }] }));

    expect(response.status).toEqual(400);
  });

  test.each(['true', null, 1, 0])('refuses emphasized: %p', async (value) => {
    const response = await createEvent(env, validBody({ emphasized: value }));

    expect(response.status).toEqual(400);
  });

  test.each(['false', null, 1, 0])('refuses sourcePending: %p', async (value) => {
    const response = await createEvent(env, validBody({ sourcePending: value }));

    expect(response.status).toEqual(400);
  });

  test('emphasized defaults to false and sourcePending defaults to true when left out', async () => {
    const body = validBody();

    delete (body as Record<string, unknown>).emphasized;
    delete (body as Record<string, unknown>).sourcePending;

    const response = await createEvent(env, body);
    const created = (await response.json()) as { event: { emphasized: boolean; sourcePending: boolean } };

    expect(created.event.emphasized).toEqual(false);
    expect(created.event.sourcePending).toEqual(true);
  });

  test('refuses an unknown channelId without creating anything', async () => {
    const response = await createEvent(env, validBody({ channelIds: ['UCnope'] }));

    expect(response.status).toEqual(400);
    expect(await response.json()).toEqual({ error: 'unknown channelIds: UCnope' });
  });

  // channel's own D1 IN (...) query would otherwise be bound with more than
  // D1's 100-parameter limit and fail with a raw constraint error instead of
  // this 400.
  test('refuses more than 100 unknown channelIds with 400 rather than a raw D1 error', async () => {
    const channelIds = Array.from({ length: 101 }, (_, i) => `UC${i}`);
    const response = await createEvent(env, validBody({ channelIds }));

    expect(response.status).toEqual(400);
  });

  // footprints_event_member's primary key is (event_id, channel_id) - a
  // repeated id inserted twice would otherwise fail the whole batch with a
  // constraint error, not the 400 every other bad input gets.
  test('deduplicates a repeated channelId rather than failing the batch', async () => {
    await insertChannel('UCaaa');

    const response = await createEvent(env, validBody({ channelIds: ['UCaaa', 'UCaaa'] }));

    expect(response.status).toEqual(201);

    const body = (await response.json()) as { event: { channelIds: string[] } };

    expect(body.event.channelIds).toEqual(['UCaaa']);
  });
});

describe('updateEvent', () => {
  test('answers 404 for an event that does not exist', async () => {
    const response = await updateEvent(env, 1, validBody());

    expect(response.status).toEqual(404);
  });

  test('replaces the row, its members and its sources, and logs no revision', async () => {
    await insertChannel('UCaaa');
    await insertChannel('UCbbb');

    const created = await createEvent(env, validBody({ channelIds: ['UCaaa'] }));
    const { event } = (await created.json()) as { event: { eventId: number } };

    const response = await updateEvent(
      env,
      event.eventId,
      validBody({ title: 'updated', channelIds: ['UCbbb'], sources: [{ url: 'https://example.com/b', title: null }] }),
    );

    expect(response.status).toEqual(200);

    const body = (await response.json()) as { event: { title: string; channelIds: string[] } };

    expect(body.event.title).toEqual('updated');
    expect(body.event.channelIds).toEqual(['UCbbb']);
    expect(await revisionCount()).toEqual(0);
  });

  test('never changes status', async () => {
    const inserted = await env.DB.prepare(
      `INSERT INTO footprints_event (date_precision, start_date, kind, title, status)
       VALUES ('day', '2025-01-01', 'debut', 'x', 'published')`,
    ).run();

    const response = await updateEvent(env, inserted.meta.last_row_id, validBody({ status: 'draft' }));
    const body = (await response.json()) as { event: { status: string } };

    expect(response.status).toEqual(200);
    expect(body.event.status).toEqual('published');
  });
});

describe('deleteEvent', () => {
  test('answers 404 for an event that does not exist', async () => {
    expect((await deleteEvent(env, 1)).status).toEqual(404);
  });

  test('deletes a draft event, its members and its sources', async () => {
    await insertChannel('UCaaa');

    const created = await createEvent(env, validBody({ channelIds: ['UCaaa'] }));
    const { event } = (await created.json()) as { event: { eventId: number } };

    const response = await deleteEvent(env, event.eventId);

    expect(response.status).toEqual(200);
    expect((await getEvent(env, event.eventId)).status).toEqual(404);

    const members = await env.DB.prepare('SELECT 1 FROM footprints_event_member WHERE event_id = ?1')
      .bind(event.eventId)
      .first();

    expect(members).toBeNull();
  });

  test('refuses to delete a published event with 409', async () => {
    const inserted = await env.DB.prepare(
      `INSERT INTO footprints_event (date_precision, start_date, kind, title, status)
       VALUES ('day', '2025-01-01', 'debut', 'x', 'published')`,
    ).run();

    const eventId = inserted.meta.last_row_id;
    const response = await deleteEvent(env, eventId);

    expect(response.status).toEqual(409);

    const stored = await env.DB.prepare('SELECT 1 FROM footprints_event WHERE event_id = ?1').bind(eventId).first();

    expect(stored).not.toBeNull();
  });
});

describe('listEvents', () => {
  test('narrows by status', async () => {
    await createEvent(env, validBody({ title: 'a draft' }));

    const response = await listEvents(env, 'published', null);
    const body = (await response.json()) as { events: unknown[] };

    expect(body.events).toEqual([]);
  });

  test('narrows by a substring of title', async () => {
    await createEvent(env, validBody({ title: 'ペンギンのデビュー' }));
    await createEvent(env, validBody({ title: '別のできごと' }));

    const response = await listEvents(env, null, 'ペンギン');
    const body = (await response.json()) as { events: { title: string }[] };

    expect(body.events.map((event) => event.title)).toEqual(['ペンギンのデビュー']);
  });

  test('refuses a q whose escaped, wrapped pattern would exceed D1s 50-byte LIKE limit', async () => {
    // 49 ASCII bytes - one under the limit on its own, but wrapped in `%` on
    // both sides it becomes 51.
    const response = await listEvents(env, null, 'a'.repeat(49));

    expect(response.status).toEqual(400);
  });

  test('accepts a q whose wrapped pattern is exactly 50 bytes', async () => {
    const response = await listEvents(env, null, 'a'.repeat(48));

    expect(response.status).toEqual(200);
  });

  test('orders by startDate then eventId', async () => {
    await createEvent(env, validBody({ startDate: '2025-03-01' }));
    await createEvent(env, validBody({ startDate: '2025-01-01' }));
    await createEvent(env, validBody({ startDate: '2025-01-01' }));

    const response = await listEvents(env, null, null);
    const body = (await response.json()) as { events: { eventId: number; startDate: string }[] };

    expect(body.events.map((event) => event.startDate)).toEqual(['2025-01-01', '2025-01-01', '2025-03-01']);
    expect(body.events[0].eventId).toBeLessThan(body.events[1].eventId);
  });

  // The id SELECT and readEvents' own SELECTs are two round trips, not one
  // batch, so a concurrent deleteEvent can finish in between: the id this
  // query found is gone by the time readEvents looks it up, and byId then
  // has no entry for it. Rigs env.DB.prepare to delete the row right after
  // that one SELECT resolves, the same moment a real race would land in.
  test('skips a row deleted between the id query and readEvents, rather than throwing', async () => {
    const created = await createEvent(env, validBody());
    const { event } = (await created.json()) as { event: { eventId: number } };
    const eventId = event.eventId;
    const realPrepare = env.DB.prepare.bind(env.DB);

    const riggedDB = {
      prepare: (sql: string) => {
        const stmt = realPrepare(sql);

        if (!sql.startsWith('SELECT event_id FROM footprints_event')) return stmt;

        return {
          bind: (...args: unknown[]) => {
            const bound = stmt.bind(...args);

            return {
              all: async <T = unknown>() => {
                const result = await bound.all<T>();

                await env.DB.prepare('DELETE FROM footprints_event WHERE event_id = ?1').bind(eventId).run();

                return result;
              },
              first: bound.first.bind(bound),
              run: bound.run.bind(bound),
              raw: bound.raw.bind(bound),
            };
          },
        };
      },
    };

    const response = await listEvents({ ...env, DB: riggedDB } as typeof env, null, null);

    expect(response.status).toEqual(200);
    expect(await response.json()).toEqual({ events: [] });
  });
});

describe('readEvents', () => {
  // Without chunking, a single SELECT ... IN (...) bound with all 101 ids
  // would exceed D1's 100-parameter limit and fail outright, not just answer
  // with fewer rows than asked for.
  test('does not fail when asked for more than 100 ids at once', async () => {
    const ids = Array.from({ length: 101 }, (_, i) => i + 1);
    const result = await readEvents(env, ids);

    expect(result.size).toEqual(0);
  });
});
