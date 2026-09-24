-- Undoes 0008_add_source_whitelist.sql.
--
-- Read docs/guides/recovery.md first.

DROP TABLE source_whitelist;

DELETE FROM d1_migrations WHERE name = '0008_add_source_whitelist.sql';
