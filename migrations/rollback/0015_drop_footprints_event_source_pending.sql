-- Undoes 0015_drop_footprints_event_source_pending.sql.
--
-- Read docs/guides/recovery.md first.
--
-- The marks set by hand before 0015 were not kept. Every event comes back
-- marked 出典の確認待ち, which is what a new event started as; the code this
-- rolls back to lets a mark be taken off once the sources are enough.

ALTER TABLE footprints_event ADD COLUMN source_pending INTEGER NOT NULL DEFAULT 1 CHECK (source_pending IN (0, 1));

DELETE FROM d1_migrations WHERE name = '0015_drop_footprints_event_source_pending.sql';
