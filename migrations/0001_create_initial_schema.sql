-- The schema the collector writes and the API reads (#58, #60).
--
-- Conventions this file sets, and that later migrations keep:
--
--   * Every table is STRICT, so an INTEGER column only ever holds an
--     integer: '2000' is converted to 2000 because that is lossless, and
--     'many' is refused outright. No count can sit in the database as
--     text the way it did in the spreadsheet.
--   * Every instant is UTC ISO 8601 at second precision,
--     'YYYY-MM-DDTHH:MM:SSZ', and a CHECK holds it to that shape: Unix
--     seconds, a UTC offset, a fractional second and a bare local time
--     are all refused. The system this replaces mixed Unix seconds with
--     ISO 8601 and could not tell them apart. Dates a human writes are
--     'YYYY-MM-DD'.
--     The patterns say '?' rather than '[0-9]' because D1 caps how long
--     a GLOB pattern may be, so the shape is checked and the digits are
--     not.
--   * A CHECK passes when it evaluates to NULL, so a nullable column
--     needs no "IS NULL OR" of its own.
--   * A missing measurement is NULL. Never -1, never ''. Why it is
--     missing is collect_task's business, not the column's.
--   * Nothing here stores a rate of change. Per-hour and per-day figures
--     are computed from channel_snapshot when they are asked for, so the
--     way they are computed can change without refetching anything.

-- Who the streamers are. Deleting a row is refused for as long as any
-- snapshot or video points at it: channels.yml (#61) is synced on every
-- deploy, and one line dropped from it must not take years of history
-- with it. A streamer who stops gets an activity_end_date, not a delete.
CREATE TABLE channel (
  -- Mastered by channels.yml. The deploy writes these and nothing else
  -- does, so it has to upsert them by name rather than replace the row.
  channel_id          TEXT NOT NULL PRIMARY KEY,
  name                TEXT NOT NULL,
  fullname            TEXT NOT NULL,
  globalname          TEXT,
  twitter             TEXT,
  color_key           TEXT NOT NULL,
  color_sub           TEXT NOT NULL,
  color_light         TEXT NOT NULL,
  color_back          TEXT NOT NULL,
  activity_start_date TEXT NOT NULL CHECK (activity_start_date GLOB '????-??-??'),
  -- NULL while the streamer is active.
  activity_end_date   TEXT CHECK (activity_end_date GLOB '????-??-??'),

  -- Current values from Channels.list, written by the collector rather
  -- than by the YAML. NULL until the first fetch succeeds.
  custom_url          TEXT,
  -- Channels.list returns three sizes with their dimensions; every place
  -- the site shows a channel asks for the default one, so only that URL
  -- is kept. The others are one fetch away if a use for them appears.
  thumbnail_url       TEXT,
  fetched_at          TEXT CHECK (fetched_at GLOB '????-??-??T??:??:??Z')
) STRICT;

-- One row per channel per collection tick. This table is the history, so
-- nothing trims it and nothing aggregated is stored beside it. A row
-- exists only for a fetch that succeeded; a failed fetch writes no row
-- and leaves its trace in collect_task instead.
CREATE TABLE channel_snapshot (
  channel_id       TEXT NOT NULL REFERENCES channel (channel_id),
  -- The tick this reading belongs to, not the instant the call returned.
  -- Every channel in one run shares the value, so a query can line the
  -- channels up by it and compare like with like.
  fetched_at       TEXT NOT NULL CHECK (fetched_at GLOB '????-??-??T??:??:??Z'),
  -- NULL when the channel hides the count. YouTube reports 0 in that
  -- case, which cannot be told apart from a channel that truly has none.
  subscriber_count INTEGER CHECK (subscriber_count >= 0),
  view_count       INTEGER NOT NULL CHECK (view_count >= 0),
  video_count      INTEGER NOT NULL CHECK (video_count >= 0),

  PRIMARY KEY (channel_id, fetched_at)
) STRICT;

-- The primary key already serves one channel's history. This serves the
-- other direction: the newest tick across every channel.
CREATE INDEX channel_snapshot_fetched_at ON channel_snapshot (fetched_at);

-- The current value of each video. Superseded values are not kept here.
CREATE TABLE video (
  video_id               TEXT NOT NULL PRIMARY KEY,
  channel_id             TEXT NOT NULL REFERENCES channel (channel_id),
  title                  TEXT NOT NULL,
  published_at           TEXT NOT NULL CHECK (published_at GLOB '????-??-??T??:??:??Z'),

  -- 'unavailable' is spelled out in full. The front end currently reads
  -- it as 'unavalable'; that reader is replaced in #69, and nothing
  -- writes the misspelling here in the meantime.
  availability           TEXT NOT NULL
    CHECK (availability IN ('public', 'membership', 'private', 'unavailable')),
  live_broadcast_content TEXT NOT NULL
    CHECK (live_broadcast_content IN ('none', 'upcoming', 'live')),
  -- NULL until the length is known, because the kind depends on it: a
  -- video of 60 seconds or less is a short (#64).
  type                   TEXT CHECK (type IN ('video', 'streaming', 'shorts')),
  duration_seconds       INTEGER CHECK (duration_seconds >= 0),

  -- NULL means not collected yet, or hidden by the uploader.
  view_count             INTEGER CHECK (view_count >= 0),
  like_count             INTEGER CHECK (like_count >= 0),
  comment_count          INTEGER CHECK (comment_count >= 0),
  chat_message_count     INTEGER CHECK (chat_message_count >= 0),
  chat_unique_user_count INTEGER CHECK (chat_unique_user_count >= 0),

  -- Set for streams only.
  scheduled_start_time   TEXT CHECK (scheduled_start_time GLOB '????-??-??T??:??:??Z'),
  actual_start_time      TEXT CHECK (actual_start_time GLOB '????-??-??T??:??:??Z'),
  actual_end_time        TEXT CHECK (actual_end_time GLOB '????-??-??T??:??:??Z'),

  fetched_at             TEXT NOT NULL CHECK (fetched_at GLOB '????-??-??T??:??:??Z')
) STRICT;

-- One channel's videos, newest first, which is how the list is paged.
CREATE INDEX video_channel_published_at ON video (channel_id, published_at DESC);

-- Live and upcoming streams are a handful of rows among thousands, so
-- the index holds only those.
CREATE INDEX video_live ON video (live_broadcast_content, scheduled_start_time)
  WHERE live_broadcast_content <> 'none';

-- What has been collected, what has not, and where to carry on. This
-- table replaces the -1 the old system wrote into a cell to give up: a
-- failure pushes next_attempt_at further out and stays in the queue, so
-- no failure turns into a permanent gap.
CREATE TABLE collect_task (
  -- Adding a job means adding a migration. That is the point: a
  -- misspelled kind would match no scheduler query, raise no error, and
  -- sit at 'pending' forever.
  kind            TEXT NOT NULL
    CHECK (kind IN ('channel_stats', 'video_discover', 'video_update', 'chat_replay')),
  -- A channel id or a video id, depending on kind.
  target_id       TEXT NOT NULL,
  -- 'done' and 'unavailable' are settled; 'unavailable' means the thing
  -- was confirmed absent, which is an answer rather than a surrender.
  state           TEXT NOT NULL
    CHECK (state IN ('pending', 'running', 'done', 'unavailable', 'failed')),
  attempts        INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  -- When the scheduler may take this row again. While state is 'running'
  -- it is the lease deadline, so a worker that dies mid-task is picked up
  -- by the same query that picks up 'pending' and 'failed'.
  next_attempt_at TEXT CHECK (next_attempt_at GLOB '????-??-??T??:??:??Z'),
  -- Where to carry on from. The chat collector keeps its continuation
  -- token here (#65).
  cursor          TEXT,
  updated_at      TEXT NOT NULL CHECK (updated_at GLOB '????-??-??T??:??:??Z'),

  PRIMARY KEY (kind, target_id)
) STRICT;

-- The scheduler's one read: work of a single kind that is due, oldest
-- deadline first. Settled rows stay out of the index entirely.
CREATE INDEX collect_task_due ON collect_task (kind, next_attempt_at)
  WHERE state IN ('pending', 'running', 'failed');

-- Scratch space for counting the distinct chat authors of one video.
-- Rows live only while that video's chat_replay task runs and are deleted
-- once it settles (#65); the count itself lands in
-- video.chat_unique_user_count. The primary key is the whole row, so the
-- table is WITHOUT ROWID and stores it once rather than twice.
CREATE TABLE chat_author (
  video_id  TEXT NOT NULL REFERENCES video (video_id),
  author_id TEXT NOT NULL,

  PRIMARY KEY (video_id, author_id)
) STRICT, WITHOUT ROWID;
