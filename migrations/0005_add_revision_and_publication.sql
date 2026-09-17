-- The admin site's version history and its record of publishing (#144).
--
-- `revision` holds one row per save of an entity the admin site tracks.
-- It is append-only: the two triggers below refuse an UPDATE or a DELETE, so
-- a row's history can be trusted not to have been rewritten after the fact.
-- Every published JSON is built by reading the latest revision of each
-- entity, never by touching the working row directly, so writing over a
-- published row does not reach the public site until the next publish.
CREATE TABLE revision (
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

CREATE TRIGGER revision_no_update BEFORE UPDATE ON revision
BEGIN
  SELECT RAISE(ABORT, 'revision is append only');
END;

CREATE TRIGGER revision_no_delete BEFORE DELETE ON revision
BEGIN
  SELECT RAISE(ABORT, 'revision is append only');
END;

-- One row per time the admin site wrote a published JSON to R2. `revision`
-- is not trimmed, so this is what answers "what is live right now" without
-- scanning it: the newest row for a target names the revision the current
-- object in R2 was built from. Append-only for the same reason as
-- `revision`: rewriting or losing a row here would rewrite or lose the
-- record of what was live and when.
CREATE TABLE publication (
  publication_id   INTEGER PRIMARY KEY AUTOINCREMENT,
  target           TEXT NOT NULL CHECK (target IN ('footprints', 'genet_music')),
  last_revision_id INTEGER NOT NULL REFERENCES revision (revision_id),
  object_key       TEXT NOT NULL,
  byte_length      INTEGER NOT NULL CHECK (byte_length >= 0),
  published_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    CHECK (strftime('%Y-%m-%dT%H:%M:%SZ', published_at) IS published_at AND substr(published_at, 12, 2) <> '24')
) STRICT;

CREATE TRIGGER publication_no_update BEFORE UPDATE ON publication
BEGIN
  SELECT RAISE(ABORT, 'publication is append only');
END;

CREATE TRIGGER publication_no_delete BEFORE DELETE ON publication
BEGIN
  SELECT RAISE(ABORT, 'publication is append only');
END;
