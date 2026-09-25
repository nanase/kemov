-- Undoes 0010_add_subscriber_milestone.sql.
--
-- Read docs/guides/recovery.md first.
--
-- revision and publication are rebuilt back to 0005's CHECKs, the same way
-- 0010 rebuilt them. Their CHECKs cannot hold a row about a subscriber
-- milestone, so every such row is left out of the copy: this file LOSES the
-- history of every milestone and every publish of
-- `subscribers/milestones.json`. Every other row is copied with its own id.

PRAGMA defer_foreign_keys = true;

CREATE TABLE revision_old (
  revision_id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity      TEXT NOT NULL
    CHECK (entity IN ('footprints_event', 'genet_stream', 'genet_tune', 'genet_person', 'channel',
                      'video_override', 'channel_snapshot_exclusion')),
  entity_key  TEXT NOT NULL,
  action      TEXT NOT NULL CHECK (action IN ('import', 'publish', 'withdraw', 'save', 'delete')),
  body        TEXT CHECK (json_valid(body) AND json_type(body) = 'object'),
  created_via TEXT NOT NULL DEFAULT 'claude_code' CHECK (created_via IN ('claude_code', 'admin')),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    CHECK (strftime('%Y-%m-%dT%H:%M:%SZ', created_at) IS created_at AND substr(created_at, 12, 2) <> '24'),
  CHECK ((body IS NULL) = (action IN ('withdraw', 'delete')))
) STRICT;

INSERT INTO revision_old (revision_id, entity, entity_key, action, body, created_via, created_at)
  SELECT revision_id, entity, entity_key, action, body, created_via, created_at FROM revision
   WHERE entity <> 'subscriber_milestone'
   ORDER BY revision_id;

CREATE TABLE publication_old (
  publication_id   INTEGER PRIMARY KEY AUTOINCREMENT,
  target           TEXT NOT NULL CHECK (target IN ('footprints', 'genet_music')),
  last_revision_id INTEGER NOT NULL REFERENCES revision_old (revision_id),
  object_key       TEXT NOT NULL,
  byte_length      INTEGER NOT NULL CHECK (byte_length >= 0),
  published_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    CHECK (strftime('%Y-%m-%dT%H:%M:%SZ', published_at) IS published_at AND substr(published_at, 12, 2) <> '24')
) STRICT;

INSERT INTO publication_old (publication_id, target, last_revision_id, object_key, byte_length, published_at)
  SELECT publication_id, target, last_revision_id, object_key, byte_length, published_at FROM publication
   WHERE target <> 'subscriber_milestones'
   ORDER BY publication_id;

DELETE FROM sqlite_sequence WHERE name IN ('revision_old', 'publication_old');

INSERT INTO sqlite_sequence (name, seq)
  SELECT name || '_old', seq FROM sqlite_sequence WHERE name IN ('revision', 'publication');

DROP TABLE publication;
DROP TABLE revision;

ALTER TABLE revision_old RENAME TO revision;
ALTER TABLE publication_old RENAME TO publication;

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

DROP TABLE subscriber_milestone_source;
DROP TABLE subscriber_milestone;

DELETE FROM d1_migrations WHERE name = '0010_add_subscriber_milestone.sql';
