import { env } from 'cloudflare:test';

import { createEvent } from '../src/admin/footprints';
import { publishEvent, publishFootprintsNow, saveEvent, withdrawEvent } from '../src/admin/footprints-publish';
import { addSourceWhitelist } from '../src/admin/source-whitelist';
import { createMilestone, deleteMilestone, getMilestone } from '../src/admin/subscriber-milestones';
import {
  checkSources,
  pendingSubscriberMilestones,
  publishMilestone,
  publishSubscriberMilestonesNow,
  saveMilestone,
  SOURCES_PROBLEM,
  SUBSCRIBER_MILESTONES_SHAPE_VERSION,
  withdrawMilestone,
} from '../src/admin/subscriber-milestones-publish';
import type { Env } from '../src/lib/env';
import { clearEverything } from './reset-db';

const NOW = new Date('2026-09-25T00:00:00Z');
const OBJECT_KEY = 'subscribers/milestones.json';
const WHITELISTED_PREFIX = 'https://x.com/KEMOVP_staff';

/** `env` with an R2 that refuses every write - what a publish meets when the public JSON cannot be written. */
const R2_DOWN: Env = {
  ...env,
  PUBLIC_DATA: {
    get: (key: string) => env.PUBLIC_DATA.get(key),
    list: () => env.PUBLIC_DATA.list(),
    put: () => Promise.reject(new Error('R2 is down')),
  } as unknown as R2Bucket,
};

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

/** `env` with an R2 whose object always looks written by someone else, so the JSON is never found up to date. */
const UNSETTLED: Env = {
  ...env,
  PUBLIC_DATA: {
    get: (key: string) => env.PUBLIC_DATA.get(key),
    list: () => env.PUBLIC_DATA.list(),
    put: (key: string, value: string, options?: R2PutOptions) => env.PUBLIC_DATA.put(key, value, options),
    head: () => Promise.resolve({ version: 'someone else' }),
  } as unknown as R2Bucket,
};

async function clearPublicData(): Promise<void> {
  const listed = await env.PUBLIC_DATA.list();

  await Promise.all(listed.objects.map((object) => env.PUBLIC_DATA.delete(object.key)));
}

beforeEach(async () => {
  await clearEverything();
  await clearPublicData();
  await env.DB.prepare('INSERT INTO source_whitelist (prefix) VALUES (?1)').bind(WHITELISTED_PREFIX).run();
  await insertChannel('UCaaa');
});

async function insertChannel(channelId: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO channel (channel_id, name, fullname, color_key, color_sub, color_light, color_back, activity_start_date)
     VALUES (?1, ?1, ?1, '#000000', '#000000', '#000000', '#000000', '2021-01-01')`,
  )
    .bind(channelId)
    .run();
}

async function insertVideo(videoId: string, channelId: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO video (video_id, channel_id, title, published_at, availability, live_broadcast_content, fetched_at)
     VALUES (?1, ?2, 't', '2024-01-29T00:00:00Z', 'public', 'none', '2024-01-29T00:00:00Z')`,
  )
    .bind(videoId, channelId)
    .run();
}

function body(overrides: Record<string, unknown> = {}) {
  return {
    channelId: 'UCaaa',
    datePrecision: 'day',
    reachedDate: '2024-01-29',
    subscriberCount: 20000,
    announcedBy: 'member',
    eventId: null,
    memo: 'メモは公開しない',
    sources: [{ url: `${WHITELISTED_PREFIX}/status/1`, title: '達成の告知' }],
    ...overrides,
  };
}

async function create(overrides: Record<string, unknown> = {}): Promise<number> {
  const response = await createMilestone(env, body(overrides));

  expect(response.status).toEqual(201);

  return ((await response.json()) as { milestone: { milestoneId: number } }).milestone.milestoneId;
}

/** A draft created and published with the same fields. */
async function createPublished(overrides: Record<string, unknown> = {}): Promise<number> {
  const milestoneId = await create(overrides);

  expect((await publishMilestone(env, milestoneId, body(overrides), NOW)).status).toEqual(200);

  return milestoneId;
}

function eventFields(title: string, overrides: Record<string, unknown> = {}) {
  return { datePrecision: 'day', startDate: '2024-01-30', kind: 'milestone', title, sourcePending: true, ...overrides };
}

/** A footprints event of kind milestone, published and live on the public timeline. */
async function liveEvent(title: string): Promise<number> {
  const response = await createEvent(env, eventFields(title));
  const eventId = ((await response.json()) as { event: { eventId: number } }).event.eventId;

  expect((await publishEvent(env, eventId, eventFields(title), NOW)).status).toEqual(200);

  return eventId;
}

interface Pending {
  pending: { milestoneId: number; latestAction: string }[];
  changed: { milestoneId: number }[];
  eventChanged: { milestoneId: number; eventId: number }[];
  shapeOutdated: boolean;
  behind: boolean;
}

async function pending(): Promise<Pending> {
  return (await (await pendingSubscriberMilestones(env)).json()) as Pending;
}

interface StoredJson {
  published_at: string;
  shape_version: number;
  milestones: { milestone_id: number; [key: string]: unknown }[];
}

