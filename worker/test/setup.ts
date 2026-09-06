import { applyD1Migrations, env } from 'cloudflare:test';

// Every test file gets its own D1, with the schema migrations/ describes
// applied before that file's first test.
//
// The database is per FILE, not per test. Writes made by one test are still
// there for the next test in the same file, and rows seeded here last the
// whole file. Nothing rolls back between tests, and pool-workers 0.22.0 offers
// no option to make it - the isolatedStorage of older versions and of its
// README is gone from the schema, and passing it is silently ignored. Tests
// that need an empty table clear it themselves in beforeEach.
//
// Files do not see each other's writes, whatever order they run in and whether
// or not they share a worker. Measured, not assumed.
//
// Migrations are read from disk by vitest.config.ts and handed over as
// TEST_MIGRATIONS, because nothing running on workerd can read a file.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
