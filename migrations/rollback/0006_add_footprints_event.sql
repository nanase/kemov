-- Undoes 0006_add_footprints_event.sql.
--
-- Read docs/guides/recovery.md first.

DROP TABLE footprints_event_source;
DROP TABLE footprints_event_member;
DROP TABLE footprints_event;

DELETE FROM d1_migrations WHERE name = '0006_add_footprints_event.sql';
