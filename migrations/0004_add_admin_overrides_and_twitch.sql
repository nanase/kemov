-- Foundations for the admin site's overrides on top of collected data, and
-- for making `channel` the source of truth for one more field (#144).
--
-- `video_override` lets a person correct one video's title, type or
-- availability without touching the collector's own row. A NULL column
-- falls back to whatever the collector last wrote; the trailing CHECK
-- refuses a row that overrides nothing.
CREATE TABLE video_override (
  video_id     TEXT NOT NULL PRIMARY KEY REFERENCES video (video_id),
  title        TEXT CHECK (title <> ''),
  type         TEXT CHECK (type IN ('video', 'streaming', 'shorts')),
  availability TEXT CHECK (availability IN ('public', 'membership', 'private', 'unavailable')),
  memo         TEXT,
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    CHECK (strftime('%Y-%m-%dT%H:%M:%SZ', updated_at) IS updated_at
       AND substr(updated_at, 12, 2) <> '24'),
  CHECK (title IS NOT NULL OR type IS NOT NULL OR availability IS NOT NULL)
) STRICT;

-- Marks one channel's one collection tick as excluded from aggregation. The
-- composite foreign key ties it to a `channel_snapshot` row that must
-- already exist, so a tick that never landed cannot be excluded.
CREATE TABLE channel_snapshot_exclusion (
  channel_id TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  reason     TEXT NOT NULL CHECK (reason <> ''),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    CHECK (strftime('%Y-%m-%dT%H:%M:%SZ', created_at) IS created_at
       AND substr(created_at, 12, 2) <> '24'),
  PRIMARY KEY (channel_id, fetched_at),
  FOREIGN KEY (channel_id, fetched_at) REFERENCES channel_snapshot (channel_id, fetched_at)
) STRICT, WITHOUT ROWID;

-- When a person acknowledged a failing task from the admin site.
-- `channel-stats.ts` and `video.ts` clear this back to NULL the next time
-- collection for that row succeeds (collectedStatement in both files), so an
-- acknowledged failure drops off the admin site's list and a fresh one
-- reappears in it rather than staying hidden.
ALTER TABLE collect_task ADD COLUMN checked_at TEXT
  CHECK (strftime('%Y-%m-%dT%H:%M:%SZ', checked_at) IS checked_at
     AND substr(checked_at, 12, 2) <> '24');

-- Moves the Twitch handle out of channels.yml and into `channel`, which
-- becomes its master. See the accompanying seed change, which stops writing
-- over an existing row on every deploy.
ALTER TABLE channel ADD COLUMN twitch TEXT;
