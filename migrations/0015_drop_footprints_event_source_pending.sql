-- 「出典の確認待ち」 is judged, not marked (#277's decision 2, #282): whether
-- an event's sources are enough is worked out from its sources and the
-- whitelist each time the public JSON is written, and the admin screen works
-- it out the same way as they are typed. Nothing reads or writes the mark.
--
-- DROP COLUMN rather than rebuilding the table as 0012 does: SQLite drops a
-- column whose only CHECK is its own, and leaves the rows that point at
-- footprints_event by foreign key where they are.
ALTER TABLE footprints_event DROP COLUMN source_pending;
