-- The footprints timeline the admin site edits and publishes (#144, #140).
--
-- One event is one row. `date_precision` decides which shape `start_date`
-- must have: a full day, or just a month. `starts_at`, when known, is UTC
-- and is checked to land on the same Japan-time calendar day as
-- `start_date` - a stream that starts at 23:30 JST and one that starts the
-- next morning must not be able to disagree with the date they are filed
-- under.
CREATE TABLE footprints_event (
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

-- The members an event is about. Zero rows means the whole of けもV.
CREATE TABLE footprints_event_member (
  event_id   INTEGER NOT NULL REFERENCES footprints_event (event_id),
  channel_id TEXT NOT NULL REFERENCES channel (channel_id),
  PRIMARY KEY (event_id, channel_id)
) STRICT, WITHOUT ROWID;

-- The sources backing one event, in display order. Their combined presence
-- or absence is what source_pending records.
CREATE TABLE footprints_event_source (
  event_id INTEGER NOT NULL REFERENCES footprints_event (event_id),
  position INTEGER NOT NULL CHECK (position >= 1),
  url      TEXT NOT NULL CHECK (substr(url, 1, 8) = 'https://'),
  title    TEXT,
  PRIMARY KEY (event_id, position)
) STRICT, WITHOUT ROWID;