async function storedJson(): Promise<StoredJson | null> {
  const object = await env.PUBLIC_DATA.get(OBJECT_KEY);

  return object === null ? null : (JSON.parse(await object.text()) as StoredJson);
}

async function storedMilestones(): Promise<StoredJson['milestones']> {
  return (await storedJson())!.milestones;
}

async function revisionRows(): Promise<{ entity_key: string; action: string; body: string | null }[]> {
  const { results } = await env.DB.prepare(
    "SELECT entity_key, action, body FROM revision WHERE entity = 'subscriber_milestone' ORDER BY revision_id",
  ).all<{ entity_key: string; action: string; body: string | null }>();

  return results;
}

async function publicationCount(): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT count(*) AS n FROM publication WHERE target = 'subscriber_milestones'",
  ).first<{ n: number }>();

  return row!.n;
}

async function readRow(
  milestoneId: number,
): Promise<{ status: string; subscriberCount: number; eventId: number | null }> {
  return (await (await getMilestone(env, milestoneId)).json()) as {
    status: string;
    subscriberCount: number;
    eventId: number | null;
  };
}

interface Refusal {
  errors: string[];
  problems: { field: string; message: string }[];
  saved: boolean;
}

describe('publishMilestone', () => {
  test('answers 404 for a milestone that does not exist', async () => {
    expect((await publishMilestone(env, 1, body(), NOW)).status).toEqual(404);
  });

  test('saves the fields sent, publishes, and writes the JSON in one request', async () => {
    const milestoneId = await create({ subscriberCount: 19000 });

    const response = await publishMilestone(env, milestoneId, body(), NOW);

    expect(response.status).toEqual(200);
    expect(((await response.json()) as { milestone: { status: string } }).milestone.status).toEqual('published');
    expect(await readRow(milestoneId)).toMatchObject({ status: 'published', subscriberCount: 20000 });

    const [revision] = await revisionRows();

    expect(revision!.action).toEqual('publish');
    expect(JSON.parse(revision!.body!)).toEqual({
      milestone_id: milestoneId,
      channel_id: 'UCaaa',
      date_precision: 'day',
      reached_date: '2024-01-29',
      subscriber_count: 20000,
      announced_by: 'member',
      event_id: null,
      sources: [{ url: `${WHITELISTED_PREFIX}/status/1`, title: '達成の告知' }],
    });

    expect(await storedJson()).toEqual({
      published_at: '2026-09-25T00:00:00Z',
      shape_version: SUBSCRIBER_MILESTONES_SHAPE_VERSION,
      milestones: [
        {
          milestone_id: milestoneId,
          channel_id: 'UCaaa',
          date_precision: 'day',
          reached_date: '2024-01-29',
          subscriber_count: 20000,
          announced_by: 'member',
          event: null,
          sources: [{ url: `${WHITELISTED_PREFIX}/status/1`, title: '達成の告知' }],
        },
      ],
    });
    expect(await publicationCount()).toEqual(1);
    expect(await pending()).toEqual({
      pending: [],
      changed: [],
      eventChanged: [],
      shapeOutdated: false,
      behind: false,
    });
  });

  // #277's 6-7: unlike an event's, a milestone's sources stop the publish.
  test('refuses sources that are not enough, saves what was sent as a draft, and leaves the JSON alone', async () => {
    const milestoneId = await create();
    const sent = body({ subscriberCount: 21000, sources: [{ url: 'https://x.com/someone/status/1' }] });

    const response = await publishMilestone(env, milestoneId, sent, NOW);

    expect(response.status).toEqual(400);
    expect(await response.json()).toEqual({
      errors: [SOURCES_PROBLEM],
      problems: [{ field: 'sources', message: SOURCES_PROBLEM }],
      saved: true,
    } satisfies Refusal);
    expect(await readRow(milestoneId)).toMatchObject({ status: 'draft', subscriberCount: 21000 });
    expect(await revisionRows()).toEqual([]);
    expect(await storedJson()).toBeNull();
  });

  test('refuses a milestone with no sources', async () => {
    const milestoneId = await create({ sources: [] });
    const response = await publishMilestone(env, milestoneId, body({ sources: [] }), NOW);

    expect(response.status).toEqual(400);
    expect(((await response.json()) as Refusal).errors).toEqual([SOURCES_PROBLEM]);
  });

  test('refuses fields the schema refuses, and saves nothing', async () => {
    const milestoneId = await create();
    const response = await publishMilestone(env, milestoneId, body({ subscriberCount: 0 }), NOW);

    expect(response.status).toEqual(400);
    expect(await readRow(milestoneId)).toMatchObject({ status: 'draft', subscriberCount: 20000 });
  });

  test('refuses a linked event whose kind is no longer milestone', async () => {
    const eventId = await liveEvent('記念配信');
    const milestoneId = await create({ eventId });

    await saveEvent(env, eventId, eventFields('x', { kind: 'other' }), NOW);

    const response = await publishMilestone(env, milestoneId, body({ eventId }), NOW);

    expect(response.status).toEqual(400);
    expect(await revisionRows()).toEqual([]);
  });

  test('accepts sources off the whitelist on two hosts', async () => {
    const sources = [{ url: 'https://x.com/someone/status/1' }, { url: 'https://www.youtube.com/watch?v=abcdefghijk' }];
    const milestoneId = await create({ announcedBy: 'official', sources });

    expect((await publishMilestone(env, milestoneId, body({ announcedBy: 'official', sources }), NOW)).status).toEqual(
      200,
    );
  });

  // #225's decision 3: a listener's post is enough by itself.
  test("accepts a listener's milestone backed by that listener's post alone, and leaves its URL out of the JSON", async () => {
    const overrides = {
      announcedBy: 'listener',
      sources: [{ url: 'https://x.com/listener/status/1', title: 'リスナーの投稿' }],
    };

    await createPublished(overrides);

    expect(await storedMilestones()).toEqual([expect.objectContaining({ announced_by: 'listener', sources: [] })]);
    expect(JSON.stringify(await storedJson())).not.toContain('x.com/listener');
    // The revision keeps it.
    expect((await revisionRows())[0]!.body).toContain('x.com/listener');
  });

  // #225: the member's own stream is a source by itself, like a whitelisted one.
  test.each([
    'https://www.youtube.com/watch?v=abcdefghijk&t=10s',
    'https://youtu.be/abcdefghijk',
    'https://www.youtube.com/live/abcdefghijk',
  ])("accepts a video of the milestone's own channel by itself: %s", async (url) => {
    await insertVideo('abcdefghijk', 'UCaaa');

    const milestoneId = await create({ sources: [{ url }] });

    expect((await publishMilestone(env, milestoneId, body({ sources: [{ url }] }), NOW)).status).toEqual(200);
  });

  test("refuses another member's video alone", async () => {
    await insertChannel('UCbbb');
    await insertVideo('abcdefghijk', 'UCbbb');

    const sources = [{ url: 'https://youtu.be/abcdefghijk' }];
    const milestoneId = await create({ sources });

    expect((await publishMilestone(env, milestoneId, body({ sources }), NOW)).status).toEqual(400);
  });

  test('saves the fields as a draft, and says so, when the JSON cannot be written', async () => {
    const milestoneId = await create();

    const response = await publishMilestone(R2_DOWN, milestoneId, body({ subscriberCount: 22000 }), NOW);

    expect(response.status).toEqual(502);

    const answer = (await response.json()) as { saved: boolean; milestone: { status: string } };

    expect(answer).toMatchObject({ saved: true, milestone: { status: 'draft' } });
    expect(await readRow(milestoneId)).toMatchObject({ status: 'draft', subscriberCount: 22000 });
    expect(await revisionRows()).toEqual([]);
    expect(await storedJson()).toBeNull();
  });

  test('publishes the row, and says the JSON may be behind, when it cannot be brought up to date', async () => {
    const milestoneId = await create();

    const response = await publishMilestone(UNSETTLED, milestoneId, body(), NOW);

    expect(response.status).toEqual(502);
    expect(await response.json()).toMatchObject({ saved: true, milestone: { status: 'published' } });
    expect(await revisionRows()).toHaveLength(1);
    expect(await publicationCount()).toEqual(0);
    expect((await pending()).behind).toEqual(true);
  });
});

