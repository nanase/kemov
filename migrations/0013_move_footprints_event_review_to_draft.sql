-- 「あとで」 is gone (#277's decision 3, #281): an event is a draft or it is
-- published, and the admin site no longer writes `review`. The events put off
-- with it become drafts, which is what they were before they were put off.
--
-- The table's CHECK still allows `review`. Rebuilding footprints_event to
-- drop it would mean taking aside every row that points at it, as 0012 does,
-- for a value nothing writes any more.
UPDATE footprints_event SET status = 'draft' WHERE status = 'review';
