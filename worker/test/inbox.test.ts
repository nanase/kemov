import { env } from 'cloudflare:test';

import { createEvent, getEvent } from '../src/admin/footprints';
import { publishEvent, withdrawEvent } from '../src/admin/footprints-publish';
import { publishStream } from '../src/admin/genet-publish';
import { createStream } from '../src/admin/genet-streams';
import { createTune } from '../src/admin/genet-tunes';
import { deferStream, inboxCounts, listPublishInbox, listReviewInbox, listSourceInbox } from '../src/admin/inbox';
import { createMilestone } from '../src/admin/subscriber-milestones';
import { publishMilestone } from '../src/admin/subscriber-milestones-publish';
import { clearEverything } from './reset-db';

const NOW = new Date('2026-10-01T00:00:00Z');
const WHITELISTED_PREFIX = 'https://kemono-friends.jp/';
const WHITELISTED_SOURCE = `${WHITELISTED_PREFIX}some-article`;

beforeEach(async () => {
  await clearEverything();
  await env.DB.prepare('INSERT INTO source_whitelist (prefix) VALUES (?1)').bind(WHITELISTED_PREFIX).run();
});

async function createValidEvent(overrides: Record<string, unknown> = {}): Promise<number> {
  const response = await createEvent(env, {
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
    memo: null,
    channelIds: [],
    sources: [{ url: WHITELISTED_SOURCE, title: null }],
    ...overrides,
  });
  const body = (await response.json()) as { event: { eventId: number } };

  return body.event.eventId;
}

/** 「公開」 with the event's own fields, as saved. */
async function publish(eventId: number): Promise<Response> {
  const saved = (await (await getEvent(env, eventId)).json()) as Record<string, unknown>;

  return await publishEvent(env, eventId, saved, NOW);
}

/**
 * A revision newer than the last time footprints/events.json was written -
 * what the two-step publishing before #281 left behind until 「いま公開する」.
 */
