-- The writes of a public JSON that no check has yet found up to date
-- (#281). A row is added before each write is sent to R2, and taken away
-- only by the request that sent it, once its own check found the JSON its
-- own and up to date with `revision`. While a target has a row, a write may
-- have failed after R2 took it, or landed over a newer one, and the 公開
-- screen offers 「いま公開する」 to build the JSON again from `revision`.
--
-- Added before the write rather than after, so a D1 that cannot record it
-- stops the write instead of leaving one unaccounted for. One row per write,
-- not a count: a write still on its way to R2 must stay unaccounted for
-- while a later one is checked, or it could land after that check unseen.
--
-- `finished` is set once R2 has answered the write, either way. Another
-- request's check that passes clears a row it read as finished before it
-- looked at R2: that write landed before the JSON the check found, or not
-- at all. A row never finished - its request ended between the two - is
-- cleared the same way once it is older than any request lives.
CREATE TABLE publication_write (
  write_id   INTEGER PRIMARY KEY AUTOINCREMENT,
  target     TEXT NOT NULL CHECK (target IN ('footprints', 'genet_music', 'subscriber_milestones')),
  started_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    CHECK (strftime('%Y-%m-%dT%H:%M:%SZ', started_at) IS started_at AND substr(started_at, 12, 2) <> '24'),
  finished   INTEGER NOT NULL DEFAULT 0 CHECK (finished IN (0, 1))
) STRICT;

CREATE INDEX publication_write_target ON publication_write (target, started_at);
