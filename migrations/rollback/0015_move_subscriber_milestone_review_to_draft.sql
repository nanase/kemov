-- Undoes 0015_move_subscriber_milestone_review_to_draft.sql.
--
-- Read docs/guides/recovery.md first.
--
-- Only the record of the migration is undone. Which milestones were in
-- `review` was not kept, so they stay drafts, or published where their latest
-- revision is a `publish`: the screen this rolls back to lists them under
-- 下書き or 公開 instead of 確認中, and nothing else about them changes.

DELETE FROM d1_migrations WHERE name = '0015_move_subscriber_milestone_review_to_draft.sql';
