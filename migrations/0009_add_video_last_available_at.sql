-- When a video that can no longer be fetched was last fetched (#223).
--
-- YouTube API Services' Developer Policies keep data taken without the
-- owner's authorisation for 30 days at most, and #222 decided that a video
-- the API stops returning - deleted or made private - is deleted 30 days
-- after that. Nothing recorded the day. `fetched_at` moves on every check,
-- including the ones that find the video gone, and so does
-- `collect_task.updated_at`.
--
-- The instant kept is the last successful fetch rather than the first
-- failed one: the row's values are from then, so that is when their 30 days
-- began. NULL while the video is available, since `fetched_at` already says
-- the same thing then. worker/src/collector/retention.ts reads a NULL on an
-- unavailable row as already past the limit, which is what a row restored
-- from a backup older than this column gets.
ALTER TABLE video ADD COLUMN last_available_at TEXT
  CHECK (last_available_at IS NULL
      OR (availability = 'unavailable'
          AND strftime('%Y-%m-%dT%H:%M:%SZ', last_available_at) IS last_available_at
          AND substr(last_available_at, 12, 2) <> '24'));

-- The 73 videos production had as unavailable on 2026-09-25. Every one had
-- missed 18 to 20 sweeps in a row by then, and a sweep comes round inside a
-- day and a half, so none of them had been fetched since collection began on
-- 2026-09-07. Earlier than the truth is the side a guess may err on: it
-- deletes a video a little early rather than keeping one too long.
UPDATE video SET last_available_at = '2026-09-07T00:00:00Z' WHERE availability = 'unavailable';
