-- Undoes 0018_add_genet_tune_edit_version.sql.
--
-- Read docs/guides/recovery.md first.
--
-- The code this rolls back to neither reads nor writes `genet_tune.edit_version`,
-- so nothing is lost but the count itself.

ALTER TABLE genet_tune DROP COLUMN edit_version;

DELETE FROM d1_migrations WHERE name = '0018_add_genet_tune_edit_version.sql';
