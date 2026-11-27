import { env } from 'cloudflare:test';

import { createEvent, deleteEvent, getEvent, updateEvent } from '../src/admin/footprints';
import {
  pendingFootprints,
  publishEvent,
  publishFootprintsNow,
  saveEvent,
  withdrawEvent,
} from '../src/admin/footprints-publish';
import { addSourceWhitelist, deleteSourceWhitelist } from '../src/admin/source-whitelist';
import type { Env } from '../src/lib/env';
import { clearEverything } from './reset-db';

async function clearPublicData(): Promise<void> {
  const listed = await env.PUBLIC_DATA.list();

  await Promise.all(listed.objects.map((object) => env.PUBLIC_DATA.delete(object.key)));
}

// clearEverything empties source_whitelist along with the rest, so the one
// entry the fixtures' source needs is put back here.
beforeEach(async () => {
  await clearEverything();
  await clearPublicData();
  await env.DB.prepare('INSERT INTO source_whitelist (prefix) VALUES (?1)').bind(WHITELISTED_PREFIX).run();
});

const NOW = new Date('2026-09-18T00:00:00Z');
const LATER = new Date('2026-09-19T00:00:00Z');
const OBJECT_KEY = 'footprints/events.json';
const WHITELISTED_PREFIX = 'https://kemono-friends.jp/';
const WHITELISTED_SOURCE = `${WHITELISTED_PREFIX}some-article`;
const NO_TITLE = '題を書いてください。';

/** `env` with an R2 that refuses every write - what a publish meets when the public JSON cannot be written. */
const R2_DOWN: Env = {
  ...env,
  PUBLIC_DATA: {
    get: (key: string) => env.PUBLIC_DATA.get(key),
    list: () => env.PUBLIC_DATA.list(),
    put: () => Promise.reject(new Error('R2 is down')),
  } as unknown as R2Bucket,
};

/**
 * `env` with an R2 whose object always looks written by someone else - what
 * a publish meets when the JSON cannot be brought up to date after its
 * revision is recorded (publishing.ts).
 */
const UNSETTLED: Env = {
  ...env,
  PUBLIC_DATA: {
    get: (key: string) => env.PUBLIC_DATA.get(key),
    list: () => env.PUBLIC_DATA.list(),
    put: (key: string, value: string, options?: R2PutOptions) => env.PUBLIC_DATA.put(key, value, options),
    head: () => Promise.resolve({ version: 'someone else' }),
  } as unknown as R2Bucket,
};