describe('saveMilestone', () => {
  test('answers 404 for a milestone that does not exist', async () => {
    expect((await saveMilestone(env, 1, body(), NOW)).status).toEqual(404);
  });

  test('saves a draft as a draft, without a revision or the JSON', async () => {
    const milestoneId = await create();

    expect((await saveMilestone(env, milestoneId, body({ subscriberCount: 30000 }), NOW)).status).toEqual(200);
    expect(await readRow(milestoneId)).toMatchObject({ status: 'draft', subscriberCount: 30000 });
    expect(await revisionRows()).toEqual([]);
    expect(await storedJson()).toBeNull();
  });

  test("puts a published milestone's save on the public site at once", async () => {
    const milestoneId = await createPublished();

    expect((await saveMilestone(env, milestoneId, body({ subscriberCount: 30000 }), NOW)).status).toEqual(200);
    expect(await storedMilestones()).toEqual([expect.objectContaining({ subscriber_count: 30000 })]);
    expect((await revisionRows()).map((r) => r.action)).toEqual(['publish', 'publish']);
    expect((await pending()).changed).toEqual([]);
  });

  test("refuses a published milestone's save that would not publish, and changes nothing", async () => {
    const milestoneId = await createPublished();
    const response = await saveMilestone(env, milestoneId, body({ subscriberCount: 30000, sources: [] }), NOW);

    expect(response.status).toEqual(400);
    expect(((await response.json()) as Refusal).saved).toEqual(false);
    expect(await readRow(milestoneId)).toMatchObject({ status: 'published', subscriberCount: 20000 });
    expect(await storedMilestones()).toEqual([expect.objectContaining({ subscriber_count: 20000 })]);
  });

  test("saves a published milestone's fields, and says so, when the JSON cannot be written", async () => {
    const milestoneId = await createPublished();
    const response = await saveMilestone(R2_DOWN, milestoneId, body({ subscriberCount: 30000 }), NOW);

    expect(response.status).toEqual(502);
    expect(await response.json()).toMatchObject({ saved: true, milestone: { status: 'published' } });
    expect(await storedMilestones()).toEqual([expect.objectContaining({ subscriber_count: 20000 })]);
    expect((await pending()).changed).toEqual([{ milestoneId }]);
  });
});

