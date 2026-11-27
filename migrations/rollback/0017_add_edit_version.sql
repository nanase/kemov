-- Undoes 0017_add_edit_version.sql.
--
-- Read docs/guides/recovery.md first.
--
-- The code this rolls back to neither reads nor writes `edit_version`, so
-- nothing is lost but the count itself.

ALTER TABLE footprints_event DROP COLUMN edit_version;
ALTER TABLE subscriber_milestone DROP COLUMN edit_version;
ALTER TABLE genet_stream DROP COLUMN edit_version;

DELETE FROM d1_migrations WHERE name = '0017_add_edit_version.sql';
