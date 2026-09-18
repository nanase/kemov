import { env } from 'cloudflare:test';

import { createEvent, updateEvent } from '../src/admin/footprints';
import { pendingFootprints, publishEvent, publishFootprintsNow, withdrawEvent } from '../src/admin/footprints-publish';
import { clearEverything } from './reset-db';

async function clearPublicData(): Promise<void> {
  const listed = await env.PUBLIC_DATA.list();

  await Promise.all(listed.objects.map((object) => env.PUBLIC_DATA.delete(object.key)));
}

beforeEach(async () => {
  await clearEverything();
  await clearPublicData();
});

const NOW = new Date('2026-09-18T00:00:00Z');
const WHITELISTED_SOURCE = 'https://kemono-friends.jp/some-article';

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    datePrecision: 'day',
    startDate: '2025-01-01',
    startsAt: null,
    endDate: null,
    kind: 'debut',
    emphasized: false,
    title: 'デビュー',
    place: null,
    supplement: null,
    videoId: null,
    sourcePending: false,
    memo: 'draft note',
    channelIds: [],
    sources: [{ url: WHITELISTED_SOURCE, title: null }],
    ...overrides,
  };
}

async function createValidEvent(overrides: Record<string, unknown> = {}): Promise<number> {
  const response = await createEvent(env, validBody(overrides));
  const body = (await response.json()) as { event: { eventId: number } };

  return body.event.eventId;
}

async function revisionRows(): Promise<{ entity_key: string; action: string; body: string | null }[]> {
  const { results } = await env.DB.prepare(
    "SELECT entity_key, action, body FROM revision WHERE entity = 'footprints_event' ORDER BY revision_id",
  ).all<{ entity_key: string; action: string; body: string | null }>();

  return results;
}

describe('publishEvent', () => {
  test('answers 404 for an event that does not exist', async () => {
    expect((await publishEvent(env, 1)).status).toEqual(404);
  });

  test('publishes a ready event and logs a publish revision', async () => {
    const eventId = await createValidEvent();

    const response = await publishEvent(env, eventId);

    expect(response.status).toEqual(200);

    const body = (await response.json()) as { event: { status: string }; revisionId: number };

    expect(body.event.status).toEqual('published');
    expect(typeof body.revisionId).toEqual('number');

    const rows = await revisionRows();

    expect(rows).toEqual([{ entity_key: String(eventId), action: 'publish', body: expect.any(String) }]);
  });

  test('refuses an empty title, and changes nothing', async () => {
    const eventId = await createValidEvent({ title: '' });

    const response = await publishEvent(env, eventId);

    expect(response.status).toEqual(400);
    expect(await response.json()).toEqual({ errors: ['title must not be empty'] });
    expect(await revisionRows()).toEqual([]);

    const stored = await env.DB.prepare('SELECT status FROM footprints_event WHERE event_id = ?1')
      .bind(eventId)
      .first<{ status: string }>();

    expect(stored!.status).toEqual('draft');
  });

  test('refuses sourcePending=false with no sources', async () => {
    const eventId = await createValidEvent({ sources: [] });

    const response = await publishEvent(env, eventId);

    expect(response.status).toEqual(400);
    expect(await response.json()).toEqual({ errors: ['sourcePending is false but there are no sources'] });
  });

  test('refuses sourcePending=false when no source is in the whitelist', async () => {
    const eventId = await createValidEvent({ sources: [{ url: 'https://ameblo.jp/someone/entry-1', title: null }] });

    const response = await publishEvent(env, eventId);

    expect(response.status).toEqual(400);
    expect(await response.json()).toEqual({ errors: ['sourcePending is false but no source is in the whitelist'] });
  });

  test('allows sourcePending=true with no sources', async () => {
    const eventId = await createValidEvent({ sourcePending: true, sources: [] });

    expect((await publishEvent(env, eventId)).status).toEqual(200);
  });

  test('refuses a videoId that is not 11 characters', async () => {
    const eventId = await createValidEvent({ videoId: 'short' });

    const response = await publishEvent(env, eventId);

    expect(response.status).toEqual(400);
    expect(await response.json()).toEqual({ errors: ['videoId must be 11 characters'] });
  });

  test('collects every failing condition in one answer', async () => {
    const eventId = await createValidEvent({ title: '', videoId: 'short', sources: [] });

    const response = await publishEvent(env, eventId);
    const body = (await response.json()) as { errors: string[] };

    expect(body.errors).toEqual([
      'title must not be empty',
      'sourcePending is false but there are no sources',
      'videoId must be 11 characters',
    ]);
  });

  test('publishing again logs a second publish revision, matching the current row', async () => {
    const eventId = await createValidEvent();

    await publishEvent(env, eventId);
    await updateEvent(env, eventId, validBody({ title: 'revised title' }));

    const response = await publishEvent(env, eventId);

    expect(response.status).toEqual(200);
    expect(await revisionRows()).toHaveLength(2);

    const rows = await revisionRows();

    expect(JSON.parse(rows[1].body!)).toMatchObject({ title: 'revised title' });
  });

  // Mirrors publishEvent's own batch, run against a row that is already gone
  // by the time it executes - the state a concurrent deleteEvent would leave
  // behind after publishEvent's own readEvent already found the row. The
  // INSERT's WHERE EXISTS must keep the revision from growing even though
  // nothing stops the UPDATE itself from running (and changing nothing).
  test('does not log a revision when its batch runs after the row is already gone', async () => {
    // No sources or channelIds, so the delete below needs nothing else
    // removed first: footprints_event_source/_member both foreign-key back
    // to footprints_event.
    const eventId = await createValidEvent({ sources: [] });

    await env.DB.prepare('DELETE FROM footprints_event WHERE event_id = ?1').bind(eventId).run();

    await env.DB.batch([
      env.DB.prepare(`UPDATE footprints_event SET status = 'published' WHERE event_id = ?1`).bind(eventId),
      env.DB.prepare(
        `INSERT INTO revision (entity, entity_key, action, body, created_via)
         SELECT 'footprints_event', ?1, 'publish', ?2, 'admin'
         WHERE EXISTS (SELECT 1 FROM footprints_event WHERE event_id = ?1)`,
      ).bind(String(eventId), JSON.stringify({ event_id: eventId })),
    ]);

    expect(await revisionRows()).toHaveLength(0);
  });
});

