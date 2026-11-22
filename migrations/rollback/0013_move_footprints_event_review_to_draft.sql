-- Undoes 0013_move_footprints_event_review_to_draft.sql.
--
-- Read docs/guides/recovery.md first.
--
-- Only the record of the migration is undone. Which drafts were put off with
-- 「あとで」 was not kept, so they stay drafts: the 確認待ち screen this rolls
-- back to lists a draft that has never been published as well, so each one
-- is still there to be looked at, only no longer behind the rest.

DELETE FROM d1_migrations WHERE name = '0013_move_footprints_event_review_to_draft.sql';
