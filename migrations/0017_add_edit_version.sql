-- A count of the writes to each row the admin site edits (#307).
--
-- Two screens that read the same row each sent their 保存, and the later one
-- wrote over the earlier without either screen knowing: a published row was
-- held to nothing but its status, and a draft to nothing at all. Every save,
-- 公開 and 非公開に戻す now adds 1 to `edit_version`, and sends back the one
-- its screen read: a row at any other count was written by another screen
-- since, and the write is refused with 409.
--
-- A draft's save logs no `revision`, so the newest revision cannot tell two
-- drafts' saves apart, which is why this is a column of its own. Rows that
-- exist start at 0, as a new row does.
ALTER TABLE footprints_event ADD COLUMN edit_version INTEGER NOT NULL DEFAULT 0 CHECK (edit_version >= 0);
ALTER TABLE subscriber_milestone ADD COLUMN edit_version INTEGER NOT NULL DEFAULT 0 CHECK (edit_version >= 0);
ALTER TABLE genet_stream ADD COLUMN edit_version INTEGER NOT NULL DEFAULT 0 CHECK (edit_version >= 0);
