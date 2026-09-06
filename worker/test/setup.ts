import { applyD1Migrations, env } from 'cloudflare:test';

// Every test file gets the schema migrations/ describes, applied to the real
// D1 binding before the first test runs. Storage is isolated per test, but the
// database this seeds is the one every test then sees.
//
// Migrations are read from disk by vitest.config.ts and handed over as
// TEST_MIGRATIONS, because nothing running on workerd can read a file.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
