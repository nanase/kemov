-- Whether a public JSON may be behind `revision` (#281). Every write of the
-- JSON is counted in `started` before it is sent to R2, and `confirmed` is
-- set to that count only once the JSON was checked against `revision` and
-- found to be the request's own and up to date. While `confirmed` is less
-- than `started`, a write was sent that nobody has checked since: it may
-- have failed after R2 took it, or been written over, and the 公開 screen
-- offers 「いま公開する」 to build the JSON again from `revision`.
--
-- Counted before the write rather than after, so a D1 that cannot record
-- the count stops the write instead of leaving one unaccounted for. And
-- `confirmed` takes a count only while it is still the newest: a request
-- whose write was followed by another's cannot say the newer one was checked.
CREATE TABLE publication_write (
  target    TEXT PRIMARY KEY CHECK (target IN ('footprints', 'genet_music', 'subscriber_milestones')),
  started   INTEGER NOT NULL CHECK (started >= 1),
  confirmed INTEGER NOT NULL DEFAULT 0 CHECK (confirmed >= 0 AND confirmed <= started)
) STRICT;