describe('withdrawMilestone', () => {
  test('answers 404 for a milestone that does not exist', async () => {
    expect((await withdrawMilestone(env, 1, body(), NOW)).status).toEqual(404);
  });

  test('answers 409 for a milestone that is not published', async () => {
    const milestoneId = await create();

    expect((await withdrawMilestone(env, milestoneId, body(), NOW)).status).toEqual(409);
  });

  test('takes the milestone off the JSON, saves the fields as a draft and logs a withdraw revision', async () => {
    const milestoneId = await createPublished();
    const response = await withdrawMilestone(env, milestoneId, body({ subscriberCount: 25000 }), NOW);

    expect(response.status).toEqual(200);
    expect(await readRow(milestoneId)).toMatchObject({ status: 'draft', subscriberCount: 25000 });

    const rows = await revisionRows();

    expect(rows.map((row) => row.action)).toEqual(['publish', 'withdraw']);
    expect(rows[1]!.body).toBeNull();
    expect(await storedMilestones()).toEqual([]);
  });

  test('changes nothing when the JSON cannot be written', async () => {
    const milestoneId = await createPublished();

    expect((await withdrawMilestone(R2_DOWN, milestoneId, body({ subscriberCount: 25000 }), NOW)).status).toEqual(502);
    expect(await readRow(milestoneId)).toMatchObject({ status: 'published', subscriberCount: 20000 });
    expect(await revisionRows()).toHaveLength(1);
  });
});

describe('the JSON', () => {
  test('leaves withdrawn milestones and drafts out, and orders by the date reached', async () => {
    const later = await createPublished({ reachedDate: '2024-01-29' });
    const earlier = await createPublished({ datePrecision: 'month', reachedDate: '2021-12', subscriberCount: 10000 });
    const withdrawn = await createPublished({ reachedDate: '2023-01-01' });

    await create({ reachedDate: '2022-01-01' });
    await withdrawMilestone(env, withdrawn, body({ reachedDate: '2023-01-01' }), NOW);

    expect((await storedMilestones()).map((m) => m.milestone_id)).toEqual([earlier, later]);
  });

  test('names the linked event as the public timeline shows it', async () => {
    const eventId = await liveEvent('シマハイ登録者2万人記念配信');

    await createPublished({ eventId });

    expect(await storedMilestones()).toEqual([
      expect.objectContaining({
        event: { event_id: eventId, title: 'シマハイ登録者2万人記念配信', start_date: '2024-01-30' },
      }),
    ]);
  });

  test('names no event while the event is not on the public timeline', async () => {
    const response = await createEvent(env, eventFields('下書きの題'));
    const eventId = ((await response.json()) as { event: { eventId: number } }).event.eventId;

    await createPublished({ eventId });

    expect(await storedMilestones()).toEqual([expect.objectContaining({ event: null })]);
    expect(JSON.stringify(await storedJson())).not.toContain('下書きの題');
  });
});

