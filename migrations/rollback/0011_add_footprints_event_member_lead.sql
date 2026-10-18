-- Undoes 0011_add_footprints_event_member_lead.sql.
--
-- Read docs/guides/recovery.md first.

ALTER TABLE footprints_event_member DROP COLUMN lead;

DELETE FROM d1_migrations WHERE name = '0011_add_footprints_event_member_lead.sql';
