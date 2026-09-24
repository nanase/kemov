-- Undoes 0007_add_genet_music.sql.
--
-- Read docs/guides/recovery.md first.

DROP TABLE genet_scene;
DROP TABLE genet_performance;
DROP TABLE genet_stream;
DROP TABLE genet_tune_score;
DROP TABLE genet_tune_video;
DROP TABLE genet_tune_attribute_person;
DROP TABLE genet_tune_attribute;
DROP TABLE genet_tune;
DROP INDEX genet_person_link;
DROP TABLE genet_person;

DELETE FROM d1_migrations WHERE name = '0007_add_genet_music.sql';
