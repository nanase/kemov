-- Subscriber count milestones the admin site records and publishes (#225).
--
-- channel_snapshot keeps 30 days at most (#222, #223), so the long history of
-- a member's subscriber count is kept here instead: numbers a member, the
-- project or a listener announced, each entered by a person with its
-- sources. Nothing here is derived from the YouTube API (#222).
--
-- One milestone is one row. `reached_date` is the day (or month) the count
-- was reached, not the day of a celebration stream; the stream, when there
-- was one, is a footprints event this row can point at through `event_id`.
-- `subscriber_count` is a lower bound: by that date the channel had at least
-- that many.
CREATE TABLE subscriber_milestone (
  milestone_id     INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id       TEXT NOT NULL REFERENCES channel (channel_id),
  date_precision   TEXT NOT NULL CHECK (date_precision IN ('day', 'month')),
  -- The Japan-time calendar date. 'YYYY-MM' when date_precision is 'month'.
  reached_date     TEXT NOT NULL
    CHECK (CASE date_precision
             WHEN 'day'   THEN strftime('%Y-%m-%d', reached_date) IS reached_date
             WHEN 'month' THEN strftime('%Y-%m', reached_date || '-01') IS reached_date
           END),
  subscriber_count INTEGER NOT NULL CHECK (subscriber_count > 0),
  -- Who announced the number. A listener's post is accepted as a source, but
  -- its URL is never published (#225's decision 3).
  announced_by     TEXT NOT NULL CHECK (announced_by IN ('member', 'official', 'listener')),
  -- Optional. The worker accepts only an event whose kind is 'milestone'.
  event_id         INTEGER REFERENCES footprints_event (event_id),
  status           TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'published')),
  -- Never published.
  memo             TEXT,
  created_via      TEXT NOT NULL DEFAULT 'claude_code' CHECK (created_via IN ('claude_code', 'admin')),
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    CHECK (strftime('%Y-%m-%dT%H:%M:%SZ', created_at) IS created_at AND substr(created_at, 12, 2) <> '24'),
  updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    CHECK (strftime('%Y-%m-%dT%H:%M:%SZ', updated_at) IS updated_at AND substr(updated_at, 12, 2) <> '24')
) STRICT;

-- The sources backing one milestone, in display order.
CREATE TABLE subscriber_milestone_source (
  milestone_id INTEGER NOT NULL REFERENCES subscriber_milestone (milestone_id),
  position     INTEGER NOT NULL CHECK (position >= 1),
  url          TEXT NOT NULL CHECK (substr(url, 1, 8) = 'https://'),
  title        TEXT,
  PRIMARY KEY (milestone_id, position)
) STRICT, WITHOUT ROWID;

-- `revision.entity` and `publication.target` gain a value each. SQLite cannot
-- change a CHECK in place, so both tables are rebuilt: a new table with the
-- wider CHECK, every row copied across with its own id, the old table
-- dropped and the new one renamed. Everything else - columns, defaults, the
-- other CHECKs, the foreign key and the four append-only triggers - is
-- written out again exactly as 0005_add_revision_and_publication.sql has it.
--
-- The foreign key from publication to revision is checked at the end of the
-- migration rather than statement by statement, since for a moment in the
-- middle `publication_new` names a table that is about to be renamed.
PRAGMA defer_foreign_keys = true;

CREATE TABLE revision_new (
  revision_id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity      TEXT NOT NULL
    CHECK (entity IN ('footprints_event', 'genet_stream', 'genet_tune', 'genet_person', 'channel',
                      'video_override', 'channel_snapshot_exclusion', 'subscriber_milestone')),
  entity_key  TEXT NOT NULL,
  action      TEXT NOT NULL CHECK (action IN ('import', 'publish', 'withdraw', 'save', 'delete')),
  body        TEXT CHECK (json_valid(body) AND json_type(body) = 'object'),
  created_via TEXT NOT NULL DEFAULT 'claude_code' CHECK (created_via IN ('claude_code', 'admin')),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    CHECK (strftime('%Y-%m-%dT%H:%M:%SZ', created_at) IS created_at AND substr(created_at, 12, 2) <> '24'),
  CHECK ((body IS NULL) = (action IN ('withdraw', 'delete')))
) STRICT;

INSERT INTO revision_new (revision_id, entity, entity_key, action, body, created_via, created_at)
  SELECT revision_id, entity, entity_key, action, body, created_via, created_at FROM revision ORDER BY revision_id;

CREATE TABLE publication_new (
  publication_id   INTEGER PRIMARY KEY AUTOINCREMENT,
  target           TEXT NOT NULL CHECK (target IN ('footprints', 'genet_music', 'subscriber_milestones')),
  last_revision_id INTEGER NOT NULL REFERENCES revision_new (revision_id),
  object_key       TEXT NOT NULL,
  byte_length      INTEGER NOT NULL CHECK (byte_length >= 0),
  published_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    CHECK (strftime('%Y-%m-%dT%H:%M:%SZ', published_at) IS published_at AND substr(published_at, 12, 2) <> '24')
) STRICT;

INSERT INTO publication_new (publication_id, target, last_revision_id, object_key, byte_length, published_at)
  SELECT publication_id, target, last_revision_id, object_key, byte_length, published_at FROM publication
   ORDER BY publication_id;

-- The next id either table hands out must stay where it was. The pending
-- lists compare revision_id against the last one published, so a revision id
-- handed out a second time could sit below it and never show as waiting.
-- Copying the rows sets each new table's counter to the largest id copied,
-- which is where the old one stands too as long as no row was ever removed -
-- the triggers say none was - but the old counter itself is carried over
-- rather than leaning on that.
DELETE FROM sqlite_sequence WHERE name IN ('revision_new', 'publication_new');

INSERT INTO sqlite_sequence (name, seq)
  SELECT name || '_new', seq FROM sqlite_sequence WHERE name IN ('revision', 'publication');

-- Dropping a table drops its triggers with it. publication goes first: it
-- holds the foreign key to revision.
DROP TABLE publication;
DROP TABLE revision;

-- Renaming revision_new also rewrites publication_new's foreign key to name
-- `revision`, and carries each table's sqlite_sequence row with it.
ALTER TABLE revision_new RENAME TO revision;
ALTER TABLE publication_new RENAME TO publication;

CREATE TRIGGER revision_no_update BEFORE UPDATE ON revision
BEGIN
  SELECT RAISE(ABORT, 'revision is append only');
END;

CREATE TRIGGER revision_no_delete BEFORE DELETE ON revision
BEGIN
  SELECT RAISE(ABORT, 'revision is append only');
END;

CREATE TRIGGER publication_no_update BEFORE UPDATE ON publication
BEGIN
  SELECT RAISE(ABORT, 'publication is append only');
END;

CREATE TRIGGER publication_no_delete BEFORE DELETE ON publication
BEGIN
  SELECT RAISE(ABORT, 'publication is append only');
END;
