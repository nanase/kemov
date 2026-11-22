-- Undoes 0014_add_publication_write.sql.
--
-- Read docs/guides/recovery.md first.
--
-- What it held is lost: which writes of a public JSON were never checked.
-- The next publish of each target builds its JSON from `revision` again
-- either way.

DROP INDEX publication_write_target;
DROP TABLE publication_write;

DELETE FROM d1_migrations WHERE name = '0014_add_publication_write.sql';
