-- Undoes 0012_add_footprints_event_memorial_day.sql.
--
-- Read docs/guides/recovery.md first.
--
-- footprints_event is rebuilt back to 0006's CHECK, the same way 0012 rebuilt
-- it. That CHECK cannot hold `memorial_day`, so every such event becomes
-- `other`: this file LOSES which events were 記念日. Every row is copied with
-- its own id, and the rows pointing at them are taken aside and put back as
-- 0012 does.
--
-- `revision` is append-only, so a `publish` whose body says `memorial_day`
-- keeps saying it. Withdraw every 記念日 event before running this: the page
-- this rolls back to refuses the whole JSON over one kind it does not know,
-- and the next 「いま公開する」 would write one.

CREATE TABLE footprints_event_member_aside AS SELECT * FROM footprints_event_member;
CREATE TABLE footprints_event_source_aside AS SELECT * FROM footprints_event_source;
-- A milestone keeps its row: subscriber_milestone_source points at it in
-- turn. Only the link to the event is taken aside, which may be NULL.
CREATE TABLE subscriber_milestone_event_aside AS
  SELECT milestone_id, event_id FROM subscriber_milestone WHERE event_id IS NOT NULL;

DELETE FROM footprints_event_member;
DELETE FROM footprints_event_source;
UPDATE subscriber_milestone SET event_id = NULL WHERE event_id IS NOT NULL;

CREATE TABLE footprints_event_new (
  event_id       INTEGER PRIMARY KEY AUTOINCREMENT,
  date_precision TEXT NOT NULL CHECK (date_precision IN ('day', 'month')),
  -- The Japan-time calendar date. 'YYYY-MM' when date_precision is 'month'.
  start_date     TEXT NOT NULL
    CHECK (CASE date_precision
             WHEN 'day'   THEN strftime('%Y-%m-%d', start_date) IS start_date
             WHEN 'month' THEN strftime('%Y-%m', start_date || '-01') IS start_date
           END),
  -- Only when the time of day is known. Stored in UTC; its Japan-time date
  -- must equal start_date, and it can only be set when date_precision is
  -- 'day'.
  starts_at      TEXT
    CHECK (starts_at IS NULL
        OR (strftime('%Y-%m-%dT%H:%M:%SZ', starts_at) IS starts_at
            AND substr(starts_at, 12, 2) <> '24'
            AND date_precision = 'day'
            AND date(starts_at, '+9 hours') IS start_date)),
  end_date       TEXT
    CHECK ((strftime('%Y-%m-%d', end_date) IS end_date
         OR strftime('%Y-%m', end_date || '-01') IS end_date)
       AND end_date >= start_date),
  kind           TEXT NOT NULL
    CHECK (kind IN ('project', 'announcement', 'debut', '3d', 'new_outfit', 'real_event', 'goods',
                    'music', 'collab', 'media', 'milestone', 'graduation', 'anniversary', 'other')),
  emphasized     INTEGER NOT NULL DEFAULT 0 CHECK (emphasized IN (0, 1)),
  title          TEXT NOT NULL,
  place          TEXT,
  supplement     TEXT,
  -- No foreign key: the video can belong to a channel other than one of the
  -- event's members.
  video_id       TEXT,
  source_pending INTEGER NOT NULL DEFAULT 1 CHECK (source_pending IN (0, 1)),
  status         TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'published')),
  -- Never published.
  memo           TEXT,
  created_via    TEXT NOT NULL DEFAULT 'claude_code' CHECK (created_via IN ('claude_code', 'admin')),
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    CHECK (strftime('%Y-%m-%dT%H:%M:%SZ', created_at) IS created_at AND substr(created_at, 12, 2) <> '24'),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    CHECK (strftime('%Y-%m-%dT%H:%M:%SZ', updated_at) IS updated_at AND substr(updated_at, 12, 2) <> '24')
) STRICT;


INSERT INTO footprints_event_new
  (event_id, date_precision, start_date, starts_at, end_date, kind, emphasized, title, place, supplement, video_id,
   source_pending, status, memo, created_via, created_at, updated_at)
  SELECT event_id, date_precision, start_date, starts_at, end_date,
         CASE kind WHEN 'memorial_day' THEN 'other' ELSE kind END,
         emphasized, title, place, supplement, video_id,
         source_pending, status, memo, created_via, created_at, updated_at
    FROM footprints_event
   ORDER BY event_id;

-- The next id handed out must stay where it was: an id handed out a second
-- time would collide with the history `revision` keeps under it.
DELETE FROM sqlite_sequence WHERE name = 'footprints_event_new';

INSERT INTO sqlite_sequence (name, seq)
  SELECT 'footprints_event_new', seq FROM sqlite_sequence WHERE name = 'footprints_event';

DROP TABLE footprints_event;

-- The foreign keys of the three tables above name `footprints_event`, so
-- once this is renamed they point at it again.
ALTER TABLE footprints_event_new RENAME TO footprints_event;

INSERT INTO footprints_event_member SELECT * FROM footprints_event_member_aside;
INSERT INTO footprints_event_source SELECT * FROM footprints_event_source_aside;
UPDATE subscriber_milestone
   SET event_id = (SELECT a.event_id FROM subscriber_milestone_event_aside a
                    WHERE a.milestone_id = subscriber_milestone.milestone_id)
 WHERE milestone_id IN (SELECT milestone_id FROM subscriber_milestone_event_aside);

DROP TABLE footprints_event_member_aside;
DROP TABLE footprints_event_source_aside;
DROP TABLE subscriber_milestone_event_aside;

DELETE FROM d1_migrations WHERE name = '0012_add_footprints_event_memorial_day.sql';
