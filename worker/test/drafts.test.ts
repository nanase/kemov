import { env } from 'cloudflare:test';

import { listDrafts } from '../src/admin/drafts';
import { createEvent, getEvent } from '../src/admin/footprints';
import { publishEvent } from '../src/admin/footprints-publish';
import { publishStream } from '../src/admin/genet-publish';
import { createStream, getStream } from '../src/admin/genet-streams';
import { createTune } from '../src/admin/genet-tunes';
import { createMilestone } from '../src/admin/subscriber-milestones';
import { clearEverything } from './reset-db';

const NOW = new Date('2026-10-01T00:00:00Z');
const WHITELISTED_PREFIX = 'https://kemono-friends.jp/';
const WHITELISTED_SOURCE = `${WHITELISTED_PREFIX}some-article`;

// The public JSONs stay in R2 between tests unless emptied, and whether one
// is outdated is read from R2.
beforeEach(async () => {
  await clearEverything();

  const listed = await env.PUBLIC_DATA.list();

  await Promise.all(listed.objects.map((object) => env.PUBLIC_DATA.delete(object.key)));
  await env.DB.prepare('INSERT INTO source_whitelist (prefix) VALUES (?1)').bind(WHITELISTED_PREFIX).run();
});

async function createValidEvent(): Promise<number> {
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
  });
  const body = (await response.json()) as { event: { eventId: number } };

  return body.event.eventId;
}

/** 「公開」 with the event's own fields, as saved. */
async function publish(eventId: number): Promise<Response> {
  const saved = (await (await getEvent(env, eventId)).json()) as Record<string, unknown>;

  return await publishEvent(env, eventId, saved, NOW);
}

async function createValidStream(videoId: string): Promise<string> {
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
    publishedAt: '2026-01-01T00:00:00Z',
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

async function createDraftMilestone(): Promise<number> {
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

  return milestone.milestoneId;
}

async function drafts(): Promise<Record<string, { drafts: number; needsPublish: boolean } | null>> {
  return (await (await listDrafts(env)).json()) as Record<string, { drafts: number; needsPublish: boolean } | null>;
}

describe('listDrafts', () => {
  test('counts the drafts of each data, and leaves the published rows out', async () => {
    await createValidEvent();
    await createValidEvent();
    await publish(await createValidEvent());
    await createValidStream('aaaaaaaaaaa');

    const live = await createValidStream('bbbbbbbbbbb');
    const { stream } = (await (await getStream(env, live)).json()) as { stream: Record<string, unknown> };

    await publishStream(env, live, stream, NOW);
    await createDraftMilestone();

    expect(await drafts()).toEqual({
      footprints: { drafts: 2, needsPublish: false },
      milestones: { drafts: 1, needsPublish: false },
      genet: { drafts: 1, needsPublish: false },
    });
  });

  test('says nothing needs 「本番に反映」 with no rows at all', async () => {
    expect(await drafts()).toEqual({
      footprints: { drafts: 0, needsPublish: false },
      milestones: { drafts: 0, needsPublish: false },
      genet: { drafts: 0, needsPublish: false },
    });
  });

  // A write that no check found up to date (publishing.ts's isBehind).
  test('marks a data whose public JSON may be behind', async () => {
    await env.DB.prepare(`INSERT INTO publication_write (target) VALUES ('footprints')`).run();

    expect((await drafts()).footprints).toEqual({ drafts: 0, needsPublish: true });
    expect((await drafts()).genet?.needsPublish).toBe(false);
  });

  // What the two-step publishing before #281 left behind until 「いま公開する」.
  test('marks a data with a revision newer than its JSON', async () => {
    const eventId = await createValidEvent();

    await env.DB.prepare(
      `INSERT INTO revision (entity, entity_key, action, body, created_via) VALUES ('footprints_event', ?1, 'publish', ?2, 'admin')`,
    )
      .bind(String(eventId), JSON.stringify({ event_id: eventId }))
      .run();

    expect((await drafts()).footprints?.needsPublish).toBe(true);
  });

  // A JSON judged by another whitelist (#282).
  test('marks あしあと when its JSON is outdated', async () => {
    await publish(await createValidEvent());

    const object = await env.PUBLIC_DATA.get('footprints/events.json');
    const stored = (await object!.json()) as { events: Record<string, unknown>[] };

    await env.PUBLIC_DATA.put(
      'footprints/events.json',
      JSON.stringify({ ...stored, events: stored.events.map((e) => ({ ...e, source_pending: true })) }),
    );

    expect((await drafts()).footprints).toEqual({ drafts: 0, needsPublish: true });
  });

  // Whether the JSON is outdated is unknown, which must not read as "up to date".
  test('answers null for あしあと when its JSON in R2 cannot be read', async () => {
    await publish(await createValidEvent());

    const get = env.PUBLIC_DATA.get.bind(env.PUBLIC_DATA);
    const spy = vi.spyOn(env.PUBLIC_DATA, 'get').mockImplementation(((key: string, options?: R2GetOptions) => {
      if (key === 'footprints/events.json') return Promise.reject(new Error('R2 is unavailable'));

      return get(key, options);
    }) as typeof env.PUBLIC_DATA.get);

    try {
      const body = await drafts();

      expect(body.footprints).toBeNull();
      expect(body.milestones).toEqual({ drafts: 0, needsPublish: false });
    } finally {
      spy.mockRestore();
    }
  });

  // Not knowing must not read as "nothing to do": the sidebar leaves out that one data's count.
  test('answers null for a data that cannot be read, and the others as they are', async () => {
    await createValidEvent();

    const prepare = env.DB.prepare.bind(env.DB);
    const spy = vi.spyOn(env.DB, 'prepare').mockImplementation((query: string) => {
      if (query.includes('FROM genet_stream')) throw new Error('D1 is unavailable');

      return prepare(query);
    });

    try {
      const body = await drafts();

      expect(body.genet).toBeNull();
      expect(body.footprints).toEqual({ drafts: 1, needsPublish: false });
    } finally {
      spy.mockRestore();
    }
  });
});