// #277's 6-6: an event's publish builds the milestones JSON again when it
// names the event, so 「いま公開する」 is no longer what brings it up to date.
describe("an event's change", () => {
  test('republished with another title, is in the milestones JSON at once', async () => {
    const eventId = await liveEvent('古い題');

    await createPublished({ eventId });
    expect((await saveEvent(env, eventId, eventFields('新しい題'), NOW)).status).toEqual(200);

    expect(await storedMilestones()).toEqual([
      expect.objectContaining({ event: { event_id: eventId, title: '新しい題', start_date: '2024-01-30' } }),
    ]);
    expect((await pending()).eventChanged).toEqual([]);
  });

  test('published for the first time, is in the milestones JSON at once', async () => {
    const response = await createEvent(env, eventFields('記念配信'));
    const eventId = ((await response.json()) as { event: { eventId: number } }).event.eventId;

    await createPublished({ eventId });
    expect((await publishEvent(env, eventId, eventFields('記念配信'), NOW)).status).toEqual(200);

    expect(await storedMilestones()).toEqual([
      expect.objectContaining({ event: expect.objectContaining({ title: '記念配信' }) }),
    ]);
  });

  test('taken off the timeline, leaves the milestone with no event at once', async () => {
    const eventId = await liveEvent('記念配信');

    await createPublished({ eventId });
    expect((await withdrawEvent(env, eventId, eventFields('記念配信'), NOW)).status).toEqual(200);

    expect(await storedMilestones()).toEqual([expect.objectContaining({ event: null })]);
  });

  // A whitelist change writes the timeline from every latest revision, a
  // waiting one too, so the milestones JSON follows it as after a publish (#282).
  test('taken in by a whitelist change, is in the milestones JSON at once', async () => {
    const eventId = await liveEvent('古い題');

    await createPublished({ eventId });

    const latest = await env.DB.prepare(
      "SELECT body FROM revision WHERE entity = 'footprints_event' AND entity_key = ?1 ORDER BY revision_id DESC LIMIT 1",
    )
      .bind(String(eventId))
      .first<{ body: string }>();

    await env.DB.prepare(
      `INSERT INTO revision (entity, entity_key, action, body, created_via)
       VALUES ('footprints_event', ?1, 'publish', ?2, 'admin')`,
    )
      .bind(String(eventId), JSON.stringify({ ...JSON.parse(latest!.body), title: '待っていた題' }))
      .run();

    const added = await addSourceWhitelist(env, { prefix: 'https://partner.example/' }, NOW);

    expect(await added.json()).toMatchObject({ timelineCurrent: true });
    expect(await storedMilestones()).toEqual([
      expect.objectContaining({ event: expect.objectContaining({ event_id: eventId, title: '待っていた題' }) }),
    ]);
  });

  test('does not write the milestones JSON when no milestone names the event', async () => {
    const eventId = await liveEvent('関係ない出来事');

    await createPublished();

    const before = await storedJson();

    const saved = await saveEvent(env, eventId, eventFields('題を直した'), new Date('2026-09-26T00:00:00Z'));

    expect(saved.status).toEqual(200);
    expect(await storedJson()).toEqual(before);
  });

  // The event's own change went through, and its answer says so; the
  // milestone is left for the 公開 screen.
  test('is reported as eventChanged when the milestones JSON cannot be written', async () => {
    const eventId = await liveEvent('古い題');
    const milestoneId = await createPublished({ eventId });
    let failing = false;
    const milestonesDown: Env = {
      ...env,
      PUBLIC_DATA: new Proxy(env.PUBLIC_DATA, {
        get(target, property) {
          if (property === 'put') {
            return (key: string, value: string, options?: R2PutOptions) =>
              failing && key === OBJECT_KEY ? Promise.reject(new Error('R2 is down')) : target.put(key, value, options);
          }

          const value = Reflect.get(target, property) as unknown;

          return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value;
        },
      }),
    };

    failing = true;

    expect((await saveEvent(milestonesDown, eventId, eventFields('新しい題'), NOW)).status).toEqual(200);
    expect(await pending()).toMatchObject({ eventChanged: [{ milestoneId, eventId }], behind: true });

    expect((await publishSubscriberMilestonesNow(env, NOW)).status).toEqual(200);
    expect(await storedMilestones()).toEqual([
      expect.objectContaining({ event: expect.objectContaining({ title: '新しい題' }) }),
    ]);
    expect(await pending()).toMatchObject({ eventChanged: [], behind: false });
  });

  test("written through あしあと's 「いま公開する」, is in the milestones JSON too", async () => {
    const eventId = await liveEvent('古い題');

    await createPublished({ eventId });
    // A revision left waiting, as one from before #281 is.
    await env.DB.prepare(
      `INSERT INTO revision (entity, entity_key, action, body, created_via)
       SELECT 'footprints_event', entity_key, 'publish', json_set(body, '$.title', '待っていた題'), 'admin'
         FROM revision WHERE entity = 'footprints_event' AND entity_key = ?1`,
    )
      .bind(String(eventId))
      .run();

    await publishFootprintsNow(env, NOW);

    expect(await storedMilestones()).toEqual([
      expect.objectContaining({ event: expect.objectContaining({ title: '待っていた題' }) }),
    ]);
  });
});

describe('publishSubscriberMilestonesNow', () => {
  test('writes nothing when there has never been a revision', async () => {
    expect(await (await publishSubscriberMilestonesNow(env, NOW)).json()).toEqual({ published: false });
    expect(await storedJson()).toBeNull();
  });

  test('answers published: false once every publish has written the JSON', async () => {
    await createPublished();

    expect(await (await publishSubscriberMilestonesNow(env, NOW)).json()).toEqual({ published: false });
  });

  test('writes a revision left waiting, and adds a publication row', async () => {
    const milestoneId = await create();

    // As 「公開待ちにする」 left one before #283: a publish revision the JSON was never written from.
    await env.DB.prepare(
      `INSERT INTO revision (entity, entity_key, action, body, created_via)
       VALUES ('subscriber_milestone', ?1, 'publish', ?2, 'admin')`,
    )
      .bind(
        String(milestoneId),
        JSON.stringify({
          milestone_id: milestoneId,
          channel_id: 'UCaaa',
          date_precision: 'day',
          reached_date: '2024-01-29',
          subscriber_count: 20000,
          announced_by: 'member',
          event_id: null,
          sources: [],
        }),
      )
      .run();

    expect((await pending()).pending).toEqual([{ milestoneId, latestAction: 'publish' }]);

    const response = await publishSubscriberMilestonesNow(env, NOW);

    expect(await response.json()).toMatchObject({ published: true, milestoneCount: 1 });
    expect(await publicationCount()).toEqual(1);
    expect((await pending()).pending).toEqual([]);
  });

  test('builds again when the stored JSON is in an older shape', async () => {
    await createPublished();
    await env.PUBLIC_DATA.put(OBJECT_KEY, JSON.stringify({ milestones: [] }));

    expect((await pending()).shapeOutdated).toEqual(true);
    expect(
      ((await (await publishSubscriberMilestonesNow(env, NOW)).json()) as { published: boolean }).published,
    ).toEqual(true);
    expect((await storedJson())!.shape_version).toEqual(SUBSCRIBER_MILESTONES_SHAPE_VERSION);
  });
});

