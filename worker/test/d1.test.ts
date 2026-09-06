import { env } from 'cloudflare:test';

// What these check is the binding and the schema, not any one query: the rest
// of the worker's tests are only worth anything if env.DB is the D1 the deploy
// gets and migrations/ has been applied to it. Nothing here names a table, so
// the schema stays #60's to change.
describe('the D1 binding', () => {
  test('answers a query', async () => {
    expect(await env.DB.prepare('SELECT 1 AS one').first()).toEqual({ one: 1 });
  });

  test('rejects SQL that SQLite does not accept', async () => {
    await expect(env.DB.prepare('SELECT FROM').first()).rejects.toThrow();
  });
});

describe('migrations', () => {
  // Guards the two below: an empty migrations/ would let them pass while
  // proving nothing.
  test('are there to apply', () => {
    expect(env.TEST_MIGRATIONS.length).toBeGreaterThan(0);
  });

  test('are all recorded as applied', async () => {
    const applied = await env.DB.prepare('SELECT name FROM d1_migrations ORDER BY id').all<{ name: string }>();

    expect(applied.results.map(({ name }) => name)).toEqual(env.TEST_MIGRATIONS.map(({ name }) => name));
  });

  // d1_migrations is excluded because it is applyD1Migrations' own
  // bookkeeping, and is there whether or not the migrations created anything.
  test('leave a schema behind', async () => {
    const tables = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != 'd1_migrations'",
    ).all<{ name: string }>();

    expect(tables.results).not.toEqual([]);
  });
});
