import { env } from 'cloudflare:test';

import { createEvent, updateEvent } from '../src/admin/footprints';
import { publishEvent, publishFootprintsNow, withdrawEvent } from '../src/admin/footprints-publish';
import { createMilestone, updateMilestone } from '../src/admin/subscriber-milestones';
import {
  pendingSubscriberMilestones,
  publishMilestone,
  publishSubscriberMilestonesNow,
  SUBSCRIBER_MILESTONES_SHAPE_VERSION,
  withdrawMilestone,
} from '../src/admin/subscriber-milestones-publish';
import { clearEverything } from './reset-db';

const NOW = new Date('2026-09-25T00:00:00Z');
const OBJECT_KEY = 'subscribers/milestones.json';
const WHITELISTED_PREFIX = 'https://x.com/KEMOVP_staff';
const SOURCES_NOT_ENOUGH = 'no source is in the whitelist and the sources are not on two hosts';

async function clearPublicData(): Promise<void> {
  const listed = await env.PUBLIC_DATA.list();

  await Promise.all(listed.objects.map((object) => env.PUBLIC_DATA.delete(object.key)));
}

beforeEach(async () => {
  await clearEverything();
  await clearPublicData();
  await env.DB.prepare('INSERT INTO source_whitelist (prefix) VALUES (?1)').bind(WHITELISTED_PREFIX).run();
  await env.DB.prepare(
    `INSERT INTO channel (channel_id, name, fullname, color_key, color_sub, color_light, color_back, activity_start_date)
     VALUES ('UCaaa', 'a', 'a', '#000000', '#000000', '#000000', '#000000', '2021-01-01')`,
  ).run();
});

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

async function errorsOf(response: Response): Promise<string[]> {
  return ((await response.json()) as { errors: string[] }).errors;
}

/** A footprints event of kind milestone, published and live on the public timeline. */
async function liveEvent(title: string): Promise<number> {
  const response = await createEvent(env, {
    datePrecision: 'day',
    startDate: '2024-01-30',
    kind: 'milestone',
    title,
    sourcePending: true,
  });
  const eventId = ((await response.json()) as { event: { eventId: number } }).event.eventId;

  expect((await publishEvent(env, eventId)).status).toEqual(200);
  expect((await publishFootprintsNow(env, NOW)).status).toEqual(200);

  return eventId;
}

interface Pending {
  pending: { milestoneId: number; latestAction: string }[];
  changed: { milestoneId: number }[];
  eventChanged: { milestoneId: number; eventId: number }[];
  shapeOutdated: boolean;
}

async function pending(): Promise<Pending> {
  return (await (await pendingSubscriberMilestones(env)).json()) as Pending;
}

async function storedJson(): Promise<{ published_at: string; shape_version: number; milestones: unknown[] }> {
  const object = await env.PUBLIC_DATA.get(OBJECT_KEY);

  return JSON.parse(await object!.text()) as { published_at: string; shape_version: number; milestones: unknown[] };
}