describe('withdrawEvent', () => {
  test('answers 404 for an event that does not exist', async () => {
    expect((await withdrawEvent(env, 1)).status).toEqual(404);
  });

  test('sets status to draft and logs a withdraw revision with a null body', async () => {
    const eventId = await createValidEvent();

    await publishEvent(env, eventId);

    const response = await withdrawEvent(env, eventId);

    expect(response.status).toEqual(200);

    const body = (await response.json()) as { event: { status: string } };

    expect(body.event.status).toEqual('draft');

    const rows = await revisionRows();

    expect(rows[rows.length - 1]).toEqual({ entity_key: String(eventId), action: 'withdraw', body: null });
  });
});

describe('pendingFootprints', () => {
  test('lists an event whose latest revision has not been published yet', async () => {
    const eventId = await createValidEvent();

    await publishEvent(env, eventId);

    const response = await pendingFootprints(env);
    const body = (await response.json()) as { pending: { eventId: number; latestAction: string }[] };

    expect(body.pending).toEqual([{ eventId, latestAction: 'publish' }]);
  });

  test('is empty once "publish now" has caught up', async () => {
    const eventId = await createValidEvent();

    await publishEvent(env, eventId);
    await publishFootprintsNow(env, NOW);

    const body = (await pendingFootprints(env).then((r) => r.json())) as { pending: unknown[] };

    expect(body.pending).toEqual([]);
  });

  test('does not report a memo-only edit as changed', async () => {
    const eventId = await createValidEvent();

    await publishEvent(env, eventId);
    await updateEvent(env, eventId, validBody({ memo: 'a different memo' }));

    const body = (await pendingFootprints(env).then((r) => r.json())) as { changed: unknown[] };

    expect(body.changed).toEqual([]);
  });

  test('reports a title edit as changed', async () => {
    const eventId = await createValidEvent();

    await publishEvent(env, eventId);
    await updateEvent(env, eventId, validBody({ title: 'a new title' }));

    const body = (await pendingFootprints(env).then((r) => r.json())) as { changed: { eventId: number }[] };

    expect(body.changed).toEqual([{ eventId, title: 'a new title' }]);
  });
});

describe('publishFootprintsNow', () => {
  async function readPublished(): Promise<{ published_at: string; events: { event_id: number }[] } | null> {
    const object = await env.PUBLIC_DATA.get('footprints/events.json');

    if (object === null) return null;

    return JSON.parse(await object.text());
  }

  test('writes nothing and answers published: false when nothing is pending', async () => {
    const response = await publishFootprintsNow(env, NOW);

    expect(await response.json()).toEqual({ published: false });
    expect(await readPublished()).toBeNull();
  });

  test('writes the JSON and adds a publication row', async () => {
    const eventId = await createValidEvent();

    await publishEvent(env, eventId);

    const response = await publishFootprintsNow(env, NOW);

    expect(response.status).toEqual(200);

    const body = (await response.json()) as { published: boolean; eventCount: number };

    expect(body.published).toEqual(true);
    expect(body.eventCount).toEqual(1);

    const published = await readPublished();

    expect(published!.published_at).toEqual('2026-09-18T00:00:00Z');
    expect(published!.events).toHaveLength(1);
    expect(published!.events[0].event_id).toEqual(eventId);

    const publication = await env.DB.prepare(
      "SELECT target, object_key FROM publication WHERE target = 'footprints'",
    ).first();

    expect(publication).toEqual({ target: 'footprints', object_key: 'footprints/events.json' });
  });

  test('leaves out an event whose latest revision is a withdraw', async () => {
    const eventId = await createValidEvent();

    await publishEvent(env, eventId);
    await withdrawEvent(env, eventId);
    await publishFootprintsNow(env, NOW);

    const published = await readPublished();

    expect(published!.events).toEqual([]);
  });

  test('orders events by startDate then eventId', async () => {
    const later = await createValidEvent({ startDate: '2025-03-01' });
    const earlierA = await createValidEvent({ startDate: '2025-01-01' });
    const earlierB = await createValidEvent({ startDate: '2025-01-01' });

    await publishEvent(env, later);
    await publishEvent(env, earlierA);
    await publishEvent(env, earlierB);

    await publishFootprintsNow(env, NOW);

    const published = await readPublished();

    expect(published!.events.map((event) => event.event_id)).toEqual(
      [earlierA, earlierB].sort((a, b) => a - b).concat(later),
    );
  });

  test('emphasized and sourcePending are booleans in the published JSON', async () => {
    const eventId = await createValidEvent({ emphasized: true, sourcePending: false });

    await publishEvent(env, eventId);
    await publishFootprintsNow(env, NOW);

    const published = await readPublished();

    expect(published!.events[0]).toMatchObject({ emphasized: true, source_pending: false });
  });
});
