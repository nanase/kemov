-- 「あとで」 is gone from ジェネット楽曲一覧 too (#277's decision 3, #284): a
-- stream is a draft or it is published, and the admin site no longer writes
-- `review`. The streams put off with it become drafts, which is what they
-- were before they were put off.
--
-- The table's CHECK still allows `review`, as footprints_event's does after
-- 0013: rebuilding genet_stream to drop it would mean taking aside every
-- performance and scene that points at it, for a value nothing writes any
-- more.
UPDATE genet_stream SET status = 'draft' WHERE status = 'review';
