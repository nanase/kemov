import { env } from 'cloudflare:test';

import { clearEverything } from './reset-db';

/**
 * migrations/0015_drop_footprints_event_source_pending.sql drops a column of
 * a table that three others point at by foreign key. Every test file starts
 * from tables 0015 has already run on, so the column is put back here as
 * 0015's rollback puts it back, and 0015 runs again on rows that the other
 * tables point at.
 */

const MIGRATION = env.TEST_MIGRATIONS.find(({ name }) => name === '0015_drop_footprints_event_source_pending.sql')!;

async function columns(): Promise<string[]> {
  const { results } = await env.DB.prepare("SELECT name FROM pragma_table_info('footprints_event')").all<{
    name: string;
  }>();

  return results.map((row) => row.name);
}

beforeEach(async () => {
  await clearEverything();

  if (!(await columns()).includes('source_pending')) {
    await env.DB.prepare(
      'ALTER TABLE footprints_event ADD COLUMN source_pending INTEGER NOT NULL DEFAULT 1 CHECK (source_pending IN (0, 1))',
    ).run();
  }
});

async function seed(): Promise<void> {
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO channel (channel_id, name, fullname, color_key, color_sub, color_light, color_back, activity_start_date)
       VALUES ('UCa', 'a', 'a', '#000000', '#000000', '#000000', '#000000', '2021-06-11')`,
    ),
    env.DB.prepare(
      `INSERT INTO footprints_event (event_id, date_precision, start_date, kind, title, source_pending, status)
       VALUES (38, 'day', '2022-06-11', 'anniversary', 'シマハイ活動1周年記念配信', 0, 'published')`,
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

/** footprints_event without `source_pending`, and every table that points at it. */
async function everyRow(): Promise<Record<string, unknown[]>> {
  const tables = ['footprints_event', 'footprints_event_member', 'footprints_event_source', 'subscriber_milestone'];
  const rows = await Promise.all(tables.map((table) => env.DB.prepare(`SELECT * FROM ${table} ORDER BY 1, 2`).all()));

  return Object.fromEntries(
    tables.map((table, index) => [
      table,
      rows[index]!.results.map((row) =>
        Object.fromEntries(Object.entries(row as Record<string, unknown>).filter(([key]) => key !== 'source_pending')),
      ),
    ]),
  );
}

describe('migration 0015', () => {
  test('drops the column, and keeps every row, the rows pointing at them, and the next id', async () => {
    await seed();

    const before = await everyRow();

    await env.DB.batch(MIGRATION.queries.map((query) => env.DB.prepare(query)));

    expect(await columns()).not.toContain('source_pending');
    expect(await everyRow()).toEqual(before);
    expect((await env.DB.prepare('PRAGMA foreign_key_check').all()).results).toEqual([]);
    expect(
      await env.DB.prepare("SELECT seq FROM sqlite_sequence WHERE name = 'footprints_event'").first<{ seq: number }>(),
    ).toEqual({ seq: 271 });
  });

  test('still refuses a member row for an event that does not exist', async () => {
    await seed();
    await env.DB.batch(MIGRATION.queries.map((query) => env.DB.prepare(query)));

    await expect(
      env.DB.prepare(`INSERT INTO footprints_event_member (event_id, channel_id) VALUES (999, 'UCa')`).run(),
    ).rejects.toThrow(/FOREIGN KEY/);
  });
});