function source(url: string) {
  return { url, title: null };
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    datePrecision: 'day',
    startDate: '2025-01-01',
    startsAt: null,
    endDate: null,
    kind: 'other',
    emphasized: false,
    title: 'デビュー',
    place: null,
    supplement: null,
    videoId: null,
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

/** A draft created and published with the same fields. */
async function createPublishedEvent(overrides: Record<string, unknown> = {}): Promise<number> {
  const eventId = await createValidEvent(overrides);

  expect((await publishEvent(env, eventId, validBody(overrides), NOW)).status).toEqual(200);

  return eventId;
}

async function insertChannel(channelId: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO channel (channel_id, name, fullname, color_key, color_sub, color_light, color_back, activity_start_date)
     VALUES (?1, ?1, ?1, '#000000', '#000000', '#000000', '#000000', '2021-01-01')`,
  )
    .bind(channelId)
    .run();
}

async function revisionRows(): Promise<{ entity_key: string; action: string; body: string | null }[]> {
  const { results } = await env.DB.prepare(
    "SELECT entity_key, action, body FROM revision WHERE entity = 'footprints_event' ORDER BY revision_id",
  ).all<{ entity_key: string; action: string; body: string | null }>();

  return results;
}

async function publicationRows(): Promise<{ last_revision_id: number; object_key: string }[]> {
  const { results } = await env.DB.prepare(
    "SELECT last_revision_id, object_key FROM publication WHERE target = 'footprints' ORDER BY publication_id",
  ).all<{ last_revision_id: number; object_key: string }>();

  return results;
}

interface PublishedJson {
  published_at: string;
  events: { event_id: number; title: string; [key: string]: unknown }[];
}

async function readPublished(): Promise<PublishedJson | null> {
  const object = await env.PUBLIC_DATA.get(OBJECT_KEY);

  if (object === null) return null;

  return JSON.parse(await object.text()) as PublishedJson;
}

/** The event's `version` as GET answers it: what a screen sends back with its writes (#307). */
async function versionOf(eventId: number): Promise<number> {
  return ((await (await getEvent(env, eventId)).json()) as { version: number }).version;
}

async function readRow(eventId: number): Promise<{ status: string; title: string }> {
  return (await (await getEvent(env, eventId)).json()) as { status: string; title: string };
}

/**
 * Publishes `eventId`, then logs a second `publish` whose body has no
 * `lead_channel_ids` - what every event published before migration 0011
 * still has as its latest revision.
 */
async function publishAsBeforeLeads(eventId: number): Promise<void> {
  await publishEvent(env, eventId, validBody(), NOW);

  const rows = await revisionRows();
  const body = JSON.parse(rows.at(-1)!.body!) as Record<string, unknown>;

  delete body.lead_channel_ids;

  await env.DB.prepare(
    `INSERT INTO revision (entity, entity_key, action, body, created_via) VALUES ('footprints_event', ?1, 'publish', ?2, 'admin')`,
  )
    .bind(String(eventId), JSON.stringify(body))
    .run();
}

describe('publishEvent', () => {
  test('answers 404 for an event that does not exist', async () => {
    expect((await publishEvent(env, 1, validBody(), NOW)).status).toEqual(404);
  });

  test('saves the fields sent, publishes, and writes the JSON in one request', async () => {
    const eventId = await createValidEvent({ title: '下書きの題' });

    const response = await publishEvent(env, eventId, validBody({ title: '公開の題' }), NOW);

    expect(response.status).toEqual(200);

    const body = (await response.json()) as {
      event: { status: string; title: string };
      revisionId: number;
      publicationId: number;
    };

    expect(body.event).toMatchObject({ status: 'published', title: '公開の題' });

    const rows = await revisionRows();

    expect(rows).toEqual([{ entity_key: String(eventId), action: 'publish', body: expect.any(String) }]);
    expect(JSON.parse(rows[0]!.body!)).toMatchObject({ title: '公開の題' });

    const published = await readPublished();

    expect(published!.published_at).toEqual('2026-09-18T00:00:00Z');
    expect(published!.events.map((e) => [e.event_id, e.title])).toEqual([[eventId, '公開の題']]);
    expect(await publicationRows()).toEqual([{ last_revision_id: body.revisionId, object_key: OBJECT_KEY }]);
  });

  test('keeps the other events in the JSON', async () => {
    const first = await createPublishedEvent({ title: '一つ目' });
    const second = await createValidEvent({ title: '二つ目' });

    await publishEvent(env, second, validBody({ title: '二つ目' }), LATER);

    expect((await readPublished())!.events.map((e) => e.event_id)).toEqual([first, second]);
  });

  test('orders the JSON by startDate, then by eventId', async () => {
    const later = await createPublishedEvent({ startDate: '2025-03-01' });
    const earlierA = await createPublishedEvent({ startDate: '2025-01-01' });
    const earlierB = await createPublishedEvent({ startDate: '2025-01-01' });

    expect((await readPublished())!.events.map((event) => event.event_id)).toEqual(
      [earlierA, earlierB].sort((a, b) => a - b).concat(later),
    );
  });

  test('refuses an event not ready, saves what was sent as a draft, and leaves the JSON alone', async () => {
    const eventId = await createValidEvent({ title: '下書きの題' });

    const response = await publishEvent(env, eventId, validBody({ title: '', memo: '直したメモ' }), NOW);

    expect(response.status).toEqual(400);
    expect(await response.json()).toEqual({
      errors: [NO_TITLE],
      problems: [{ field: 'title', message: NO_TITLE }],
      saved: true,
    });
    expect(await revisionRows()).toEqual([]);
    expect(await publicationRows()).toEqual([]);
    expect(await readPublished()).toBeNull();
    expect(await readRow(eventId)).toMatchObject({ status: 'draft', title: '' });
  });

  test('refuses fields the schema refuses, and saves nothing', async () => {
    const eventId = await createValidEvent({ title: '下書きの題' });

    const response = await publishEvent(env, eventId, validBody({ title: '新しい題', startDate: '2025-1-1' }), NOW);

    expect(response.status).toEqual(400);
    expect(await readRow(eventId)).toMatchObject({ status: 'draft', title: '下書きの題' });
    expect(await revisionRows()).toEqual([]);
  });

  test('saves the fields as a draft, and says so, when the JSON cannot be written', async () => {
    const eventId = await createValidEvent({ title: '下書きの題' });

    const response = await publishEvent(R2_DOWN, eventId, validBody({ title: '公開の題' }), NOW);

    expect(response.status).toEqual(502);

    const body = (await response.json()) as { saved: boolean; event: { status: string; title: string } };

    expect(body.saved).toEqual(true);
    expect(body.event).toMatchObject({ status: 'draft', title: '公開の題' });
    expect(await readRow(eventId)).toMatchObject({ status: 'draft', title: '公開の題' });
    expect(await revisionRows()).toEqual([]);
    expect(await publicationRows()).toEqual([]);
    expect(await readPublished()).toBeNull();
  });

  // The row is published by then: the screen picks what to press next by
  // the status the answer carries, not by the one the row had.
  test('publishes the row, and says the JSON may be behind, when it cannot be brought up to date', async () => {
    const eventId = await createValidEvent({ title: '下書きの題' });

    const response = await publishEvent(UNSETTLED, eventId, validBody({ title: '公開の題' }), NOW);

    expect(response.status).toEqual(502);

    const body = (await response.json()) as { saved: boolean; event: { status: string; title: string } };

    expect(body.saved).toEqual(true);
    expect(body.event).toMatchObject({ status: 'published', title: '公開の題' });
    expect(await readRow(eventId)).toMatchObject({ status: 'published', title: '公開の題' });
    expect(await revisionRows()).toHaveLength(1);
    expect(await publicationRows()).toEqual([]);
  });

  // Deleted after publishEvent read it and wrote the JSON, before its batch:
  // the member and source rows must not fail the batch on the foreign key.
  test('logs nothing, and takes the event back out of the JSON, when it is deleted before the batch', async () => {
    await insertChannel('UCaaa');

    const eventId = await createValidEvent({ channelIds: ['UCaaa'] });
    const deleting: Env = {
      ...env,
      DB: new Proxy(env.DB, {
        get(target, property) {
          if (property === 'batch') {
            return async (statements: D1PreparedStatement[]) => {
              // As deleteEvent does it: the children first.
              await target.batch(
                ['footprints_event_member', 'footprints_event_source', 'footprints_event'].map((table) =>
                  target.prepare(`DELETE FROM ${table} WHERE event_id = ?1`).bind(eventId),
                ),
              );

              return await target.batch(statements);
            };
          }

          const value = Reflect.get(target, property) as unknown;

          return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value;
        },
      }),
    };

    const response = await publishEvent(deleting, eventId, validBody({ channelIds: ['UCaaa'] }), NOW);

    expect(response.status).toEqual(404);
    expect(await revisionRows()).toEqual([]);
    expect((await readPublished())!.events).toEqual([]);
  });

  // #277's decision 2: short of sources is published, and the timeline says so.
  test('publishes an event with no sources, marked source_pending', async () => {
    await createPublishedEvent({ sources: [] });

    expect((await readPublished())!.events[0]).toMatchObject({ source_pending: true });
  });

  test('marks source_pending false for a source on the whitelist', async () => {
    await createPublishedEvent();

    expect((await readPublished())!.events[0]).toMatchObject({ source_pending: false });
  });

  test('marks source_pending true for one source outside the whitelist', async () => {
    await createPublishedEvent({ sources: [source('https://ameblo.jp/someone/entry-1')] });

    expect((await readPublished())!.events[0]).toMatchObject({ source_pending: true });
  });

  // #175: a source the whitelist does not name is enough when another one, on
  // a different host, backs it.
  test('marks source_pending false for two sources on different hosts, though none is in the whitelist', async () => {
    await createPublishedEvent({
      sources: [source('https://www.youtube.com/watch?v=aaaaaaaaaaa'), source('https://x.com/Partner_KEMOV/status/1')],
    });

    expect((await readPublished())!.events[0]).toMatchObject({ source_pending: false });
  });

  test.each([
    [
      'two videos on youtube.com',
      'https://www.youtube.com/watch?v=aaaaaaaaaaa',
      'https://www.youtube.com/watch?v=bbbbbbbbbbb',
    ],
    ['x.com and twitter.com', 'https://x.com/Partner_KEMOV/status/1', 'https://twitter.com/Partner_KEMOV/status/1'],
    ['youtu.be and www.youtube.com', 'https://youtu.be/aaaaaaaaaaa', 'https://www.youtube.com/watch?v=aaaaaaaaaaa'],
  ])('marks source_pending true for %s, which are one host', async (_name, first, second) => {
    await createPublishedEvent({ sources: [source(first), source(second)] });

    expect((await readPublished())!.events[0]).toMatchObject({ source_pending: true });
  });

  // A `sourcePending` sent by an older screen is not a field any more, and
  // says nothing about what the JSON shows.
  test('ignores a sourcePending sent in the body', async () => {
    await createPublishedEvent({ sourcePending: false, sources: [] });

    expect((await readPublished())!.events[0]).toMatchObject({ source_pending: true });
  });

  // The whitelist is read at each write of the JSON, and every event in it is
  // judged again: one published before an entry was added says
  // source_pending until the next write, and not after.
  test('judges every event in the JSON again by the whitelist as it is at the write', async () => {
    const earlier = await createPublishedEvent({ sources: [source('https://ameblo.jp/someone/entry-1')] });

    await env.DB.prepare('INSERT INTO source_whitelist (prefix) VALUES (?1)').bind('https://ameblo.jp/someone').run();
    await createPublishedEvent({ startDate: '2025-02-01' });

    const published = (await readPublished())!.events;

    expect(published.find((e) => e.event_id === earlier)).toMatchObject({ source_pending: false });
  });

  // A body recorded before #282 carries the mark set by hand. The JSON says
  // what the sources are judged now instead.
  test('replaces a mark set by hand in an earlier body with the judgement', async () => {
    const eventId = await createPublishedEvent();
    const body = JSON.parse((await revisionRows()).at(-1)!.body!) as Record<string, unknown>;

    await env.DB.prepare(
      `INSERT INTO revision (entity, entity_key, action, body, created_via) VALUES ('footprints_event', ?1, 'publish', ?2, 'admin')`,
    )
      .bind(String(eventId), JSON.stringify({ ...body, source_pending: true }))
      .run();

    expect((await publishFootprintsNow(env, LATER)).status).toEqual(200);
    expect((await readPublished())!.events[0]).toMatchObject({ source_pending: false });
  });

  test('records the judgement at the publish in the revision body', async () => {
    await createPublishedEvent({ sources: [] });

    expect(JSON.parse((await revisionRows()).at(-1)!.body!)).toMatchObject({ source_pending: true });
  });

  test('saves a published event short of sources, and the timeline says so', async () => {
    const eventId = await createPublishedEvent();

    expect((await saveEvent(env, eventId, validBody({ sources: [] }), LATER)).status).toEqual(200);
    expect((await readPublished())!.events[0]).toMatchObject({ source_pending: true });
  });

  test('refuses a videoId that is not 11 characters', async () => {
    const eventId = await createValidEvent();

    const response = await publishEvent(env, eventId, validBody({ videoId: 'short' }), NOW);

    expect(response.status).toEqual(400);
    expect(((await response.json()) as { problems: unknown[] }).problems).toEqual([
      { field: 'videoId', message: '動画 ID は 11 文字です。いまは 5 文字です。' },
    ]);
  });

  test('refuses a debut with no lead', async () => {
    await insertChannel('UCa');

    const eventId = await createValidEvent();
    const response = await publishEvent(env, eventId, validBody({ kind: 'debut', channelIds: ['UCa'] }), NOW);

    expect(response.status).toEqual(400);
    expect(((await response.json()) as { problems: unknown[] }).problems).toEqual([
      { field: 'leadChannelIds', message: 'デビューの出来事は、主役を 1 人以上選んでください。' },
    ]);
  });

  test('publishes a debut with its lead, and the guests stay members only', async () => {
    await insertChannel('UCa');
    await insertChannel('UCb');

    const eventId = await createValidEvent();
    const body = validBody({ kind: 'debut', channelIds: ['UCb', 'UCa'], leadChannelIds: ['UCb'] });

    expect((await publishEvent(env, eventId, body, NOW)).status).toEqual(200);
    expect(JSON.parse((await revisionRows())[0]!.body!)).toMatchObject({
      channel_ids: ['UCa', 'UCb'],
      lead_channel_ids: ['UCb'],
    });
  });

  test('collects every failing condition in one answer', async () => {
    const eventId = await createValidEvent();

    const response = await publishEvent(env, eventId, validBody({ title: '', videoId: 'short', sources: [] }), NOW);
    const body = (await response.json()) as { errors: string[] };

    expect(body.errors).toEqual([NO_TITLE, '動画 ID は 11 文字です。いまは 5 文字です。']);
  });

  test('emphasized and source_pending are booleans in the published JSON', async () => {
    await createPublishedEvent({ emphasized: true });

    expect((await readPublished())!.events[0]).toMatchObject({ emphasized: true, source_pending: false });
  });

  test('writes lead_channel_ids for an event published before leads, as none', async () => {
    const before = await createValidEvent();

    await publishAsBeforeLeads(before);

    // Any later publish builds the JSON from every event's latest revision.
    await createPublishedEvent();

    const published = await readPublished();
    const old = published!.events.find((e) => e.event_id === before)!;

    expect(Object.keys(old)).toContain('lead_channel_ids');
    expect(old).toMatchObject({ channel_ids: [], lead_channel_ids: [] });
  });
});

describe('saveEvent', () => {
  test('answers 404 for an event that does not exist', async () => {
    expect((await saveEvent(env, 1, validBody(), NOW)).status).toEqual(404);
  });

  test('saves a draft as a draft, without a revision or the JSON', async () => {
    const eventId = await createValidEvent();

    const response = await saveEvent(env, eventId, validBody({ title: '' }), NOW);

    expect(response.status).toEqual(200);
    expect(await readRow(eventId)).toMatchObject({ status: 'draft', title: '' });
    expect(await revisionRows()).toEqual([]);
    expect(await readPublished()).toBeNull();
  });

  test('puts a published event’s save on the public timeline at once', async () => {
    const eventId = await createPublishedEvent({ title: '前の題' });

    const response = await saveEvent(env, eventId, validBody({ title: '新しい題' }), LATER);

    expect(response.status).toEqual(200);
    expect(await readRow(eventId)).toMatchObject({ status: 'published', title: '新しい題' });

    const rows = await revisionRows();

    expect(rows.map((row) => row.action)).toEqual(['publish', 'publish']);
    expect(JSON.parse(rows[1]!.body!)).toMatchObject({ title: '新しい題' });

    const published = await readPublished();

    expect(published!.published_at).toEqual('2026-09-19T00:00:00Z');
    expect(published!.events.map((e) => e.title)).toEqual(['新しい題']);
    expect(await publicationRows()).toHaveLength(2);
  });

  test('refuses a published event’s save that would not publish, and changes nothing', async () => {
    const eventId = await createPublishedEvent({ title: '前の題' });
    const before = await readPublished();

    const response = await saveEvent(env, eventId, validBody({ title: '', memo: '直したメモ' }), LATER);

    expect(response.status).toEqual(400);
    expect(await response.json()).toEqual({
      errors: [NO_TITLE],
      problems: [{ field: 'title', message: NO_TITLE }],
      saved: false,
    });
    expect(await readRow(eventId)).toMatchObject({ status: 'published', title: '前の題' });
    expect(await revisionRows()).toHaveLength(1);
    expect(await readPublished()).toEqual(before);
  });

  test('saves a published event’s fields, and says so, when the JSON cannot be written', async () => {
    const eventId = await createPublishedEvent({ title: '前の題' });
    const before = await readPublished();

    const response = await saveEvent(R2_DOWN, eventId, validBody({ title: '新しい題' }), LATER);

    expect(response.status).toEqual(502);
    expect(((await response.json()) as { saved: boolean }).saved).toEqual(true);
    expect(await readRow(eventId)).toMatchObject({ status: 'published', title: '新しい題' });
    expect(await revisionRows()).toHaveLength(1);
    expect(await publicationRows()).toHaveLength(1);
    expect(await readPublished()).toEqual(before);
  });
});

describe('withdrawEvent', () => {
  test('answers 404 for an event that does not exist', async () => {
    expect((await withdrawEvent(env, 1, validBody(), NOW)).status).toEqual(404);
  });

  test('answers 409 for an event that is not published', async () => {
    const eventId = await createValidEvent();

    expect((await withdrawEvent(env, eventId, validBody(), NOW)).status).toEqual(409);
    expect(await revisionRows()).toEqual([]);
  });

  test('takes the event off the JSON, saves the fields as a draft and logs a withdraw revision', async () => {
    const kept = await createPublishedEvent({ title: '残る' });
    const eventId = await createPublishedEvent({ title: '外す' });

    // A title that would not publish: a draft does not have to.
    const response = await withdrawEvent(env, eventId, validBody({ title: '' }), LATER);

    expect(response.status).toEqual(200);
    expect(((await response.json()) as { event: { status: string; title: string } }).event).toMatchObject({
      status: 'draft',
      title: '',
    });

    const rows = await revisionRows();

    expect(rows.at(-1)).toEqual({ entity_key: String(eventId), action: 'withdraw', body: null });
    expect((await readPublished())!.events.map((e) => e.event_id)).toEqual([kept]);
    expect(await publicationRows()).toHaveLength(3);
  });

  test('changes nothing when the JSON cannot be written', async () => {
    const eventId = await createPublishedEvent();
    const before = await readPublished();

    const response = await withdrawEvent(R2_DOWN, eventId, validBody({ title: '新しい題' }), LATER);

    expect(response.status).toEqual(502);
    expect(await readRow(eventId)).toMatchObject({ status: 'published', title: 'デビュー' });
    expect(await revisionRows()).toHaveLength(1);
    expect(await readPublished()).toEqual(before);
  });

  test('makes the event a draft, and says the JSON may be behind, when it cannot be brought up to date', async () => {
    const eventId = await createPublishedEvent();

    const response = await withdrawEvent(UNSETTLED, eventId, validBody({ title: '新しい題' }), LATER);

    expect(response.status).toEqual(502);

    const body = (await response.json()) as { saved: boolean; event: { status: string } };

    expect(body.saved).toEqual(true);
    expect(body.event.status).toEqual('draft');
    expect(await readRow(eventId)).toMatchObject({ status: 'draft', title: '新しい題' });
    expect((await revisionRows()).at(-1)).toMatchObject({ action: 'withdraw' });
    expect(await publicationRows()).toHaveLength(1);
  });
});

describe('pendingFootprints', () => {
  test('is empty once an event is published', async () => {
    await createPublishedEvent();

    const body = (await pendingFootprints(env).then((r) => r.json())) as { pending: unknown[]; changed: unknown[] };

    expect(body).toEqual({ pending: [], changed: [], behind: false, outdated: false });
  });

  test('lists an event whose latest revision the JSON was not written from', async () => {
    const eventId = await createPublishedEvent();

    await publishAsBeforeLeads(eventId);

    const body = (await pendingFootprints(env).then((r) => r.json())) as { pending: unknown[] };

    expect(body.pending).toEqual([{ eventId, latestAction: 'publish' }]);
  });

  test('does not report a memo-only edit as changed', async () => {
    const eventId = await createPublishedEvent();

    await updateEvent(env, eventId, validBody({ memo: 'a different memo' }));

    const body = (await pendingFootprints(env).then((r) => r.json())) as { changed: unknown[] };

    expect(body.changed).toEqual([]);
  });

  test('does not report an event published before leads as changed', async () => {
    const eventId = await createValidEvent();

    await publishAsBeforeLeads(eventId);

    const body = (await pendingFootprints(env).then((r) => r.json())) as { changed: unknown[] };

    expect(body.changed).toEqual([]);
  });

  // What migration 0011 leaves each debut it gave a lead to: the row has one
  // and its last publish does not, until it is published again.
  test('reports a debut published before leads as changed once it has one', async () => {
    await insertChannel('UCa');

    const eventId = await createValidEvent();

    await publishEvent(env, eventId, validBody({ kind: 'debut', channelIds: ['UCa'], leadChannelIds: ['UCa'] }), NOW);

    const rows = await revisionRows();
    const body = JSON.parse(rows.at(-1)!.body!) as Record<string, unknown>;

    delete body.lead_channel_ids;

    await env.DB.prepare(
      `INSERT INTO revision (entity, entity_key, action, body, created_via) VALUES ('footprints_event', ?1, 'publish', ?2, 'admin')`,
    )
      .bind(String(eventId), JSON.stringify(body))
      .run();

    const pending = (await pendingFootprints(env).then((r) => r.json())) as { changed: { eventId: number }[] };

    expect(pending.changed).toEqual([{ eventId, title: 'デビュー' }]);
  });

  test('does not report a change to the whitelist alone as changed', async () => {
    await createPublishedEvent({ sources: [source('https://ameblo.jp/someone/entry-1')] });

    await env.DB.prepare('INSERT INTO source_whitelist (prefix) VALUES (?1)').bind('https://ameblo.jp/someone').run();

    const body = (await pendingFootprints(env).then((r) => r.json())) as { changed: unknown[] };

    expect(body.changed).toEqual([]);
  });

  // The one way a published row can differ from what it was published as
  // since #281: its save went through, the JSON did not.
  test('reports a published event whose save could not reach the JSON as changed', async () => {
    const eventId = await createPublishedEvent();

    await saveEvent(R2_DOWN, eventId, validBody({ title: 'a new title' }), LATER);

    const body = (await pendingFootprints(env).then((r) => r.json())) as { changed: { eventId: number }[] };

    expect(body.changed).toEqual([{ eventId, title: 'a new title' }]);
  });
});

describe('publishFootprintsNow', () => {
  test('writes nothing and answers published: false when nothing is pending', async () => {
    const response = await publishFootprintsNow(env, NOW);

    expect(await response.json()).toEqual({ published: false });
    expect(await readPublished()).toBeNull();
  });

  test('answers published: false once every publish has written the JSON', async () => {
    await createPublishedEvent();

    expect(await (await publishFootprintsNow(env, LATER)).json()).toEqual({ published: false });
  });

  // What the two-step publishing before #281 can leave behind: a revision
  // logged, and the JSON not yet written from it.
  test('writes a revision left waiting, and adds a publication row', async () => {
    const eventId = await createPublishedEvent({ title: '前の題' });

    await updateEvent(env, eventId, validBody({ title: '待っていた題' }));
    await env.DB.prepare(
      `INSERT INTO revision (entity, entity_key, action, body, created_via)
       VALUES ('footprints_event', ?1, 'publish', ?2, 'admin')`,
    )
      .bind(String(eventId), JSON.stringify({ event_id: eventId, start_date: '2025-01-01', title: '待っていた題' }))
      .run();

    const response = await publishFootprintsNow(env, LATER);
    const body = (await response.json()) as { published: boolean; eventCount: number };

    expect(body).toMatchObject({ published: true, eventCount: 1 });
    expect((await readPublished())!.events.map((e) => e.title)).toEqual(['待っていた題']);
    expect(await publicationRows()).toHaveLength(2);
  });

  // A withdraw recorded with its publication, and then a stale write that
  // nobody could check (a 「いま公開する」 whose rebuild failed): nothing waits,
  // but the JSON has the withdrawn event again.
  test('builds the JSON again while it may be behind, with nothing waiting, and then says it is not', async () => {
    const kept = await createPublishedEvent({ title: '残る' });
    const eventId = await createPublishedEvent({ title: '外す' });

    expect((await withdrawEvent(env, eventId, validBody(), LATER)).status).toEqual(200);
    await env.DB.prepare("INSERT INTO publication_write (target, finished) VALUES ('footprints', 1)").run();
    await env.PUBLIC_DATA.put(OBJECT_KEY, JSON.stringify({ published_at: 'stale', events: [{ event_id: eventId }] }));

    const pendingBefore = (await (await pendingFootprints(env)).json()) as { pending: unknown[]; behind: boolean };

    expect(pendingBefore).toMatchObject({ pending: [], behind: true });

    const response = await publishFootprintsNow(env, LATER);

    expect(await response.json()).toMatchObject({ published: true, eventCount: 1 });
    expect((await readPublished())!.events.map((e) => e.event_id)).toEqual([kept]);
    expect(((await (await pendingFootprints(env)).json()) as { behind: boolean }).behind).toBe(false);
  });
});

// The JSON judges sources by the whitelist it was written with, so a change
// to the whitelist writes it again (#282).
describe('a whitelist change', () => {
  const OTHER_PREFIX = 'https://partner.example/';
  const OTHER_SOURCE = `${OTHER_PREFIX}news/1`;

  async function pendingMarks(): Promise<unknown[]> {
    return (await readPublished())!.events.map((e) => e.source_pending);
  }

  test('writes the JSON again when it changes which events are short of sources', async () => {
    await createPublishedEvent({ sources: [source(OTHER_SOURCE)] });

    expect(await pendingMarks()).toEqual([true]);

    const added = await addSourceWhitelist(env, { prefix: OTHER_PREFIX }, LATER);

    expect(await added.json()).toMatchObject({ timelineCurrent: true });
    expect(await pendingMarks()).toEqual([false]);

    const removed = await deleteSourceWhitelist(env, OTHER_PREFIX, LATER);

    expect(await removed.json()).toEqual({ timelineCurrent: true });
    expect(await pendingMarks()).toEqual([true]);
    expect(await publicationRows()).toHaveLength(3);
  });

  test('writes nothing when no event is judged differently', async () => {
    await createPublishedEvent();

    await addSourceWhitelist(env, { prefix: OTHER_PREFIX }, LATER);

    expect(await publicationRows()).toHaveLength(1);
  });

  test('keeps the entry, and says so, when the JSON cannot be written', async () => {
    await createPublishedEvent({ sources: [source(OTHER_SOURCE)] });

    const added = await addSourceWhitelist(R2_DOWN, { prefix: OTHER_PREFIX }, LATER);

    expect(added.status).toEqual(201);
    expect(await added.json()).toMatchObject({ timelineCurrent: false });
    expect(
      await env.DB.prepare('SELECT prefix FROM source_whitelist WHERE prefix = ?1').bind(OTHER_PREFIX).first(),
    ).toEqual({ prefix: OTHER_PREFIX });
    expect(await pendingMarks()).toEqual([true]);
  });

  test('answers the rest of the pending list when R2 cannot be read', async () => {
    await createPublishedEvent();

    const unreadable: Env = {
      ...env,
      PUBLIC_DATA: { get: () => Promise.reject(new Error('R2 is down')) } as unknown as R2Bucket,
    };
    const response = await pendingFootprints(unreadable);

    expect(response.status).toEqual(200);
    expect(await response.json()).toEqual({ pending: [], changed: [], behind: false, outdated: false });
  });

  // What a deploy of #282 meets: a JSON written while the mark was set by
  // hand, with nothing waiting. 「いま公開する」 has something to do, and does it.
  test('leaves an outdated JSON for 「いま公開する」 to write again', async () => {
    await createPublishedEvent();

    const stored = (await readPublished())!;

    await env.PUBLIC_DATA.put(
      OBJECT_KEY,
      JSON.stringify({ ...stored, events: stored.events.map((e) => ({ ...e, source_pending: true })) }),
    );

    expect(await (await pendingFootprints(env)).json()).toMatchObject({ pending: [], behind: false, outdated: true });
    expect(await (await publishFootprintsNow(env, LATER)).json()).toMatchObject({ published: true, eventCount: 1 });
    expect(await pendingMarks()).toEqual([false]);
    expect(await (await pendingFootprints(env)).json()).toMatchObject({ outdated: false });
  });
});

// #299: what #293 put right for 登録者数の節目, for あしあと - requests that
// land between another's read and its write.
/** `env` with an R2 that takes the first write and refuses every one after it: a rebuild that cannot be written. */
function firstPutOnly(): Env {
  let puts = 0;

  return {
    ...env,
    PUBLIC_DATA: {
      get: (key: string) => env.PUBLIC_DATA.get(key),
      head: (key: string) => env.PUBLIC_DATA.head(key),
      list: () => env.PUBLIC_DATA.list(),
      put: (key: string, value: string, options?: R2PutOptions) =>
        (puts += 1) === 1 ? env.PUBLIC_DATA.put(key, value, options) : Promise.reject(new Error('R2 is down')),
    } as unknown as R2Bucket,
  };
}

/**
 * `base` whose next `DB.batch` first runs `before` - another tab's request
 * landing between this request's read and its write.
 */
function beforeNextBatch(base: Env, before: () => Promise<unknown>): Env {
  let done = false;

  return {
    ...base,
    DB: new Proxy(base.DB, {
      get(target, property) {
        if (property === 'batch') {
          return async (statements: D1PreparedStatement[]) => {
            if (!done) {
              done = true;
              await before();
            }

            return await target.batch(statements);
          };
        }

        const value = Reflect.get(target, property) as unknown;

        return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value;
      },
    }),
  };
}

async function childCounts(eventId: number): Promise<{ members: number; sources: number }> {
  const members = await env.DB.prepare('SELECT count(*) AS n FROM footprints_event_member WHERE event_id = ?1')
    .bind(eventId)
    .first<{ n: number }>();
  const sources = await env.DB.prepare('SELECT count(*) AS n FROM footprints_event_source WHERE event_id = ?1')
    .bind(eventId)
    .first<{ n: number }>();

  return { members: members!.n, sources: sources!.n };
}

async function isBehindNow(): Promise<boolean> {
  return ((await (await pendingFootprints(env)).json()) as { behind: boolean }).behind;
}

async function readMemo(eventId: number): Promise<string | null> {
  return ((await (await getEvent(env, eventId)).json()) as { memo: string | null }).memo;
}

describe('a published save that finds the event withdrawn meanwhile', () => {
  test('answers 409, and neither saves the row nor puts it back on the public timeline', async () => {
    const eventId = await createPublishedEvent();
    const withdrawnFirst = beforeNextBatch(env, () => withdrawEvent(env, eventId, validBody(), NOW));

    const response = await saveEvent(withdrawnFirst, eventId, validBody({ title: '後から保存' }), NOW);

    expect(response.status).toEqual(409);
    expect(await readRow(eventId)).toMatchObject({ status: 'draft', title: 'デビュー' });
    expect((await readPublished())!.events).toEqual([]);
    expect((await revisionRows()).map((row) => row.action)).toEqual(['publish', 'withdraw']);
  });

  // The JSON this save wrote before its batch still has the event, and the
  // rebuild that would take it out fails: 409 would hide that.
  test('answers 502 with nothing saved, and leaves the JSON behind, when it cannot build the JSON again', async () => {
    const eventId = await createPublishedEvent();
    const withdrawnFirst = beforeNextBatch(firstPutOnly(), () => withdrawEvent(env, eventId, validBody(), NOW));

    const response = await saveEvent(withdrawnFirst, eventId, validBody({ title: '後から保存' }), NOW);

    expect(response.status).toEqual(502);
    expect(((await response.json()) as { saved: boolean }).saved).toBe(false);
    expect(await readRow(eventId)).toMatchObject({ status: 'draft', title: 'デビュー' });
    expect(await isBehindNow()).toBe(true);
  });
});

describe('a draft save that finds the event published meanwhile', () => {
  /** `env` whose next `batch` first publishes `eventId` elsewhere, as another tab would. */
  function publishedFirst(eventId: number): Env {
    return beforeNextBatch(env, () => publishEvent(env, eventId, validBody({ title: '先に公開' }), NOW));
  }

  test('of a plain save answers 409 and writes nothing over it', async () => {
    const eventId = await createValidEvent();

    const response = await saveEvent(publishedFirst(eventId), eventId, validBody({ title: '後から保存' }), NOW);

    expect(response.status).toEqual(409);
    expect(await readRow(eventId)).toMatchObject({ status: 'published', title: '先に公開' });
    expect(await childCounts(eventId)).toEqual({ members: 0, sources: 1 });
  });

  test('of a refused publish answers 409 and writes nothing over it', async () => {
    const eventId = await createValidEvent();

    const response = await publishEvent(publishedFirst(eventId), eventId, validBody({ title: '', sources: [] }), NOW);

    expect(response.status).toEqual(409);
    expect(await readRow(eventId)).toMatchObject({ status: 'published', title: '先に公開' });
    expect(await childCounts(eventId)).toEqual({ members: 0, sources: 1 });
  });
});

describe('a draft publish that finds the event published meanwhile', () => {
  test('answers 409, and leaves the other publish on the row and the public timeline', async () => {
    const eventId = await createValidEvent();
    const publishedFirst = beforeNextBatch(env, () =>
      publishEvent(env, eventId, validBody({ title: '先に公開' }), NOW),
    );

    const response = await publishEvent(publishedFirst, eventId, validBody({ title: '後から公開' }), NOW);

    expect(response.status).toEqual(409);
    expect(await readRow(eventId)).toMatchObject({ status: 'published', title: '先に公開' });
    expect((await readPublished())!.events).toEqual([expect.objectContaining({ title: '先に公開' })]);
    expect((await revisionRows()).map((row) => row.action)).toEqual(['publish']);
  });
});

describe('a withdraw that finds the event changed meanwhile', () => {
  test('answers 409, writes nothing over the draft, and records no second withdrawal', async () => {
    const eventId = await createPublishedEvent();
    const withdrawnFirst = beforeNextBatch(env, () =>
      withdrawEvent(env, eventId, validBody({ memo: '先に戻した' }), NOW),
    );

    const response = await withdrawEvent(withdrawnFirst, eventId, validBody({ memo: '後から戻した' }), NOW);

    expect(response.status).toEqual(409);
    expect(await readRow(eventId)).toMatchObject({ status: 'draft' });
    expect(await readMemo(eventId)).toEqual('先に戻した');
    expect((await revisionRows()).map((row) => row.action)).toEqual(['publish', 'withdraw']);
  });

  test('answers 409 for an event saved again since it was read', async () => {
    const eventId = await createPublishedEvent();
    const savedFirst = beforeNextBatch(env, () => saveEvent(env, eventId, validBody({ title: '先に保存' }), NOW));

    expect((await withdrawEvent(savedFirst, eventId, validBody(), NOW)).status).toEqual(409);
    expect(await readRow(eventId)).toMatchObject({ status: 'published', title: '先に保存' });
    expect((await readPublished())!.events).toEqual([expect.objectContaining({ title: '先に保存' })]);
  });

  test('answers 502 with nothing saved when it cannot build the JSON again either', async () => {
    const eventId = await createPublishedEvent();
    const savedFirst = beforeNextBatch(firstPutOnly(), () =>
      saveEvent(env, eventId, validBody({ title: '先に保存' }), NOW),
    );

    const response = await withdrawEvent(savedFirst, eventId, validBody(), NOW);

    expect(response.status).toEqual(502);
    expect(((await response.json()) as { saved: boolean }).saved).toBe(false);
    expect(await readRow(eventId)).toMatchObject({ status: 'published', title: '先に保存' });
    expect(await isBehindNow()).toBe(true);
  });
});

describe('a save whose JSON could not be written', () => {
  test('writes nothing over a publish recorded since it read the row, and answers 409', async () => {
    const eventId = await createPublishedEvent();
    const savedFirst = beforeNextBatch(R2_DOWN, () => saveEvent(env, eventId, validBody({ title: '先に保存' }), NOW));

    const response = await saveEvent(savedFirst, eventId, validBody({ title: '後から保存' }), NOW);

    expect(response.status).toEqual(409);
    expect(await readRow(eventId)).toMatchObject({ status: 'published', title: '先に保存' });
  });

  test('still saves the fields when nothing was recorded since', async () => {
    const eventId = await createPublishedEvent();

    const response = await saveEvent(R2_DOWN, eventId, validBody({ title: '後から保存' }), NOW);

    expect(response.status).toEqual(502);
    expect(await readRow(eventId)).toMatchObject({ status: 'published', title: '後から保存' });
  });
});

describe('a delete that finds the event published meanwhile', () => {
  test('answers 409 and leaves the row, its members and its sources', async () => {
    await insertChannel('UCaaa');

    const fields = validBody({ channelIds: ['UCaaa'] });
    const eventId = await createValidEvent(fields);
    const publishedFirst = beforeNextBatch(env, () => publishEvent(env, eventId, fields, NOW));

    expect((await deleteEvent(publishedFirst, eventId)).status).toEqual(409);
    expect(await readRow(eventId)).toMatchObject({ status: 'published' });
    expect((await readPublished())!.events).toEqual([expect.objectContaining({ event_id: eventId })]);
    expect(await childCounts(eventId)).toEqual({ members: 1, sources: 1 });
  });
});

describe('a 409 for an event another screen changed', () => {
  test('is marked changedElsewhere, so the screen says it in its own words', async () => {
    const eventId = await createValidEvent();
    const publishedFirst = beforeNextBatch(env, () => publishEvent(env, eventId, validBody(), NOW));

    const response = await saveEvent(publishedFirst, eventId, validBody({ title: '後から保存' }), NOW);

    expect(response.status).toEqual(409);
    expect(await response.json()).toMatchObject({ changedElsewhere: true });
  });

  test('of a delete is marked too', async () => {
    const eventId = await createValidEvent();
    const publishedFirst = beforeNextBatch(env, () => publishEvent(env, eventId, validBody(), NOW));

    const response = await deleteEvent(publishedFirst, eventId);

    expect(response.status).toEqual(409);
    expect(await response.json()).toMatchObject({ changedElsewhere: true });
  });
});

describe('two screens that read the same published event (#307)', () => {
  test('the later save, sent with the version it read, answers 409 and writes nothing over the first', async () => {
    const eventId = await createPublishedEvent({ title: '前の題' });
    const read = await versionOf(eventId);

    expect((await saveEvent(env, eventId, validBody({ title: '先の保存', version: read }), NOW)).status).toEqual(200);

    const response = await saveEvent(env, eventId, validBody({ title: '後の保存', version: read }), LATER);

    expect(response.status).toEqual(409);
    expect(((await response.json()) as { changedElsewhere: boolean }).changedElsewhere).toBe(true);
    expect(await readRow(eventId)).toMatchObject({ status: 'published', title: '先の保存' });
    expect((await readPublished())!.events.map((e) => e.title)).toEqual(['先の保存']);
    expect((await revisionRows()).map((row) => row.action)).toEqual(['publish', 'publish']);
  });

  test('a save sent with the version read after the first goes through', async () => {
    const eventId = await createPublishedEvent({ title: '前の題' });

    await saveEvent(env, eventId, validBody({ title: '先の保存', version: await versionOf(eventId) }), NOW);

    const response = await saveEvent(
      env,
      eventId,
      validBody({ title: '後の保存', version: await versionOf(eventId) }),
      LATER,
    );

    expect(response.status).toEqual(200);
    expect(await readRow(eventId)).toMatchObject({ title: '後の保存' });
  });

  test('a withdraw sent with the version from before another save answers 409 and leaves the event published', async () => {
    const eventId = await createPublishedEvent({ title: '前の題' });
    const read = await versionOf(eventId);

    await saveEvent(env, eventId, validBody({ title: '先の保存', version: read }), NOW);

    const response = await withdrawEvent(env, eventId, validBody({ title: '前の題', version: read }), LATER);

    expect(response.status).toEqual(409);
    expect(await readRow(eventId)).toMatchObject({ status: 'published', title: '先の保存' });
    expect((await readPublished())!.events.map((e) => e.title)).toEqual(['先の保存']);
  });

  test('refuses a version that is not a whole number, and saves nothing', async () => {
    const eventId = await createPublishedEvent({ title: '前の題' });

    const response = await saveEvent(env, eventId, validBody({ title: '新しい題', version: '3' }), LATER);

    expect(response.status).toEqual(400);
    expect(await readRow(eventId)).toMatchObject({ title: '前の題' });
  });

  // Both requests read the row before either wrote it: the version each
  // read is the same, and only the batch can tell them apart.
  test('the later save, whose batch runs after the first, answers 409 and leaves the first on the public timeline', async () => {
    const eventId = await createPublishedEvent({ title: '前の題' });
    const read = await versionOf(eventId);
    const savedFirst = beforeNextBatch(env, () =>
      saveEvent(env, eventId, validBody({ title: '先の保存', version: read }), NOW),
    );

    const response = await saveEvent(savedFirst, eventId, validBody({ title: '後の保存', version: read }), LATER);

    expect(response.status).toEqual(409);
    expect(await readRow(eventId)).toMatchObject({ status: 'published', title: '先の保存' });
    expect((await readPublished())!.events.map((e) => e.title)).toEqual(['先の保存']);
    expect((await revisionRows()).map((row) => row.action)).toEqual(['publish', 'publish']);
  });

  // The first save could not write the JSON, so it saved the fields alone
  // and logged no revision: the revision cannot tell the two saves apart.
  test('the later save, after the first saved its fields alone, answers 409 and logs nothing', async () => {
    const eventId = await createPublishedEvent({ title: '前の題' });
    const read = await versionOf(eventId);
    const savedUnlogged = beforeNextBatch(env, () =>
      saveEvent(R2_DOWN, eventId, validBody({ title: '先の保存', version: read }), NOW),
    );

    const response = await saveEvent(savedUnlogged, eventId, validBody({ title: '後の保存', version: read }), LATER);

    expect(response.status).toEqual(409);
    expect(await readRow(eventId)).toMatchObject({ status: 'published', title: '先の保存' });
    expect(await versionOf(eventId)).toEqual(read + 2);
    expect((await readPublished())!.events.map((e) => e.title)).toEqual(['前の題']);
    expect((await revisionRows()).map((row) => row.action)).toEqual(['publish']);
  });
});

describe('a save that sends no version (#307)', () => {
  test('is held to the version it read, so one saved meanwhile with its fields alone is not written over', async () => {
    const eventId = await createPublishedEvent({ title: '前の題' });
    const savedUnlogged = beforeNextBatch(env, () =>
      saveEvent(R2_DOWN, eventId, validBody({ title: '先の保存' }), NOW),
    );

    const response = await saveEvent(savedUnlogged, eventId, validBody({ title: '後の保存' }), LATER);

    expect(response.status).toEqual(409);
    expect(await readRow(eventId)).toMatchObject({ status: 'published', title: '先の保存' });
    expect((await readPublished())!.events.map((e) => e.title)).toEqual(['前の題']);
    expect((await revisionRows()).map((row) => row.action)).toEqual(['publish']);
  });

  test('of a draft is held to it too', async () => {
    const eventId = await createValidEvent({ title: '前の題' });
    const savedFirst = beforeNextBatch(env, () => saveEvent(env, eventId, validBody({ title: '先の保存' }), NOW));

    const response = await saveEvent(savedFirst, eventId, validBody({ title: '後の保存', sources: [] }), LATER);

    expect(response.status).toEqual(409);
    expect(await readRow(eventId)).toMatchObject({ title: '先の保存' });
    expect(await childCounts(eventId)).toEqual({ members: 0, sources: 1 });
  });
});

describe('two screens that read the same draft event (#307)', () => {
  test('starts at version 0, and each save adds 1', async () => {
    const eventId = await createValidEvent();

    expect(await versionOf(eventId)).toEqual(0);

    await saveEvent(env, eventId, validBody({ title: '一度目', version: 0 }), NOW);

    expect(await versionOf(eventId)).toEqual(1);

    await publishEvent(env, eventId, validBody({ title: '二度目', version: 1 }), NOW);

    expect(await versionOf(eventId)).toEqual(2);
  });

  test('the later save, sent with the version it read, answers 409 and writes nothing over the first', async () => {
    const eventId = await createValidEvent({ title: '前の題' });
    const read = await versionOf(eventId);

    expect((await saveEvent(env, eventId, validBody({ title: '先の保存', version: read }), NOW)).status).toEqual(200);

    const response = await saveEvent(env, eventId, validBody({ title: '後の保存', sources: [], version: read }), LATER);

    expect(response.status).toEqual(409);
    expect(((await response.json()) as { changedElsewhere: boolean }).changedElsewhere).toBe(true);
    expect(await readRow(eventId)).toMatchObject({ status: 'draft', title: '先の保存' });
    expect(await childCounts(eventId)).toEqual({ members: 0, sources: 1 });
  });

  test('the later save, whose batch runs after the first, answers 409 and writes nothing over it', async () => {
    const eventId = await createValidEvent({ title: '前の題' });
    const read = await versionOf(eventId);
    const savedFirst = beforeNextBatch(env, () =>
      saveEvent(env, eventId, validBody({ title: '先の保存', version: read }), NOW),
    );

    const response = await saveEvent(
      savedFirst,
      eventId,
      validBody({ title: '後の保存', sources: [], version: read }),
      LATER,
    );

    expect(response.status).toEqual(409);
    expect(await readRow(eventId)).toMatchObject({ status: 'draft', title: '先の保存' });
    expect(await childCounts(eventId)).toEqual({ members: 0, sources: 1 });
  });

  test('a publish sent with the version from before another save answers 409 and publishes nothing', async () => {
    const eventId = await createValidEvent({ title: '前の題' });
    const read = await versionOf(eventId);

    await saveEvent(env, eventId, validBody({ title: '先の保存', version: read }), NOW);

    const response = await publishEvent(env, eventId, validBody({ title: '後の公開', version: read }), LATER);

    expect(response.status).toEqual(409);
    expect(await readRow(eventId)).toMatchObject({ status: 'draft', title: '先の保存' });
    expect(await readPublished()).toBeNull();
    expect(await revisionRows()).toEqual([]);
  });

  test('refuses a null version, and saves nothing', async () => {
    const eventId = await createValidEvent({ title: '前の題' });

    const response = await saveEvent(env, eventId, validBody({ title: '新しい題', version: null }), NOW);

    expect(response.status).toEqual(400);
    expect(await readRow(eventId)).toMatchObject({ title: '前の題' });
  });

  test('refuses a malformed version with 400 before it looks at whether the event is published', async () => {
    const eventId = await createValidEvent();

    expect((await withdrawEvent(env, eventId, validBody({ version: -1 }), NOW)).status).toEqual(400);
  });
});
