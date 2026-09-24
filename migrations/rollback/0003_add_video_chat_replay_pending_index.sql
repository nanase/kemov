-- Undoes 0003_add_video_chat_replay_pending_index.sql.
--
-- Read docs/guides/recovery.md first.

DROP INDEX video_chat_replay_pending;

DELETE FROM d1_migrations WHERE name = '0003_add_video_chat_replay_pending_index.sql';
