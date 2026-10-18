import { env } from 'cloudflare:test';

import { clearEverything } from './reset-db';

/**
 * The part of migrations/0011_add_footprints_event_member_lead.sql that
 * changes rows. Every test file starts from empty tables, so the migration
 * has already run on nothing; this runs its UPDATE again on rows shaped like
 * the debuts production had on 2026-10-18.
 */

beforeEach(clearEverything);

const BACKFILL = env.TEST_MIGRATIONS.find(
  ({ name }) => name === '0011_add_footprints_event_member_lead.sql',
)!.queries.find((query) => query.includes('UPDATE footprints_event_member'))!;

async function insertChannel(channelId: string, activityStartDate: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO channel (channel_id, name, fullname, color_key, color_sub, color_light, color_back, activity_start_date)
     VALUES (?1, ?1, ?1, '#000000', '#000000', '#000000', '#000000', ?2)`,
  )
    .bind(channelId, activityStartDate)
    .run();
}

async function insertEvent(eventId: number, kind: string, startDate: string, channelIds: string[]): Promise<void> {
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO footprints_event (event_id, date_precision, start_date, kind, title) VALUES (?1, 'day', ?2, ?3, 'x')`,
    ).bind(eventId, startDate, kind),
    ...channelIds.map((channelId) =>
      env.DB.prepare('INSERT INTO footprints_event_member (event_id, channel_id) VALUES (?1, ?2)').bind(
        eventId,
        channelId,
      ),
    ),
  ]);
}

async function leads(): Promise<[number, string][]> {
  const { results } = await env.DB.prepare(
    'SELECT event_id, channel_id FROM footprints_event_member WHERE lead = 1 ORDER BY event_id, channel_id',
  ).all<{ event_id: number; channel_id: string }>();

  return results.map((row) => [row.event_id, row.channel_id]);
}

describe('migration 0011', () => {
  test('marks the member whose activity started on the debut, and not the guests in it', async () => {
    await insertChannel('UCcape', '2021-04-26');
    await insertChannel('UChumboldt', '2021-04-28');
    await insertChannel('UCshimahai', '2021-06-11');

    await insertEvent(3, 'debut', '2021-04-26', ['UCcape', 'UChumboldt']);
    await insertEvent(4, 'debut', '2021-04-28', ['UChumboldt']);
    await insertEvent(6, 'debut', '2021-06-11', ['UCcape', 'UChumboldt', 'UCshimahai']);
    // On ケープペンギン's first day too, but not a debut.
    await insertEvent(7, 'collab', '2021-04-26', ['UCcape']);

    await env.DB.prepare(BACKFILL).run();

    expect(await leads()).toEqual([
      [3, 'UCcape'],
      [4, 'UChumboldt'],
      [6, 'UCshimahai'],
    ]);
  });
});
