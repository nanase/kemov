-- Undoes 0014_add_publication_write.sql.
--
-- Read docs/guides/recovery.md first.
--
-- What it held is lost: whether a public JSON may be behind `revision`. The
-- next publish of each target builds its JSON from `revision` again either way.

DROP TABLE publication_write;

DELETE FROM d1_migrations WHERE name = '0014_add_publication_write.sql';
