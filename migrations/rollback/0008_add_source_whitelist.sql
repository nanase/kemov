-- Undoes 0008_add_source_whitelist.sql.
--
-- Read "Rolling back" in README.md first.

DROP TABLE source_whitelist;

DELETE FROM d1_migrations WHERE name = '0008_add_source_whitelist.sql';
