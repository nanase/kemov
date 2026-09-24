-- Undoes 0004_add_admin_overrides_and_twitch.sql.
--
-- Read docs/guides/recovery.md first.

ALTER TABLE channel DROP COLUMN twitch;
ALTER TABLE collect_task DROP COLUMN checked_at;
DROP TABLE channel_snapshot_exclusion;
DROP TABLE video_override;

DELETE FROM d1_migrations WHERE name = '0004_add_admin_overrides_and_twitch.sql';
