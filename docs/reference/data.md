# Data

## Database

The collected data lives in a Cloudflare D1 database named `kemov`, running in the APAC region. Everything the site publishes can be rebuilt from it. The commands below need wrangler, which comes with the Worker setup.

A region is chosen when the database is created and never again, so moving it means creating another one and copying the data across.

## Who Writes Which Column

`channel` has two writers, and one that ignores the split erases the other's work.

| Columns                                                                                                       | Written by                                     |
| ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `channel_id`, `name`, `fullname`, `globalname`, `twitter`, `twitch`, `color_*`, `activity_*`, `display_order` | The deploy's initial seed, from `channels.yml` |
| `custom_url`, `thumbnail_url`, `fetched_at`                                                                   | The collector, from `Channels.list`            |

Seeding from the YAML therefore names only those columns, and only for a row that does not exist yet - see "The Channel Master" below. Every other table is the collector's alone.

## The Channel Master

`channels.yml` at the repository root is the initial seed for that table, one entry per streamer. It only ever adds a row: a streamer already in `channel` is edited there from that point on, not by editing this file. The file's own order decides a new streamer's initial `display_order` - the order the site shows streamers in until it is changed through the admin site; see the comment at the top of the file before reordering it.

```yaml
- channel_id: UCEcMIuGR8WO2TwL9XIpjKtw
  name: ケープペンギン
  fullname: ケープペンギン / African Penguin
  globalname: African Penguin
  twitter: Cape_KEMOV
  color:
    key: '#F38E0A'
    sub: '#F8C112'
    light: '#FFEBA4'
    back: '#FFEBA4'
  activity_start_date: '2021-04-26'
  activity_end_date: '2022-05-21'
```

Field names are the column names they land in, with two exceptions. `color` groups the four values because a person edits them together, and the seed spreads them across `color_key`, `color_sub`, `color_light` and `color_back`.

`globalname`, `twitter` and `twitch` may be left out. `activity_end_date` is always written, and `null` is how the file says a streamer is still active — leaving the key out would say the same thing without anybody having decided it.

Quote the dates. Unquoted, YAML reads `2021-04-26` as a timestamp rather than text, and the column wants the text.

The master used to be a hand-written JSON file hosted outside the repository. Editing it took no review and no check; editing this one takes a pull request, and CI reads the file on every one of them:

```sh
bun run check-channels
```

That reports every problem in the file at once rather than the first: an id that is not a YouTube channel id, a colour that is not `#RRGGBB`, a handle written with the `@`, a date that does not exist, a field name with a typo in it, the same channel twice.

What the check knows lives in `scripts/`, which is JavaScript rather than TypeScript because it runs under bare node from a CI step and from the deploy, both before anything is built. Like the worker, it is its own vitest project:

```sh
bun run vitest run --project scripts
```

## Retiring a Streamer

Give the entry an `activity_end_date`. Never delete one.

`channel_snapshot` and `video` reference `channel`, so D1 refuses a delete that would leave them pointing at nothing. That refusal is deliberate: a line dropped from this file must not be able to take years of collected history with it. A streamer who stops still has the history of when they did not.

## Seeding the Channel Table

The deploy turns the file into one `INSERT ... ON CONFLICT DO NOTHING` and applies it. The same two commands fill a local database:

```sh
bun run build-channels-sql .wrangler/channels.sql
bun wrangler d1 execute kemov --local --file .wrangler/channels.sql
```

The generated SQL is not committed. It is whatever the file says at the moment it runs, and a copy in the repository would be one more thing that can disagree with the file. `.wrangler/` is gitignored, which is why the example writes there.

The statement names the deploy's columns and nothing else, so `custom_url`, `thumbnail_url` and `fetched_at` keep whatever the last collection put there. It only inserts: a channel already in the table keeps every column it has, whatever this file now says, and a channel the file no longer lists keeps its row too.

## Backups

Time travel above covers the last 30 days and only inside D1. The nightly backup covers what happens after that, and what happens to D1 itself: at 00:20 UTC the worker writes what the database holds to the `kemov-backup` R2 bucket, as SQL.

```
channel/2026-09-08.sql              every row, rewritten each night
video/2026-09-08.sql                every row, rewritten each night
channel_snapshot/2026-09-07.sql     one finished day, written once
revision/2026-09-07.sql             one finished day, written once
publication/2026-09-08.sql          every row, rewritten each night
```