describe('pendingSubscriberMilestones', () => {
  test('reports a published milestone whose working row was changed before #283 as changed', async () => {
    const milestoneId = await createPublished();

    // A save that went past publishing: what a published row's PUT did before #283.
    await env.DB.prepare('UPDATE subscriber_milestone SET subscriber_count = 30000 WHERE milestone_id = ?1')
      .bind(milestoneId)
      .run();

    expect((await pending()).changed).toEqual([{ milestoneId }]);
  });
});

describe('checkSources', () => {
  async function check(overrides: Record<string, unknown>) {
    const response = await checkSources(env, { channelId: 'UCaaa', announcedBy: 'member', urls: [], ...overrides });

    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
  }

  test('marks each source, and a second one on the same site as such', async () => {
    const { body: judged } = await check({
      urls: [
        `${WHITELISTED_PREFIX}/status/1`,
        'https://www.youtube.com/watch?v=zzzzzzzzzzz',
        'https://youtu.be/yyyyyyyyyyy',
        'not a url',
      ],
    });

    expect(judged).toEqual({
      marks: [
        { kind: 'whitelist' },
        { kind: 'host', host: 'youtube.com', sameSite: false },
        { kind: 'host', host: 'youtube.com', sameSite: true },
        { kind: 'host', host: null, sameSite: false },
      ],
      enough: true,
    });
  });

  test("marks the milestone's own video, which is enough by itself", async () => {
    await insertVideo('abcdefghijk', 'UCaaa');

    expect((await check({ urls: ['https://youtu.be/abcdefghijk'] })).body).toEqual({
      marks: [{ kind: 'own_video' }],
      enough: true,
    });
  });

  test('is not enough with one site off the whitelist, nor with none at all', async () => {
    expect((await check({ urls: ['https://youtu.be/a', 'https://www.youtube.com/watch?v=b'] })).body.enough).toBe(
      false,
    );
    expect((await check({ urls: [] })).body.enough).toBe(false);
  });

  test("is enough with one source of any site for a listener's announcement", async () => {
    expect((await check({ announcedBy: 'listener', urls: ['https://x.com/listener/status/1'] })).body.enough).toBe(
      true,
    );
    expect((await check({ announcedBy: 'listener', urls: [] })).body.enough).toBe(false);
  });

  test('does not let a URL a save would refuse make the next one on its host look like a second', async () => {
    expect((await check({ urls: ['http://a.example/old', 'https://a.example/new'] })).body.marks).toEqual([
      { kind: 'host', host: 'a.example', sameSite: false },
      { kind: 'host', host: 'a.example', sameSite: false },
    ]);
  });

  test('counts only URLs a save would accept', async () => {
    const withPassword = 'https://user:secret@x.com/listener/status/1';

    expect((await check({ announcedBy: 'listener', urls: [withPassword] })).body.enough).toBe(false);
    expect((await check({ urls: ['http://a.example/post', 'http://b.example/post'] })).body.enough).toBe(false);
    expect((await check({ urls: ['http://a.example/post', 'https://b.example/post'] })).body.enough).toBe(false);
    expect((await check({ urls: ['https://a.example/post', 'https://b.example/post'] })).body.enough).toBe(true);
  });

  test('answers 400 for a body that is not the right shape', async () => {
    expect((await check({ urls: 'https://x.com' })).status).toEqual(400);
    expect((await check({ urls: [1] })).status).toEqual(400);
    expect((await check({ channelId: 1 })).status).toEqual(400);
    expect((await check({ urls: Array.from({ length: 51 }, () => 'https://x.com') })).status).toEqual(400);
  });
});

// What /code-review found on the first pass: a save racing a publish, a
// withdraw blocked by あしあと, and the timeline the JSON names.
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

describe('a draft save that finds the row published meanwhile', () => {
  /** `env` whose next `batch` first publishes `milestoneId` elsewhere, as another tab would. */
  function publishedFirst(milestoneId: number): Env {
    return beforeNextBatch(env, () =>
      env.DB.prepare("UPDATE subscriber_milestone SET status = 'published' WHERE milestone_id = ?1")
        .bind(milestoneId)
        .run(),
    );
  }

  test('of a refused publish answers 409 and writes nothing over it', async () => {
    const milestoneId = await create();
    const sent = body({ subscriberCount: 21000, sources: [] });

    const response = await publishMilestone(publishedFirst(milestoneId), milestoneId, sent, NOW);

    expect(response.status).toEqual(409);
    expect(await readRow(milestoneId)).toMatchObject({ status: 'published', subscriberCount: 20000 });

    const sources = await env.DB.prepare(
      'SELECT count(*) AS n FROM subscriber_milestone_source WHERE milestone_id = ?1',
    )
      .bind(milestoneId)
      .first<{ n: number }>();

    expect(sources!.n).toEqual(1);
  });

  test('of a plain save answers 409 and writes nothing over it', async () => {
    const milestoneId = await create();

    const response = await saveMilestone(
      publishedFirst(milestoneId),
      milestoneId,
      body({ subscriberCount: 21000 }),
      NOW,
    );

    expect(response.status).toEqual(409);
    expect(await readRow(milestoneId)).toMatchObject({ status: 'published', subscriberCount: 20000 });
  });
});

