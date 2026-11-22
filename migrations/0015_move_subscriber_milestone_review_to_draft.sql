-- 「確認中」 is gone from 登録者数の節目 (#277's decisions 3 and 6-8, #283):
-- a milestone is a draft or it is published, as an event has been since
-- 0013, and the admin site no longer filters by `review`. A milestone left in
-- it becomes a draft.
--
-- The table's CHECK still allows `review`, for the reason 0013 gives:
-- rebuilding subscriber_milestone would mean taking aside every row that
-- points at it, for a value nothing writes any more.
UPDATE subscriber_milestone SET status = 'draft' WHERE status = 'review';
