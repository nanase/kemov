-- Which of an event's members it is about, rather than one who took part.
--
-- footprints_event_member lists everybody an event involved. A debut stream
-- with guests in it named the guests too, and the upcoming list on the
-- public timeline counted "N days since the debut" for every one of them:
-- シマハイイロギツネ's debut, which ケープペンギン and フンボルトペンギン
-- appeared in, gave all three a 2,000th day on 2026-12-02. Publishing a
-- debut now needs at least one lead (worker/src/admin/footprints-publish.ts).
ALTER TABLE footprints_event_member ADD COLUMN lead INTEGER NOT NULL DEFAULT 0 CHECK (lead IN (0, 1));

-- The debuts already recorded. A member's debut is the one on the day their
-- activity started, and on 2026-10-18 each of the 11 members had exactly one
-- debut on that day. A guest's own activity started on another day, which
-- is what leaves the guests out.
UPDATE footprints_event_member
   SET lead = 1
 WHERE EXISTS (SELECT 1
                 FROM footprints_event e
                 JOIN channel c ON c.channel_id = footprints_event_member.channel_id
                WHERE e.event_id = footprints_event_member.event_id
                  AND e.kind = 'debut'
                  AND e.date_precision = 'day'
                  AND e.start_date = c.activity_start_date);