// What CodeRabbit found on #293's first pass: requests that land between
// another's read and its write.
describe('a published save that finds the row withdrawn meanwhile', () => {
  test('answers 409, and neither saves the row nor puts it back on the public site', async () => {
    const milestoneId = await createPublished();
    const withdrawnFirst = beforeNextBatch(env, () => withdrawMilestone(env, milestoneId, body(), NOW));

    const response = await saveMilestone(withdrawnFirst, milestoneId, body({ subscriberCount: 21000 }), NOW);

    expect(response.status).toEqual(409);
    expect(await readRow(milestoneId)).toMatchObject({ status: 'draft', subscriberCount: 20000 });
    expect(await storedMilestones()).toEqual([]);
    expect((await revisionRows()).map((row) => row.action)).toEqual(['publish', 'withdraw']);
  });

  // The JSON this save wrote before its batch still has the row, and the
  // rebuild that would take it out fails: 409 would hide that.
  test('answers 502 and leaves the JSON behind when it cannot build the JSON again', async () => {
    const milestoneId = await createPublished();
    const withdrawnFirst = beforeNextBatch(firstPutOnly(), () => withdrawMilestone(env, milestoneId, body(), NOW));

    const response = await saveMilestone(withdrawnFirst, milestoneId, body({ subscriberCount: 21000 }), NOW);

    expect(response.status).toEqual(502);
    expect(((await response.json()) as { saved: boolean }).saved).toBe(false);
    expect(await readRow(milestoneId)).toMatchObject({ status: 'draft', subscriberCount: 20000 });
    expect((await pending()).behind).toBe(true);
  });
});

describe('a draft publish that finds the row published meanwhile', () => {
  test('answers 409, and leaves the other publish on the row and the public site', async () => {
    const milestoneId = await create();
    const publishedFirst = beforeNextBatch(env, () =>
      publishMilestone(env, milestoneId, body({ subscriberCount: 22000 }), NOW),
    );

    const response = await publishMilestone(publishedFirst, milestoneId, body({ subscriberCount: 21000 }), NOW);

    expect(response.status).toEqual(409);
    expect(await readRow(milestoneId)).toMatchObject({ status: 'published', subscriberCount: 22000 });
    expect(await storedMilestones()).toEqual([expect.objectContaining({ subscriber_count: 22000 })]);
    expect((await revisionRows()).map((row) => row.action)).toEqual(['publish']);
  });
});

describe('a withdraw that finds the row changed meanwhile', () => {
  test('answers 409, writes nothing over the draft, and records no second withdrawal', async () => {
    const milestoneId = await createPublished();
    const withdrawnFirst = beforeNextBatch(env, () =>
      withdrawMilestone(env, milestoneId, body({ memo: '先に戻した' }), NOW),
    );

    const response = await withdrawMilestone(withdrawnFirst, milestoneId, body({ memo: '後から戻した' }), NOW);

    expect(response.status).toEqual(409);
    expect(await readRow(milestoneId)).toMatchObject({ status: 'draft', memo: '先に戻した' });
    expect((await revisionRows()).map((row) => row.action)).toEqual(['publish', 'withdraw']);
  });

  test('answers 409 for a row saved again since it was read', async () => {
    const milestoneId = await createPublished();
    const savedFirst = beforeNextBatch(env, () =>
      saveMilestone(env, milestoneId, body({ subscriberCount: 22000 }), NOW),
    );

    expect((await withdrawMilestone(savedFirst, milestoneId, body(), NOW)).status).toEqual(409);
    expect(await readRow(milestoneId)).toMatchObject({ status: 'published', subscriberCount: 22000 });
    expect(await storedMilestones()).toEqual([expect.objectContaining({ subscriber_count: 22000 })]);
  });

  test('answers 502 with nothing saved when it cannot build the JSON again either', async () => {
    const milestoneId = await createPublished();
    const savedFirst = beforeNextBatch(firstPutOnly(), () =>
      saveMilestone(env, milestoneId, body({ subscriberCount: 22000 }), NOW),
    );

    const response = await withdrawMilestone(savedFirst, milestoneId, body(), NOW);

    expect(response.status).toEqual(502);
    expect(((await response.json()) as { saved: boolean }).saved).toBe(false);
    expect(await readRow(milestoneId)).toMatchObject({ status: 'published', subscriberCount: 22000 });
    expect((await pending()).behind).toBe(true);
  });
});

