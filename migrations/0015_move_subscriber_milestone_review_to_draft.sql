-- 「確認中」 is gone from 登録者数の節目 (#277's decisions 3 and 6-8, #283):
-- a milestone is a draft or it is published, as an event has been since
-- 0013, and the admin site no longer filters by `review`. A milestone left in
-- it becomes a draft.
--
-- The admin site never wrote `review` for a milestone, but a row written to
-- D1 directly may hold it. One whose latest revision is a `publish` may be in
-- the public JSON, so it becomes `published` instead: as a draft it could
-- not be withdrawn, and deleting it would leave it public for good.
--
-- The table's CHECK still allows `review`, for the reason 0013 gives:
-- rebuilding subscriber_milestone would mean taking aside every row that
-- points at it, for a value nothing writes any more.
UPDATE subscriber_milestone
   SET status = CASE
                  WHEN (SELECT action FROM revision
                         WHERE entity = 'subscriber_milestone' AND entity_key = CAST(milestone_id AS TEXT)
                         ORDER BY revision_id DESC LIMIT 1) = 'publish'
                  THEN 'published'
                  ELSE 'draft'
                END
 WHERE status = 'review';
