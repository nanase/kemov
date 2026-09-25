-- Undoes 0009_add_video_last_available_at.sql.
--
-- Read docs/guides/recovery.md first.

ALTER TABLE video DROP COLUMN last_available_at;

DELETE FROM d1_migrations WHERE name = '0009_add_video_last_available_at.sql';