Most tables are written whole each night because their current values are the whole story — every table the admin site added in [#144](https://github.com/nanase/kemov/issues/144) is one of these, alongside `channel` and `video`. `channel_snapshot` and `revision` are not: both only ever gain rows, so a finished day is written once as its own file and never touched again. That keeps a night's work the size of a day rather than the size of the table, which for `channel_snapshot` alone is 578,000 rows by the end of a year at 1,584 a day.

A run writes at most seven missing days, so a gap left by an outage closes over several nights rather than being attempted all at once. Which days are already written is read from the bucket, not remembered anywhere, so nothing can disagree about it.

Inside a file, one `INSERT` names at most 200 rows and at most 80,000 bytes, whichever comes first. D1 refuses a statement over 100,000 bytes, and the row count alone does not bound the bytes: measured over the 6,433 rows of `video` in production on 2026-09-08, batches of 200 reach 73,687 bytes in the order the backup reads them and 86,890 over the same rows grouped another way. How close a batch gets is therefore a property of which rows land together, not of how many there are, and `video` only grows. A statement that D1 refuses would be found only by whoever was restoring from the file, which is the worst moment to find it.

`collect_task` and `chat_author` are deliberately absent. They hold where collection has got to, they rebuild themselves within a tick or two, and restoring them would send the chat job back through replays it has already read.

`/api/health` covers this job too, since [#115](https://github.com/nanase/kemov/issues/115). It cannot read `collect_task` for it — this job writes none of those rows — so its `backup` field reads the bucket instead: the newest day each table has a file for, and how many days old that is. `channel_snapshot` and `revision` read one day older than the rest even when nothing is wrong, because both write yesterday's finished day rather than today's (see above). The field does not say how old is too old; that threshold is [#110](https://github.com/nanase/kemov/issues/110)'s decision.

## What Expires and What Does Not

**Prefix-specific lifecycle rules are set on `kemov-backup`, in addition to its existing Default Multipart Abort Rule, because one rule covering the whole bucket would be wrong.**

| Prefix                                                                                                                                                                                                                                                                                                                                                                                                     | Retention    | Why                                                                                                                                  |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `video/`                                                                                                                                                                                                                                                                                                                                                                                                   | 30 days      | Each file is a complete copy, collected fresh from the YouTube API. The newest one is all that is needed; older ones are duplicates. |
| `channel/`, `channel_snapshot/`, `channel_snapshot_exclusion/`, `video_override/`, `footprints_event/`, `footprints_event_member/`, `footprints_event_source/`, `source_whitelist/`, `genet_person/`, `genet_tune/`, `genet_tune_attribute/`, `genet_tune_attribute_person/`, `genet_tune_video/`, `genet_tune_score/`, `genet_stream/`, `genet_performance/`, `genet_scene/`, `revision/`, `publication/` | **365 days** | See below.                                                                                                                           |

`channel_snapshot/` and `revision/` hold one file per day and no other file holds that day: deleting one leaves a hole in the history that nothing can fill. That hole is a hole in R2, not in the history itself — both tables only ever gain rows in D1 (see [Backups](#backups) above), so D1 already holds every day of either forever. R2's copy exists to restore D1 if D1 is what breaks, and that need shows up right after an incident, not a year later — 365 days bounds how long the copy waits around for that, not how long the history survives.

Every other table in the 365-day row holds data a person typed once through the admin site rather than data the collector can fetch again — `channel` joined this group for the same reason, once `channel` itself became a table people edit rather than one only the collector wrote to. `video/` is the one table this reasoning does not reach: losing 30 days of it costs nothing beyond a slower rebuild, because it can be recollected from the YouTube API.

The snapshot history began on 2026-09-07 and exists nowhere else in R2. A day of it is about 119 KiB of SQL, measured against production values on 2026-09-08, so a year of it costs some 44 MB; `video` adds roughly 70 MB more at 30 days (`channel`'s own few dozen rows barely move that figure). Both fit well inside R2's free 10 GB tier; the tables #144 added hold at most a few hundred rows each and add little beside that.

## Public Data

The admin site publishes JSON to its own bucket, `kemov-public`, bound as `PUBLIC_DATA` (#144). No lifecycle rule is set on it: a publish overwrites the same key every time, so there is never an old object for a rule to expire.

It is not backed up. Every published object is built from `revision`, which is backed up, so losing `kemov-public` costs a republish rather than the data itself — the same reasoning that keeps `collect_task` and `chat_author` out of `kemov-backup` (see [Backups](#backups) above), applied to a bucket instead of a table.

Nothing writes to it yet - publishing is later work - but `/api` already serves it. `GET /api/footprints/events` and `GET /api/genet/music` pass the bucket's `footprints/events.json` and `genet/music.json` straight through: the same bytes, the object's own `ETag` and `Last-Modified`, and no reparsing. Until a publish exists to write either key, both answer 404 with `{"error":"not published yet"}`. `If-None-Match` is honoured with 304, and HEAD answers with the same status and headers as GET but no body.
