-- The URL prefixes a footprints event's source may point at and still count
-- as one source enough by itself (#141's "出典のホワイトリスト"), moved out
-- of worker/src/lib/source-whitelist.ts (#175). The list changes as partners
-- appear, which is data rather than code.
--
-- Matched by prefix, so a row naming an account or a specific article covers
-- everything under it; what may follow the prefix is decided by
-- isWhitelistedSource, not here. `prefix` is the primary key rather than a
-- generated id so that restoring a backup file into a database this
-- migration has already seeded is a no-op for a prefix both hold, whatever
-- order the two were written in. The table keeps its rowid, which is what
-- the list is shown in: the order entries were added, seeded ones first.
--
-- The length check refuses `https://` alone, which ends in `/` and would
-- accept every https URL there is.
CREATE TABLE source_whitelist (
  prefix     TEXT NOT NULL PRIMARY KEY
    CHECK (substr(prefix, 1, 8) = 'https://' AND length(prefix) > 8),
  -- Why it is on the list.
  note       TEXT CHECK (note <> ''),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    CHECK (strftime('%Y-%m-%dT%H:%M:%SZ', created_at) IS created_at AND substr(created_at, 12, 2) <> '24'),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    CHECK (strftime('%Y-%m-%dT%H:%M:%SZ', updated_at) IS updated_at AND substr(updated_at, 12, 2) <> '24')
) STRICT;

-- The 13 entries the constant held, decided by the project owner on
-- 2026-09-15 (#141). Every entry was confirmed against the source it names
-- at that time - a domain moving or a page being renamed is not something
-- this list tracks on its own. In the constant's own order. Nothing added,
-- nothing dropped.
--
-- `note` carries the category the constant's comments grouped them under.
-- What did not fit in a category is kept below as those comments were
-- written, since the constant is deleted with this change and this is the
-- only place left to read why each group is here.
INSERT INTO source_whitelist (prefix, note) VALUES
  -- 公式 - the project's own domains and its official social accounts.
  ('https://kemov-project.com/', '公式'),
  ('https://www.kemov-project.com/', '公式'),
  ('https://kemono-friends.jp/', '公式'),
  ('https://x.com/KEMOVP_staff', '公式'),
  ('https://twitter.com/KEMOVP_staff', '公式'),
  ('https://kemovproject.stores.jp/', '公式'),

  -- 運営会社・提携先の発表 - press releases and partner pages for a
  -- collaboration. "など" in the decision means this category is expected to
  -- grow as new partners appear; the three named here are what was decided.
  ('https://prtimes.jp/', '運営会社・提携先の発表'),
  ('https://kyodonewsprwire.jp/', '運営会社・提携先の発表'),
  ('https://shop.joysound.com/', '運営会社・提携先の発表'),

  -- 出演イベントの主催者
  ('https://vtube.tokyo/', '出演イベントの主催者'),

  -- ファンの Wiki・大百科 - unofficial, but treated as a source because #141
  -- named these two specifically rather than fan wikis in general.
  ('https://wikiwiki.jp/kemo_v/', 'ファンの Wiki・大百科'),
  ('https://dic.nicovideo.jp/a/%E3%81%91%E3%82%82%E3%81%AE%E3%83%95%E3%83%AC%E3%83%B3%E3%82%BAv%E3%81%B7%E3%82%8D%E3%81%98%E3%81%87%E3%81%8F%E3%81%A8', 'ファンの Wiki・大百科'),
  ('https://virtualyoutuber.fandom.com/wiki/KemoV', 'ファンの Wiki・大百科');
