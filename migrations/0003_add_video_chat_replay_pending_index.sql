-- Adds the index that lets enqueueEndedStreams (worker/src/collector/chat-replay.ts)
-- find ended streams without chat counts yet, instead of scanning `video` (#83).
--
-- `chat_message_count IS NULL` is 3% of `video` in production (210 of 6,442 rows
-- measured 2026-09-10), so a partial index on just those rows lets SQLite search
-- instead of scan.
CREATE INDEX video_chat_replay_pending ON video (actual_end_time) WHERE chat_message_count IS NULL;