async function leaveWaiting(eventId: number, action: 'publish' | 'withdraw'): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO revision (entity, entity_key, action, body, created_via) VALUES ('footprints_event', ?1, ?2, ?3, 'admin')`,
  )
    .bind(String(eventId), action, action === 'publish' ? JSON.stringify({ event_id: eventId }) : null)
    .run();
}

async function createValidStream(videoId: string, publishedAt = '2026-01-01T00:00:00Z'): Promise<string> {
  const tune = await createTune(env, {
    title: '[曲名](wiki:曲名)',
    originalTitle: null,
    subtunes: [],
    attributes: [],
    videos: [],
    scores: [],
    memo: null,
  });
  const { tune: created } = (await tune.json()) as { tune: { tuneId: number } };

  await createStream(env, {
    videoId,
    videoType: 'live',
    title: '配信題',
    shortTitle: null,
    publishedAt,
    categories: [],
    keywords: [],
    memo: null,
    performances: [
      {
        tuneId: created.tuneId,
        description: null,
        scenes: [{ style: 'play', videoId, startSeconds: 60 }],
      },
    ],
  });

  return videoId;
}

async function json<T>(response: Response | Promise<Response>): Promise<T> {
  return (await (await response).json()) as T;
}

interface ReviewBody {
  events: { eventId: number; status: string }[];
  streams: { videoId: string; status: string; performances: { tuneId: number }[] }[];
  tuneTitles: Record<string, string>;
}

describe('listReviewInbox', () => {
  test('lists drafts never published, and leaves out published and withdrawn rows', async () => {
    const draft = await createValidEvent({ title: '下書き' });
    const published = await createValidEvent({ title: '公開' });
    const withdrawn = await createValidEvent({ title: '取り下げ' });

    await publish(published);
    await publish(withdrawn);
    await withdrawEvent(
      env,
      withdrawn,
      (await (await getEvent(env, withdrawn)).json()) as Record<string, unknown>,
      NOW,
    );

    const body = await json<ReviewBody>(listReviewInbox(env));

    expect(body.events.map((e) => e.eventId)).toEqual([draft]);
  });

  test('puts streams put off with あとで behind the ones not yet looked at', async () => {
    const later = await createValidStream('aaaaaaaaaaa', '2021-01-01T00:00:00Z');
    const fresh = await createValidStream('bbbbbbbbbbb', '2024-01-01T00:00:00Z');

    await deferStream(env, later);

    const body = await json<ReviewBody>(listReviewInbox(env));

    expect(body.streams.map((s) => [s.videoId, s.status])).toEqual([
      [fresh, 'draft'],
      [later, 'review'],
    ]);
  });

  test('lists streams the same way, with the titles of the tunes they perform', async () => {
    const draft = await createValidStream('aaaaaaaaaaa');
    const published = await createValidStream('bbbbbbbbbbb');

    await publishStream(env, published);

    const body = await json<ReviewBody>(listReviewInbox(env));

    expect(body.streams.map((s) => s.videoId)).toEqual([draft]);

    const tuneId = String(body.streams[0]!.performances[0]!.tuneId);

    expect(body.tuneTitles).toEqual({ [tuneId]: '[曲名](wiki:曲名)' });
  });
});

describe('listSourceInbox', () => {
  test('lists every event short of sources, published or not', async () => {
    const noSources = await createValidEvent({ sources: [] });
    const oneHost = await createValidEvent({
      startDate: '2026-01-01',
      sources: [
        { url: 'https://www.youtube.com/watch?v=aaaaaaaaaaa', title: null },
        { url: 'https://youtu.be/bbbbbbbbbbb', title: null },
      ],
    });

    await createValidEvent();
    await createValidEvent({
      sources: [
        { url: 'https://www.youtube.com/watch?v=aaaaaaaaaaa', title: null },
        { url: 'https://ameblo.jp/someone/entry-1', title: null },
      ],
    });
    await publish(oneHost);

    const body = await json<{ events: { eventId: number }[] }>(listSourceInbox(env));

    expect(body.events.map((e) => e.eventId)).toEqual([noSources, oneHost]);
  });

  // The whitelist is read when the list is, so an entry added since counts at once.
  test('judges by the whitelist as it is now', async () => {
    await createValidEvent({ sources: [{ url: 'https://ameblo.jp/someone/entry-1', title: null }] });

    expect((await json<{ events: { eventId: number }[] }>(listSourceInbox(env))).events).toHaveLength(1);

    await env.DB.prepare('INSERT INTO source_whitelist (prefix) VALUES (?1)').bind('https://ameblo.jp/someone').run();

    expect((await json<{ events: { eventId: number }[] }>(listSourceInbox(env))).events).toEqual([]);
  });
});

describe('deferStream', () => {
  test('refuses a published stream and leaves it published', async () => {
    const videoId = await createValidStream('ccccccccccc');

    await publishStream(env, videoId);

    expect((await deferStream(env, videoId)).status).toEqual(409);

    const stream = await env.DB.prepare('SELECT status FROM genet_stream WHERE video_id = ?1')
      .bind(videoId)
      .first<{ status: string }>();

    expect(stream!.status).toEqual('published');
  });

  test('move a stream to review without logging a revision', async () => {
    const videoId = await createValidStream('ddddddddddd');

    expect((await deferStream(env, videoId)).status).toEqual(200);

    const stream = await env.DB.prepare('SELECT status FROM genet_stream WHERE video_id = ?1')
      .bind(videoId)
      .first<{ status: string }>();
    const revisions = await env.DB.prepare('SELECT count(*) AS n FROM revision').first<{ n: number }>();

    expect(stream!.status).toEqual('review');
    expect(revisions!.n).toEqual(0);
  });

  test('answers 404 for a stream that does not exist', async () => {
    expect((await deferStream(env, 'nonexistent')).status).toEqual(404);
  });
});

interface PublishBody {
  items: {
    target: string;
    entity: string;
    key: string;
    title: string | null;
    date: string | null;
    latestAction: string;
  }[];
  canPublish: { footprints: boolean; genet: boolean; milestones: boolean };
}

describe('listPublishInbox', () => {
  test('lists what the next run would publish or take down, with titles and dates', async () => {
    const live = await createValidEvent({ title: '公開済み', startDate: '2024-05-05' });

    await publish(live);

    const queued = await createValidEvent({ title: '公開待ち', startDate: '2025-02-02' });

    await leaveWaiting(queued, 'publish');
    await leaveWaiting(live, 'withdraw');

    const videoId = await createValidStream('eeeeeeeeeee', '2026-01-31T16:00:00Z');

    await publishStream(env, videoId);

    const body = await json<PublishBody>(listPublishInbox(env));

    expect(body.items.filter((i) => i.target === 'footprints')).toEqual(
      expect.arrayContaining([
        {
          target: 'footprints',
          entity: 'footprints_event',
          key: String(queued),
          title: '公開待ち',
          date: '2025-02-02',
          latestAction: 'publish',
        },
        {
          target: 'footprints',
          entity: 'footprints_event',
          key: String(live),
          title: '公開済み',
          date: '2024-05-05',
          latestAction: 'withdraw',
        },
      ]),
    );
    expect(body.items.find((i) => i.entity === 'genet_stream')).toEqual({
      target: 'genet_music',
      entity: 'genet_stream',
      key: videoId,
      title: '配信題',
      date: '2026-02-01',
      latestAction: 'publish',
    });
    expect(body.items.some((i) => i.entity === 'genet_tune')).toEqual(true);
    expect(body.canPublish).toEqual({ footprints: true, genet: true, milestones: false });
  });

  test('lists a milestone waiting, named by its member and count', async () => {
    await env.DB.prepare(
      `INSERT INTO channel (channel_id, name, fullname, color_key, color_sub, color_light, color_back, activity_start_date)
       VALUES ('UCaaa', 'メンバー', 'メンバー', '#000000', '#000000', '#000000', '#000000', '2021-01-01')`,
    ).run();

    const created = await createMilestone(env, {
      channelId: 'UCaaa',
      datePrecision: 'day',
      reachedDate: '2024-01-29',
      subscriberCount: 20000,
      announcedBy: 'member',
      eventId: null,
      memo: null,
      sources: [{ url: WHITELISTED_SOURCE, title: null }],
    });
    const { milestone } = (await created.json()) as { milestone: { milestoneId: number } };

    expect((await publishMilestone(env, milestone.milestoneId)).status).toEqual(200);

    const body = await json<PublishBody>(listPublishInbox(env));

    expect(body.items).toEqual([
      {
        target: 'subscriber_milestones',
        entity: 'subscriber_milestone',
        key: String(milestone.milestoneId),
        title: 'メンバー 20,000 人',
        date: '2024-01-29',
        latestAction: 'publish',
      },
    ]);
    expect(body.canPublish.milestones).toEqual(true);
    expect(((await json(inboxCounts(env))) as { publish: number }).publish).toEqual(1);
  });

  test('says nothing can be published when nothing is waiting', async () => {
    const body = await json<PublishBody>(listPublishInbox(env));

    expect(body).toEqual({ items: [], canPublish: { footprints: false, genet: false, milestones: false } });
  });
});

describe('inboxCounts', () => {
  test('counts each screen the way its list does', async () => {
    await createValidEvent({ sources: [] });
    await createValidStream('fffffffff01');

    const queued = await createValidEvent();

    await publish(queued);
    await leaveWaiting(queued, 'publish');

    expect(await json(inboxCounts(env))).toEqual({ review: 2, source: 1, publish: 1 });
  });

  test('leaves only the source count unknown when the whitelist cannot be read', async () => {
    await createValidEvent({ sources: [] });

    const prepare = env.DB.prepare.bind(env.DB);

    const spy = vi.spyOn(env.DB, 'prepare').mockImplementation((query: string) => {
      if (query.includes('source_whitelist')) throw new Error('D1 is unavailable');

      return prepare(query);
    });

    try {
      expect(await json(inboxCounts(env))).toEqual({ review: 1, source: null, publish: 0 });
    } finally {
      spy.mockRestore();
    }
  });
});
