-- Undoes 0002_add_channel_display_order.sql.
--
-- Read "Rolling back" in README.md first.

ALTER TABLE channel DROP COLUMN display_order;

DELETE FROM d1_migrations WHERE name = '0002_add_channel_display_order.sql';
