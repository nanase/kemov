-- Members for a local D1 that has none yet (docs/guides/development.md).
--
-- Every name, id and colour here is made up. None of them is a real channel:
-- the ids follow the shape of a YouTube channel id (`UC` and 22 characters)
-- so the admin site accepts them, but they name nothing on YouTube, and a
-- collector run against them finds no channel. A member added here is
-- deleted from the admin site while nothing is recorded against it.
--
-- Safe to run again: a member already there is left as it is.
INSERT INTO channel (channel_id, name, fullname, globalname, twitter, twitch,
                     color_key, color_sub, color_light, color_back,
                     activity_start_date, activity_end_date, display_order)
VALUES
  ('UCdevmember01aaaaaaaaaaa', 'テスト 1', 'テストメンバー 1', 'Test Member 1', 'test_member_1', NULL,
   '#E5484D', '#F5A3A5', '#FDECEC', '#FFF7F7', '2021-04-01', NULL, 0),
  ('UCdevmember02bbbbbbbbbbb', 'テスト 2', 'テストメンバー 2', NULL, NULL, 'test_member_2',
   '#0091FF', '#8BC7FF', '#E6F4FE', '#F5FAFF', '2022-06-15', NULL, 1),
  ('UCdevmember03ccccccccccc', 'テスト 3', 'テストメンバー 3', NULL, NULL, NULL,
   '#3E9B4F', '#95D19F', '#E9F6EB', '#F6FBF7', '2023-01-10', NULL, 2),
  ('UCdevmember04ddddddddddd', 'テスト 4', 'テストメンバー 4', 'Test Member 4', NULL, NULL,
   '#8E4EC6', '#C9A6E8', '#F3ECFA', '#FAF7FD', '2021-09-01', '2024-03-31', 3)
ON CONFLICT (channel_id) DO NOTHING;