describe('publishMilestone', () => {
  test('answers 404 for a milestone that does not exist', async () => {
    expect((await publishMilestone(env, 1)).status).toEqual(404);
  });

  test('publishes and logs a publish revision holding every field but the memo', async () => {
    const milestoneId = await create();

    const response = await publishMilestone(env, milestoneId);

    expect(response.status).toEqual(200);
    expect(((await response.json()) as { milestone: { status: string } }).milestone.status).toEqual('published');

    const revision = await env.DB.prepare(
      "SELECT entity_key, action, body FROM revision WHERE entity = 'subscriber_milestone'",
    ).first<{ entity_key: string; action: string; body: string }>();

    expect(revision!.entity_key).toEqual(String(milestoneId));
    expect(revision!.action).toEqual('publish');
    expect(JSON.parse(revision!.body)).toEqual({
      milestone_id: milestoneId,
      channel_id: 'UCaaa',
      date_precision: 'day',
      reached_date: '2024-01-29',
      subscriber_count: 20000,
      announced_by: 'member',
      event_id: null,
      sources: [{ url: `${WHITELISTED_PREFIX}/status/1`, title: '達成の告知' }],
    });
  });

  test('refuses a milestone with no sources', async () => {
    const milestoneId = await create({ sources: [] });
    const response = await publishMilestone(env, milestoneId);

    expect(response.status).toEqual(400);
    expect(await errorsOf(response)).toEqual(['there are no sources']);
  });

  test('refuses a member milestone backed by one source off the whitelist', async () => {
    const milestoneId = await create({ sources: [{ url: 'https://x.com/someone/status/1' }] });
    const response = await publishMilestone(env, milestoneId);

    expect(response.status).toEqual(400);
    expect(await errorsOf(response)).toEqual([SOURCES_NOT_ENOUGH]);
  });

  test('accepts sources off the whitelist on two hosts', async () => {
    const milestoneId = await create({
      announcedBy: 'official',
      sources: [{ url: 'https://x.com/someone/status/1' }, { url: 'https://www.youtube.com/watch?v=abcdefghijk' }],
    });

    expect((await publishMilestone(env, milestoneId)).status).toEqual(200);
  });

  // #225's decision 3: a listener's post is enough by itself.
  test("accepts a listener's milestone backed by that listener's post alone", async () => {
    const milestoneId = await create({
      announcedBy: 'listener',
      sources: [{ url: 'https://x.com/listener/status/1' }],
    });

    expect((await publishMilestone(env, milestoneId)).status).toEqual(200);
  });

  async function insertVideo(videoId: string, channelId: string): Promise<void> {
    await env.DB.prepare(
      `INSERT INTO video (video_id, channel_id, title, published_at, availability, live_broadcast_content, fetched_at)
       VALUES (?1, ?2, 't', '2024-01-29T00:00:00Z', 'public', 'none', '2024-01-29T00:00:00Z')`,
    )
      .bind(videoId, channelId)
      .run();
  }

  // #225: the member's own stream is a source by itself, like a whitelisted one.
  describe("a video of the milestone's own channel", () => {
    test.each([
      'https://www.youtube.com/watch?v=abcdefghijk&t=10s',
      'https://youtu.be/abcdefghijk',
      'https://www.youtube.com/live/abcdefghijk',
    ])('is enough by itself: %s', async (url) => {
      await insertVideo('abcdefghijk', 'UCaaa');

      const milestoneId = await create({ sources: [{ url }] });

      expect((await publishMilestone(env, milestoneId)).status).toEqual(200);
    });

    test("is not enough when it is another member's", async () => {
      await env.DB.prepare(
        `INSERT INTO channel (channel_id, name, fullname, color_key, color_sub, color_light, color_back, activity_start_date)
         VALUES ('UCbbb', 'b', 'b', '#000000', '#000000', '#000000', '#000000', '2021-01-01')`,
      ).run();
      await insertVideo('abcdefghijk', 'UCbbb');

      const milestoneId = await create({ sources: [{ url: 'https://youtu.be/abcdefghijk' }] });
      const response = await publishMilestone(env, milestoneId);

      expect(response.status).toEqual(400);
      expect(await errorsOf(response)).toEqual([SOURCES_NOT_ENOUGH]);
    });

    test('is not enough when video does not hold it', async () => {
      const milestoneId = await create({ sources: [{ url: 'https://youtu.be/abcdefghijk' }] });
      const response = await publishMilestone(env, milestoneId);

      expect(response.status).toEqual(400);
      expect(await errorsOf(response)).toEqual([SOURCES_NOT_ENOUGH]);
    });

    test("does not change what a listener's milestone needs", async () => {
      const milestoneId = await create({
        announcedBy: 'listener',
        sources: [{ url: 'https://youtu.be/abcdefghijk' }],
      });

      expect((await publishMilestone(env, milestoneId)).status).toEqual(200);
    });
  });

  test('refuses a linked event whose kind is no longer milestone', async () => {
    const eventId = await liveEvent('記念配信');
    const milestoneId = await create({ eventId });

    await updateEvent(env, eventId, { datePrecision: 'day', startDate: '2024-01-30', kind: 'other', title: 'x' });

    const response = await publishMilestone(env, milestoneId);

    expect(response.status).toEqual(400);
    expect(await errorsOf(response)).toEqual([`footprints event ${eventId} is not a milestone`]);
  });
});