describe('a save whose JSON could not be written', () => {
  test('writes nothing over a publish recorded since it read the row, and answers 409', async () => {
    const milestoneId = await createPublished();
    const savedFirst = beforeNextBatch(R2_DOWN, () =>
      saveMilestone(env, milestoneId, body({ subscriberCount: 22000 }), NOW),
    );

    const response = await saveMilestone(savedFirst, milestoneId, body({ subscriberCount: 21000 }), NOW);

    expect(response.status).toEqual(409);
    expect(await readRow(milestoneId)).toMatchObject({ status: 'published', subscriberCount: 22000 });
  });

  test('still saves the fields when nothing was recorded since', async () => {
    const milestoneId = await createPublished();

    const response = await saveMilestone(R2_DOWN, milestoneId, body({ subscriberCount: 21000 }), NOW);

    expect(response.status).toEqual(502);
    expect(await readRow(milestoneId)).toMatchObject({ status: 'published', subscriberCount: 21000 });
  });
});

describe('a delete that finds the row published meanwhile', () => {
  test('answers 409 and leaves the row and its sources', async () => {
    const milestoneId = await create();
    const publishedFirst = beforeNextBatch(env, () => publishMilestone(env, milestoneId, body(), NOW));

    expect((await deleteMilestone(publishedFirst, milestoneId)).status).toEqual(409);
    expect(await readRow(milestoneId)).toMatchObject({ status: 'published' });
    expect(await storedMilestones()).toEqual([expect.objectContaining({ milestone_id: milestoneId })]);

    const sources = await env.DB.prepare(
      'SELECT count(*) AS n FROM subscriber_milestone_source WHERE milestone_id = ?1',
    )
      .bind(milestoneId)
      .first<{ n: number }>();

    expect(sources!.n).toEqual(1);
  });
});

describe('withdrawMilestone with an event no longer a milestone', () => {
  test('still takes the milestone off the public site, keeping the link', async () => {
    const eventId = await liveEvent('記念配信');
    const milestoneId = await createPublished({ eventId });

    await saveEvent(env, eventId, eventFields('記念配信', { kind: 'other' }), NOW);

    expect((await withdrawMilestone(env, milestoneId, body({ eventId }), NOW)).status).toEqual(200);
    expect(await storedMilestones()).toEqual([]);
    expect(await readRow(milestoneId)).toMatchObject({ status: 'draft', eventId });
  });

  test('refuses linking it anew', async () => {
    const eventId = await liveEvent('記念配信');
    const milestoneId = await createPublished();

    await saveEvent(env, eventId, eventFields('記念配信', { kind: 'other' }), NOW);

    expect((await withdrawMilestone(env, milestoneId, body({ eventId }), NOW)).status).toEqual(400);
  });
});

describe('the event the JSON names', () => {
  // Recorded but not on the timeline: a revision sent to 公開待ち before #281.
  test('is the one on the timeline, not a revision the timeline does not have yet', async () => {
    const eventId = await liveEvent('年表の題');

    await env.DB.prepare(
      `INSERT INTO revision (entity, entity_key, action, body, created_via)
       SELECT 'footprints_event', entity_key, 'publish', json_set(body, '$.title', '待っている題'), 'admin'
         FROM revision WHERE entity = 'footprints_event' AND entity_key = ?1`,
    )
      .bind(String(eventId))
      .run();

    await createPublished({ eventId });

    expect(await storedMilestones()).toEqual([
      expect.objectContaining({ event: expect.objectContaining({ title: '年表の題' }) }),
    ]);
  });

  // あしあと's 「いま公開する」 puts that revision on the timeline with no
  // revision of its own, while the milestone's JSON is being written.
  test('is built again when the timeline moves on while the milestone is published', async () => {
    const eventId = await liveEvent('年表の題');
    const waiting = await env.DB.prepare(
      `INSERT INTO revision (entity, entity_key, action, body, created_via)
       SELECT 'footprints_event', entity_key, 'publish', json_set(body, '$.title', '新しい題'), 'admin'
         FROM revision WHERE entity = 'footprints_event' AND entity_key = ?1
       RETURNING revision_id`,
    )
      .bind(String(eventId))
      .first<{ revision_id: number }>();
    const milestoneId = await create({ eventId });
    const timelineMovedOn = beforeNextBatch(env, () =>
      env.DB.prepare(
        `INSERT INTO publication (target, last_revision_id, object_key, byte_length)
         VALUES ('footprints', ?1, 'footprints/events.json', 0)`,
      )
        .bind(waiting!.revision_id)
        .run(),
    );

    expect((await publishMilestone(timelineMovedOn, milestoneId, body({ eventId }), NOW)).status).toEqual(200);
    expect(await storedMilestones()).toEqual([
      expect.objectContaining({ event: expect.objectContaining({ title: '新しい題' }) }),
    ]);
  });
});

describe("checkSources for a listener's announcement", () => {
  test('does not count an empty row, or text a save would refuse', async () => {
    for (const urls of [[''], ['not a url'], ['http://x.com/listener/status/1']]) {
      const response = await checkSources(env, { channelId: 'UCaaa', announcedBy: 'listener', urls });

      expect(((await response.json()) as { enough: boolean }).enough).toBe(false);
    }
  });
});
