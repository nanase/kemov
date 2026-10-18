import { env } from 'cloudflare:test';

import { clearEverything } from './reset-db';

/**
 * migrations/0012_add_footprints_event_memorial_day.sql rebuilds a table that
 * three others point at by foreign key. Every test file starts from empty
 * tables, so the migration has already run on nothing; this runs it again on
 * rows that the other tables point at, the way production has them.
 */

beforeEach(clearEverything);

const MIGRATION = env.TEST_MIGRATIONS.find(({ name }) => name === '0012_add_footprints_event_memorial_day.sql')!;

async function seed(): Promise<void> {
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO channel (channel_id, name, fullname, color_key, color_sub, color_light, color_back, activity_start_date)
       VALUES ('UCa', 'a', 'a', '#000000', '#000000', '#000000', '#000000', '2021-06-11')`,
    ),
    env.DB.prepare(
      `INSERT INTO footprints_event (event_id, date_precision, start_date, kind, title, status, memo, created_via)
       VALUES (38, 'day', '2022-06-11', 'anniversary', 'シマハイ活動1周年記念配信', 'published', 'メモ', 'admin')`,
    ),
    env.DB.prepare(
      `INSERT INTO footprints_event (event_id, date_precision, start_date, kind, title)
       VALUES (271, 'day', '2026-06-11', 'milestone', '登録者数 10 万人')`,
    ),
    env.DB.prepare(`INSERT INTO footprints_event_member (event_id, channel_id) VALUES (38, 'UCa')`),
    env.DB.prepare(
      `INSERT INTO footprints_event_source (event_id, position, url, title) VALUES (38, 1, 'https://example.com/a', NULL)`,
    ),
    env.DB.prepare(
      `INSERT INTO subscriber_milestone (channel_id, date_precision, reached_date, subscriber_count, announced_by, event_id)
       VALUES ('UCa', 'day', '2026-06-11', 100000, 'member', 271)`,
    ),
  ]);
}

/** The rebuilt table and every table that points at it. */
async function everyRow(): Promise<Record<string, unknown[]>> {
  const tables = ['footprints_event', 'footprints_event_member', 'footprints_event_source', 'subscriber_milestone'];
  const rows = await Promise.all(tables.map((table) => env.DB.prepare(`SELECT * FROM ${table} ORDER BY 1, 2`).all()));

  return Object.fromEntries(tables.map((table, index) => [table, rows[index]!.results]));
}

describe('migration 0012', () => {
  test('keeps every row, the rows pointing at them, and the next id', async () => {
    await seed();

    const before = await everyRow();

    await env.DB.batch(MIGRATION.queries.map((query) => env.DB.prepare(query)));

    expect(await everyRow()).toEqual(before);
    expect((await env.DB.prepare('PRAGMA foreign_key_check').all()).results).toEqual([]);
    expect(
      await env.DB.prepare("SELECT seq FROM sqlite_sequence WHERE name = 'footprints_event'").first<{ seq: number }>(),
    ).toEqual({ seq: 271 });
    expect(
      await env.DB.prepare("SELECT count(*) AS n FROM sqlite_sequence WHERE name = 'footprints_event_new'").first(),
    ).toEqual({ n: 0 });
    expect(await env.DB.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name GLOB '*_aside'").first()).toEqual({
      n: 0,
    });
  });

  test('takes the new kind, and still refuses one it does not know', async () => {
    await seed();
    await env.DB.batch(MIGRATION.queries.map((query) => env.DB.prepare(query)));

    await env.DB.prepare(
      `INSERT INTO footprints_event (date_precision, start_date, kind, title) VALUES ('day', '2023-08-01', 'memorial_day', 'シマハイの日')`,
    ).run();

    await expect(
      env.DB.prepare(
        `INSERT INTO footprints_event (date_precision, start_date, kind, title) VALUES ('day', '2023-08-01', 'birthday', 'x')`,
      ).run(),
    ).rejects.toThrow(/CHECK/);
  });

  test('still refuses a member row for an event that does not exist', async () => {
    await seed();
    await env.DB.batch(MIGRATION.queries.map((query) => env.DB.prepare(query)));

    await expect(
      env.DB.prepare(`INSERT INTO footprints_event_member (event_id, channel_id) VALUES (999, 'UCa')`).run(),
    ).rejects.toThrow(/FOREIGN KEY/);
  });
});