describe('withdrawMilestone', () => {
  test('returns the row to draft and logs a withdraw revision', async () => {
    const milestoneId = await create();

    await publishMilestone(env, milestoneId);

    const response = await withdrawMilestone(env, milestoneId);

    expect(response.status).toEqual(200);
    expect(((await response.json()) as { milestone: { status: string } }).milestone.status).toEqual('draft');

    const { results } = await env.DB.prepare(
      "SELECT action, body FROM revision WHERE entity = 'subscriber_milestone' ORDER BY revision_id",
    ).all<{ action: string; body: string | null }>();

    expect(results.map((row) => row.action)).toEqual(['publish', 'withdraw']);
    expect(results[1].body).toBeNull();
  });

  test('answers 404 for a milestone that does not exist', async () => {
    expect((await withdrawMilestone(env, 1)).status).toEqual(404);
  });
});

describe('publishSubscriberMilestonesNow', () => {
  test('writes nothing when there has never been a revision', async () => {
    expect(await (await publishSubscriberMilestonesNow(env, NOW)).json()).toEqual({ published: false });
    expect(await env.PUBLIC_DATA.get(OBJECT_KEY)).toBeNull();
  });

  test('writes the JSON and a publication row, then nothing more until something changes', async () => {
    const milestoneId = await create();

    await publishMilestone(env, milestoneId);

    const response = await publishSubscriberMilestonesNow(env, NOW);
    const result = (await response.json()) as { published: boolean; milestoneCount: number; byteLength: number };

    expect(result).toMatchObject({ published: true, milestoneCount: 1 });

    const stored = await storedJson();

    expect(stored).toEqual({
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

    const publication = await env.DB.prepare(
      "SELECT target, object_key, byte_length FROM publication WHERE target = 'subscriber_milestones'",
    ).first<{ target: string; object_key: string; byte_length: number }>();

    expect(publication).toEqual({
      target: 'subscriber_milestones',
      object_key: OBJECT_KEY,
      byte_length: result.byteLength,
    });

    expect(await (await publishSubscriberMilestonesNow(env, NOW)).json()).toEqual({ published: false });
    expect(await pending()).toEqual({ pending: [], changed: [], eventChanged: [], shapeOutdated: false });
  });

  // #225's decision 3. The revision keeps the URL; only the public JSON drops it.
  test("leaves a listener's source URLs out of the JSON", async () => {
    const milestoneId = await create({
      announcedBy: 'listener',
      sources: [{ url: 'https://x.com/listener/status/1', title: 'リスナーの投稿' }],
    });

    await publishMilestone(env, milestoneId);
    await publishSubscriberMilestonesNow(env, NOW);

    const stored = await storedJson();

    expect(stored.milestones).toEqual([expect.objectContaining({ announced_by: 'listener', sources: [] })]);
    expect(JSON.stringify(stored)).not.toContain('x.com/listener');
  });

  test('leaves withdrawn milestones and drafts out, and orders by the date reached', async () => {
    const later = await create({ reachedDate: '2024-01-29' });
    const earlier = await create({ datePrecision: 'month', reachedDate: '2021-12', subscriberCount: 10000 });
    const withdrawn = await create({ reachedDate: '2023-01-01' });

    await create({ reachedDate: '2022-01-01' });
    await publishMilestone(env, later);
    await publishMilestone(env, earlier);
    await publishMilestone(env, withdrawn);
    await withdrawMilestone(env, withdrawn);
    await publishSubscriberMilestonesNow(env, NOW);

    const stored = (await storedJson()) as { milestones: { milestone_id: number }[] };

    expect(stored.milestones.map((m) => m.milestone_id)).toEqual([earlier, later]);
  });

  test('builds from the publish revision, not from a row changed since', async () => {
    const milestoneId = await create();

    await publishMilestone(env, milestoneId);
    await updateMilestone(env, milestoneId, body({ subscriberCount: 30000 }));

    expect((await pending()).changed).toEqual([{ milestoneId }]);

    await publishSubscriberMilestonesNow(env, NOW);

    expect((await storedJson()).milestones).toEqual([expect.objectContaining({ subscriber_count: 20000 })]);
  });

  test('builds again when the stored JSON is in an older shape', async () => {
    const milestoneId = await create();

    await publishMilestone(env, milestoneId);
    await publishSubscriberMilestonesNow(env, NOW);
    await env.PUBLIC_DATA.put(OBJECT_KEY, JSON.stringify({ milestones: [] }));

    expect((await pending()).shapeOutdated).toEqual(true);
    expect(
      ((await (await publishSubscriberMilestonesNow(env, NOW)).json()) as { published: boolean }).published,
    ).toEqual(true);
    expect((await storedJson()).shape_version).toEqual(SUBSCRIBER_MILESTONES_SHAPE_VERSION);
  });
});

describe('the linked event', () => {
  test('is written as the public timeline shows it', async () => {
    const eventId = await liveEvent('シマハイ登録者2万人記念配信');
    const milestoneId = await create({ eventId });

    await publishMilestone(env, milestoneId);
    await publishSubscriberMilestonesNow(env, NOW);

    expect((await storedJson()).milestones).toEqual([
      expect.objectContaining({
        event: { event_id: eventId, title: 'シマハイ登録者2万人記念配信', start_date: '2024-01-30' },
      }),
    ]);
  });

  test('is null while the event is not on the public timeline', async () => {
    const response = await createEvent(env, {
      datePrecision: 'day',
      startDate: '2024-01-30',
      kind: 'milestone',
      title: '下書きの題',
    });
    const eventId = ((await response.json()) as { event: { eventId: number } }).event.eventId;

    // Sent to 公開待ち, but the timeline has not been published since.
    await publishEvent(env, eventId);

    const milestoneId = await create({ eventId });

    await publishMilestone(env, milestoneId);
    await publishSubscriberMilestonesNow(env, NOW);

    expect((await storedJson()).milestones).toEqual([expect.objectContaining({ event: null })]);
    expect(JSON.stringify(await storedJson())).not.toContain('下書きの題');
  });

  // HQ's condition on #225: an event fixed on the timeline must not leave the
  // milestones JSON showing its old title with nothing saying so.
  test('republished with another title, is reported and built again', async () => {
    const eventId = await liveEvent('古い題');
    const milestoneId = await create({ eventId });

    await publishMilestone(env, milestoneId);
    await publishSubscriberMilestonesNow(env, NOW);

    await updateEvent(env, eventId, {
      datePrecision: 'day',
      startDate: '2024-01-30',
      kind: 'milestone',
      title: '新しい題',
      sourcePending: true,
    });
    await publishEvent(env, eventId);

    // Only 公開待ち on the timeline so far: the title there is still the old one.
    expect((await pending()).eventChanged).toEqual([]);

    await publishFootprintsNow(env, NOW);

    expect(await pending()).toEqual({
      pending: [],
      changed: [],
      eventChanged: [{ milestoneId, eventId }],
      shapeOutdated: false,
    });
    expect(
      ((await (await publishSubscriberMilestonesNow(env, NOW)).json()) as { published: boolean }).published,
    ).toEqual(true);
    expect((await storedJson()).milestones).toEqual([
      expect.objectContaining({ event: { event_id: eventId, title: '新しい題', start_date: '2024-01-30' } }),
    ]);
    expect((await pending()).eventChanged).toEqual([]);
  });

  test('taken off the timeline, is reported and built again as null', async () => {
    const eventId = await liveEvent('記念配信');
    const milestoneId = await create({ eventId });

    await publishMilestone(env, milestoneId);
    await publishSubscriberMilestonesNow(env, NOW);
    await withdrawEvent(env, eventId);
    await publishFootprintsNow(env, NOW);

    expect((await pending()).eventChanged).toEqual([{ milestoneId, eventId }]);

    await publishSubscriberMilestonesNow(env, NOW);

    expect((await storedJson()).milestones).toEqual([expect.objectContaining({ event: null })]);
  });
});

describe('pendingSubscriberMilestones', () => {
  test('lists a milestone whose latest revision is newer than the last run', async () => {
    const milestoneId = await create();

    await publishMilestone(env, milestoneId);

    expect((await pending()).pending).toEqual([{ milestoneId, latestAction: 'publish' }]);

    await publishSubscriberMilestonesNow(env, NOW);
    await withdrawMilestone(env, milestoneId);

    expect((await pending()).pending).toEqual([{ milestoneId, latestAction: 'withdraw' }]);
  });
});
