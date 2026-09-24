-- Undoes 0005_add_revision_and_publication.sql.
--
-- Read docs/guides/recovery.md first.

DROP TRIGGER publication_no_delete;
DROP TRIGGER publication_no_update;
DROP TABLE publication;
DROP TRIGGER revision_no_delete;
DROP TRIGGER revision_no_update;
DROP TABLE revision;

DELETE FROM d1_migrations WHERE name = '0005_add_revision_and_publication.sql';
