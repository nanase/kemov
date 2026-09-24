# Recovery

## Rolling Back

D1 has no `migrations revert`. There are two routes, and what went wrong decides which.

**Data was lost or corrupted — time travel.** D1 keeps the last 30 days restorable on Workers Paid, which is the plan this project runs on; on the free plan the window is 7 days. This rewinds the data along with the schema, so anything collected after the chosen timestamp is rewound too.

```sh
bun wrangler d1 time-travel info kemov
bun wrangler d1 time-travel restore kemov --timestamp <ISO 8601>
```

**Only the schema is wrong — the paired rollback file.** It drops what the migration created and deletes its row from `d1_migrations`, so a corrected file applies cleanly afterwards. What was in the dropped tables does not come back this way.

```sh
bun wrangler d1 execute kemov --local --file migrations/rollback/0001_create_initial_schema.sql
```

Read that file before running it against anything but a local database. For a migration that has been live, losing a table is worse than the schema being wrong, and time travel is the route back.

## Restoring from a Backup

The steps below were run end to end on 2026-09-08, against a real remote D1 and the real bucket, and are written from the commands that were actually issued for the three tables that existed then — `channel`, `video` and `channel_snapshot`. Step 1's command has since been generalized to cover every table `BACKED_UP_TABLES` added afterward. What that generalization was and was not checked against is in [What This Has Not Been Tried On](#what-this-has-not-been-tried-on) after these steps; a restore is not the moment to find out which is which.

The target was a database created for the test, empty and never migrated. Substitute its name for `kemov-restore` throughout.

**1. Give it the schema.** The backup files hold `INSERT` statements and nothing else, so every one of them fails on a database with no tables. Apply every file in `migrations/`, in filename order — not only `0001`: a table `BACKED_UP_TABLES` added later, such as `revision` or `publication` (from `0005_add_revision_and_publication.sql`), needs its own migration applied first, or its backup file fails the same way:

```sh
for f in migrations/*.sql; do
  bun wrangler d1 execute kemov-restore --remote --file "$f"
done
```

Step 1 also seeds `source_whitelist` with the 13 entries migration `0008` carries. Its backup file is different from the others: it starts with `DELETE FROM source_whitelist;`, so applying it leaves exactly the list that was backed up, and an entry somebody had removed does not come back with the seed. For the same reason, apply only the newest file of that table, not several in turn — the last one applied is the list you get. Only tables whose rows are one set as a whole are written this way (`replace` in `TableShape`); a table that accumulates records must not be, since it would throw away whatever was written after the backup.

**2. Fetch a file and apply it, `channel` first.** `video` and `channel_snapshot` both carry a foreign key to `channel`, and the schema refuses a row whose channel is not there yet. Then `video`, then every `channel_snapshot` day. Each file repeats this in its own header, so a file found on its own is enough.

```sh
bun wrangler r2 object get kemov-backup/channel/2026-09-08.sql --file channel.sql --remote
bun wrangler d1 execute kemov-restore --remote --file channel.sql
```

**3. Check.** The run this was written from put back 11 channels, 6,433 videos and 1,452 snapshots — 7,896 rows, and every column of every one of them equal to the source.

Every statement is `ON CONFLICT DO NOTHING`, so applying a file twice does nothing the second time: the re-run reported `rows_written: 0` and left the counts alone. A restore is not a calm operation and it should not also be a careful one.

### What This Has Not Been Tried On

**The rest of this is reasoning, not a rehearsal against the real database or bucket.** It is the best answer available for each case; one part of it has since been checked locally, noted below where it applies.

**Restoring into `kemov` itself.** `DO NOTHING` puts back a row that is missing and leaves a row that is present alone, whatever it now says. Against a database whose rows are wrong rather than gone — a bad migration, a job that wrote nonsense — it would change nothing and report success. Emptying it first is what would make a restore mean anything.

`revision` and `publication` each refuse a DELETE by trigger (see [Backups](../reference/data.md#backups) above): append-only holds here the same way it holds in `worker/test/backup.test.ts`'s `clearEverything`, so the trigger has to come off for the DELETE below and go back on right after, the same way that test does it. The two `CREATE TRIGGER` statements are copied from `migrations/0005_add_revision_and_publication.sql`, so this drifts if that migration's trigger text ever changes without this being updated too:

```sh
bun wrangler d1 execute kemov --remote --command "
DROP TRIGGER revision_no_delete;
DROP TRIGGER publication_no_delete;

DELETE FROM chat_author;
DELETE FROM collect_task;
DELETE FROM genet_scene;
DELETE FROM genet_performance;
DELETE FROM genet_tune_video;
DELETE FROM genet_tune_score;
DELETE FROM genet_tune_attribute_person;
DELETE FROM genet_tune_attribute;
DELETE FROM genet_stream;
DELETE FROM genet_tune;
DELETE FROM genet_person;
DELETE FROM footprints_event_source;
DELETE FROM footprints_event_member;
DELETE FROM footprints_event;
DELETE FROM source_whitelist;
DELETE FROM channel_snapshot_exclusion;
DELETE FROM video_override;
DELETE FROM publication;
DELETE FROM revision;
DELETE FROM channel_snapshot;
DELETE FROM video;
DELETE FROM channel;

CREATE TRIGGER revision_no_delete BEFORE DELETE ON revision
BEGIN
  SELECT RAISE(ABORT, 'revision is append only');
END;

CREATE TRIGGER publication_no_delete BEFORE DELETE ON publication
BEGIN
  SELECT RAISE(ABORT, 'publication is append only');
END;
"
```

Children before parents throughout — this is `BACKED_UP_TABLES` in reverse, the same order [Rolling Back](#rolling-back) uses and for the same reason. `collect_task` and `chat_author` are not in the backup and would not come back; they rebuild themselves within a tick or two. Losing them is the cost of emptying, so check [time travel](#rolling-back) first: inside 30 days it returns the whole database to a moment, which is a better answer than a restore whenever it is available.

**Checked locally, not against the real database or bucket.** On 2026-09-17, against a local D1 (`--persist-to`, not the project's regular dev database): applying every migration in filename order — step 1's generalized form — created every table `BACKED_UP_TABLES` lists; applying one hand-written `INSERT ... ON CONFLICT DO NOTHING` file, one statement per table in `BACKED_UP_TABLES` order, put one row in each without a foreign-key error; and the `DROP TRIGGER` / `DELETE` / `CREATE TRIGGER` block above, run against a database already carrying those rows, emptied every table, left both triggers refusing a further `DELETE` exactly as before, and accepted the same file a second time to put the rows back. What this did not use is a real backup file: `genet_person`, `footprints_event` and the rest have none yet, because the nightly job has not run with them in `BACKED_UP_TABLES` before this PR merges, so the hand-written file above stood in for them. Neither check touched the real `kemov` database or the real `kemov-backup` bucket.

**`migrations apply` against a database `wrangler.toml` does not name.** Step 1 above applies the files directly because that is what was run. `bun wrangler d1 migrations apply kemov --remote` is the documented route for the database this repository declares, and whether it resolves some other name was not established either way.

Applying the files directly, as step 1 does, leaves `d1_migrations` empty. That is right for a database read once and thrown away, and wrong for one meant to replace `kemov`, where the next `migrations apply` would retry `0001` against tables that already exist.
