-- The Genet music list the admin site edits and publishes, replacing
-- streaming.yml (#144).
--
-- One composer, lyricist or other credited person, named once. The unique
-- index on `link` is not for speed - every new table here holds at most a
-- few hundred rows - it exists so the same Wikipedia article cannot end up
-- behind two different person rows.
CREATE TABLE genet_person (
  person_id INTEGER PRIMARY KEY AUTOINCREMENT,
  name      TEXT NOT NULL CHECK (name <> ''),
  -- 'wiki:記事' / 'wikien:記事' / 'https://...'
  link      TEXT CHECK (substr(link, 1, 5) = 'wiki:' OR substr(link, 1, 7) = 'wikien:' OR substr(link, 1, 8) = 'https://'),
  memo      TEXT
) STRICT;

CREATE UNIQUE INDEX genet_person_link ON genet_person (link) WHERE link IS NOT NULL;

-- One tune's own material, shared across every stream that performs it.
CREATE TABLE genet_tune (
  tune_id        INTEGER PRIMARY KEY AUTOINCREMENT,
  title          TEXT NOT NULL CHECK (title <> ''),
  original_title TEXT,
  subtunes       TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(subtunes) AND json_type(subtunes) = 'array'),
  memo           TEXT
) STRICT;

-- One credit line for a tune, in display order. A row with no name is a
-- plain sentence (text only); a row with a name is either a list of people
-- or a sentence, decided by which of genet_tune_attribute_person and text is
-- present.
CREATE TABLE genet_tune_attribute (
  tune_id  INTEGER NOT NULL REFERENCES genet_tune (tune_id),
  position INTEGER NOT NULL CHECK (position >= 1),
  name     TEXT CHECK (name <> ''),
  text     TEXT CHECK (text <> ''),
  PRIMARY KEY (tune_id, position),
  CHECK (name IS NOT NULL OR text IS NOT NULL)
) STRICT, WITHOUT ROWID;

-- One person named in one credit line, in display order within it.
CREATE TABLE genet_tune_attribute_person (
  tune_id            INTEGER NOT NULL,
  attribute_position INTEGER NOT NULL,
  position           INTEGER NOT NULL CHECK (position >= 1),
  person_id          INTEGER NOT NULL REFERENCES genet_person (person_id),
  -- Only when this tune credits the person under a different name.
  credited_as        TEXT CHECK (credited_as <> ''),
  -- A note shown after the name, such as a relationship.
  note               TEXT CHECK (note <> ''),
  PRIMARY KEY (tune_id, attribute_position, position),
  FOREIGN KEY (tune_id, attribute_position) REFERENCES genet_tune_attribute (tune_id, position)
) STRICT, WITHOUT ROWID;

-- A video related to the tune itself rather than to one performance of it
-- (an official upload, for instance), in display order.
CREATE TABLE genet_tune_video (
  tune_id       INTEGER NOT NULL REFERENCES genet_tune (tune_id),
  position      INTEGER NOT NULL CHECK (position >= 1),
  video_id      TEXT NOT NULL,
  title         TEXT NOT NULL,
  start_seconds INTEGER CHECK (start_seconds >= 0),
  description   TEXT,
  PRIMARY KEY (tune_id, position)
) STRICT, WITHOUT ROWID;

-- A sheet music link for the tune, in display order.
CREATE TABLE genet_tune_score (
  tune_id  INTEGER NOT NULL REFERENCES genet_tune (tune_id),
  position INTEGER NOT NULL CHECK (position >= 1),
  url      TEXT NOT NULL CHECK (substr(url, 1, 8) = 'https://'),
  title    TEXT NOT NULL,
  PRIMARY KEY (tune_id, position)
) STRICT, WITHOUT ROWID;

-- One stream, the unit the admin site edits and publishes. `status` lives
-- here and nowhere else in this schema. `url` is set only for a platform
-- other than YouTube, where video_id is not itself a URL.
CREATE TABLE genet_stream (
  video_id     TEXT NOT NULL PRIMARY KEY,
  platform     TEXT NOT NULL DEFAULT 'youtube' CHECK (platform IN ('youtube', 'tiktok')),
  url          TEXT CHECK (substr(url, 1, 8) = 'https://'),
  video_type   TEXT NOT NULL CHECK (video_type IN ('live', 'video', 'short')),
  title        TEXT NOT NULL,
  short_title  TEXT,
  published_at TEXT NOT NULL
    CHECK (strftime('%Y-%m-%dT%H:%M:%SZ', published_at) IS published_at AND substr(published_at, 12, 2) <> '24'),
  categories   TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(categories) AND json_type(categories) = 'array'),
  keywords     TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(keywords) AND json_type(keywords) = 'array'),
  status       TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'published')),
  memo         TEXT,
  created_via  TEXT NOT NULL DEFAULT 'claude_code' CHECK (created_via IN ('claude_code', 'admin')),
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    CHECK (strftime('%Y-%m-%dT%H:%M:%SZ', created_at) IS created_at AND substr(created_at, 12, 2) <> '24'),
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    CHECK (strftime('%Y-%m-%dT%H:%M:%SZ', updated_at) IS updated_at AND substr(updated_at, 12, 2) <> '24'),
  CHECK ((platform = 'youtube') = (url IS NULL))
) STRICT;

-- One line of a stream's tune list, in display order.
CREATE TABLE genet_performance (
  video_id    TEXT NOT NULL REFERENCES genet_stream (video_id),
  position    INTEGER NOT NULL CHECK (position >= 1),
  tune_id     INTEGER NOT NULL REFERENCES genet_tune (tune_id),
  description TEXT,
  PRIMARY KEY (video_id, position)
) STRICT, WITHOUT ROWID;

-- One way a performance was carried out. A performance can have more than
-- one - the same tune played as BGM and as a violin solo both belong to it -
-- which is why this is not a column on genet_performance itself.
-- scene_video_id may point at a video other than the stream's own.
CREATE TABLE genet_scene (
  video_id       TEXT NOT NULL,
  position       INTEGER NOT NULL,
  scene_position INTEGER NOT NULL CHECK (scene_position >= 1),
  style          TEXT NOT NULL CHECK (style IN ('play', 'sing', 'bgm', 'talk')),
  scene_video_id TEXT NOT NULL,
  -- NULL for a BGM or talk scene with no single moment to point at.
  start_seconds  INTEGER CHECK (start_seconds >= 0),
  PRIMARY KEY (video_id, position, scene_position),
  FOREIGN KEY (video_id, position) REFERENCES genet_performance (video_id, position)
) STRICT, WITHOUT ROWID;
