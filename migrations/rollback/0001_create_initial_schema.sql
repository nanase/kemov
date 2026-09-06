-- Undoes 0001_create_initial_schema.sql, and destroys everything it held.
--
-- Read "Rolling back" in README.md first. For a database that has already
-- collected something, time travel is the way back; this file is for the
-- case where the schema has to go and the data is expendable, such as a
-- local database or a deployment that never got as far as its first tick.
--
-- Children before parents: the foreign keys refuse it in any other order.

DROP TABLE IF EXISTS chat_author;
DROP TABLE IF EXISTS collect_task;
DROP TABLE IF EXISTS channel_snapshot;
DROP TABLE IF EXISTS video;
DROP TABLE IF EXISTS channel;

-- Dropping a table takes its indexes with it, so they need no line here.

-- Without this, wrangler still counts 0001 as applied and skips it on the
-- next `migrations apply`, leaving a database with no tables that reports
-- itself as up to date.
DELETE FROM d1_migrations WHERE name = '0001_create_initial_schema.sql';
