# kemov

This is _Unofficial_ KemoV fan pages! 🐾

## Recommended IDE Setup

[VSCode](https://code.visualstudio.com/) + [Volar](https://marketplace.visualstudio.com/items?itemName=Vue.volar) (and disable Vetur) + [TypeScript Vue Plugin (Volar)](https://marketplace.visualstudio.com/items?itemName=Vue.vscode-typescript-vue-plugin).

## Type Support for `.vue` Imports in TS

TypeScript cannot handle type information for `.vue` imports by default, so we replace the `tsc` CLI with `vue-tsc` for type checking. In editors, we need [TypeScript Vue Plugin (Volar)](https://marketplace.visualstudio.com/items?itemName=Vue.vscode-typescript-vue-plugin) to make the TypeScript language service aware of `.vue` types.

If the standalone TypeScript plugin doesn't feel fast enough to you, Volar has also implemented a [Take Over Mode](https://github.com/johnsoncodehk/volar/discussions/471#discussioncomment-1361669) that is more performant. You can enable it by the following steps:

1. Disable the built-in TypeScript Extension
   1. Run `Extensions: Show Built-in Extensions` from VSCode's command palette
   2. Find `TypeScript and JavaScript Language Features`, right click and select `Disable (Workspace)`
2. Reload the VSCode window by running `Developer: Reload Window` from the command palette.

## Customize configuration

See [Vite Configuration Reference](https://vitejs.dev/config/).

## Project Setup

`engines` forbids npm, so `npm install` fails by design. Use yarn.

The toolchain is pinned in two places: Node in `mise.toml`, and yarn in the `packageManager` field of `package.json`. With [mise](https://mise.jdx.dev/) the pinned Node is installed and selected for you:

```sh
mise install
```

Then install the dependencies:

```sh
yarn install --immutable
```

### Environment Variables

`.env` holds the values the published site is built with. To point the app somewhere else while developing, put the override in `.env.development.local`.

Do not use `.env.local` for this. Vite reads it in every mode, so a value left there also ends up in the production build and ships to visitors.

| Variable                        | Used by              | Notes                           |
| ------------------------------- | -------------------- | ------------------------------- |
| `VITE_GENET_MUSIC_LIST_URL`     | the music list       | Where the list is fetched from  |
| `VITE_GENET_MUSIC_LIST_SUB_URL` | the music list       | An extra list, read in dev only |
| `VITE_API_BASE`                 | the statistics pages | `vite dev` only — see below     |

The published site leaves `VITE_API_BASE` unset and asks `/api` on its own origin, because the worker that answers the API also serves these pages. Under `yarn dev` the pages come from vite on port 5173 and the worker is not there at all, so point it at a `wrangler dev` or at the deployment:

```sh
echo 'VITE_API_BASE=https://kemov.nanase.cc/api' >> .env.development.local
```

### Compile and Hot-Reload for Development

Default URL: http://localhost:5173/stats/

```sh
yarn dev
```

### Type-Check, Compile and Minify for Production

```sh
yarn build
```

### Preview Compiled Project for Production

Default URL: http://localhost:4173/stats/

```sh
yarn preview
```

### Lint with [ESLint](https://eslint.org/)

```sh
yarn lint
```

### CSS Lint with [Stylelint](https://stylelint.io/)

```sh
yarn lint:style
```

### Format with [Prettier](https://prettier.io/)

`.prettierrc.json` covers the whole repository and CI checks all of it, so `yarn format` writes to all of it too. Neither reaches what git ignores.

```sh
yarn format                 # rewrite
yarn prettier --check .     # what CI runs
```

## Worker

Collection and the HTTP API run as one Cloudflare Worker. Its code lives under `worker/`, separate from the frontend in `src/`, and `wrangler.toml` at the root configures it.

```text
worker/src/collector/   scheduled collection jobs
worker/src/api/         the HTTP API
worker/src/lib/         shared code
worker/test/            tests
```

The worker runs on workerd and shares no lib, global or path alias with the frontend, so it has its own `worker/tsconfig.json` and its own vitest project:

```sh
yarn type-check          # frontend
yarn type-check:worker   # worker
yarn test                # every project
yarn vitest run --project worker   # worker only
```

`wrangler.toml` carries the D1 `database_id` but no `account_id`. This repository is public, and that value names the account it belongs to. Anything that reaches Cloudflare — `wrangler deploy`, and any command given `--remote` — resolves the account from the session `wrangler login` leaves in your home directory instead. Actions gets it from an environment secret; see [Deployment](#deployment).

```sh
yarn wrangler login                                        # once per machine
yarn wrangler d1 execute DB --remote --command "select 1"
```

`--local` needs neither an account nor a network. It runs against a SQLite database under `.wrangler/`.

```sh
yarn wrangler d1 execute DB --local --command "select 1"
```

### Worker Secrets

No secret value belongs in this repository — not in `wrangler.toml`, not in a workflow file, not in `.env`. `wrangler.toml` names bindings; it never carries their values.

Cloudflare stores the values instead, and `wrangler` is how they get there. Run these from the repository root. `wrangler` is a devDependency rather than something on your `PATH`, so it is `yarn wrangler`:

```sh
yarn wrangler secret put YOUTUBE_API_KEY   # prompts, so the value misses the shell history
yarn wrangler secret list                  # names only, never values
```

Secrets belong to a Worker that already exists, so the first `yarn wrangler deploy` has to come first — before it, wrangler answers `Worker "kemov" not found`. The worker is deployed, so nothing is waiting on that today.

The dashboard is the other way in, if you would rather the value never passed through a terminal: Workers & Pages → `kemov` → Settings → Variables and Secrets → Add → type Secret.

| Secret            | Read by                          |
| ----------------- | -------------------------------- |
| `YOUTUBE_API_KEY` | the collection jobs (#62 to #65) |

`Deploy Worker` checks that every secret the worker reads is registered, and fails if one is not. What counts as a secret is decided by absence: a member of `Env` in `worker/src/lib/env.ts` that `wrangler.toml` does not supply as a binding or a `[vars]` entry. Adding a member to `Env` is therefore enough to put it under the check.

It runs after the deploy rather than before, and only names are involved on either side. A missing secret does not stop a deploy — wrangler resolves the bindings and never looks at the secrets — so before this existed the worker shipped and its jobs failed one at a time inside D1, which is what #89 records.

For local runs, put the same names in `.dev.vars` at the repository root as `NAME=value` lines. `.dev.vars` and `.dev.vars.*` are gitignored.

`.env` is a different thing and is committed on purpose: Vite inlines it into the published bundle, so what it holds is already public. `wrangler dev` also reads it and hands the worker what it finds, which is another reason nothing secret may go there.

## Database

The collected data lives in a Cloudflare D1 database named `kemov`, running in the APAC region. Everything the site publishes can be rebuilt from it. The commands below need wrangler, which comes with the Worker setup.

A region is chosen when the database is created and never again, so moving it means creating another one and copying the data across.

### Who Writes Which Column

`channel` has two writers, and one that ignores the split erases the other's work.

| Columns                                                                                             | Written by                          |
| --------------------------------------------------------------------------------------------------- | ----------------------------------- |
| `channel_id`, `name`, `fullname`, `globalname`, `twitter`, `color_*`, `activity_*`, `display_order` | The deploy, from `channels.yml`     |
| `custom_url`, `thumbnail_url`, `fetched_at`                                                         | The collector, from `Channels.list` |

Seeding from the YAML therefore upserts those columns by name. Replacing the whole row would blank what the collector has fetched. Every other table is the collector's alone.

### The Channel Master

`channels.yml` at the repository root holds the deploy's half of that table, one entry per streamer. The file's own order is the order the site shows streamers in, written into `display_order`; see the comment at the top of the file before reordering it.

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

`twitch` lands nowhere. Three entries carry one, no column holds it and nothing reads it. The file keeps it so that handles a person wrote by hand outlive the JSON described below: showing them later takes a migration, and a migration can add a column but not data that was thrown away.

`globalname`, `twitter` and `twitch` may be left out. `activity_end_date` is always written, and `null` is how the file says a streamer is still active — leaving the key out would say the same thing without anybody having decided it.

Quote the dates. Unquoted, YAML reads `2021-04-26` as a timestamp rather than text, and the column wants the text.

The master used to be a hand-written JSON file hosted outside the repository. Editing it took no review and no check; editing this one takes a pull request, and CI reads the file on every one of them:

```sh
yarn check-channels
```

That reports every problem in the file at once rather than the first: an id that is not a YouTube channel id, a colour that is not `#RRGGBB`, a handle written with the `@`, a date that does not exist, a field name with a typo in it, the same channel twice.

What the check knows lives in `scripts/`, which is JavaScript rather than TypeScript because it runs under bare node from a CI step and from the deploy, both before anything is built. Like the worker, it is its own vitest project:

```sh
yarn vitest run --project scripts
```

### Retiring a Streamer

Give the entry an `activity_end_date`. Never delete one.

`channel_snapshot` and `video` reference `channel`, so D1 refuses a delete that would leave them pointing at nothing. That refusal is deliberate: a line dropped from this file must not be able to take years of collected history with it. A streamer who stops still has the history of when they did not.

### Seeding the Channel Table

The deploy turns the file into one `INSERT ... ON CONFLICT DO UPDATE` and applies it. The same two commands fill a local database:

```sh
yarn build-channels-sql .wrangler/channels.sql
yarn wrangler d1 execute kemov --local --file .wrangler/channels.sql
```

The generated SQL is not committed. It is whatever the file says at the moment it runs, and a copy in the repository would be one more thing that can disagree with the file. `.wrangler/` is gitignored, which is why the example writes there.

The statement names the deploy's columns and nothing else, so `custom_url`, `thumbnail_url` and `fetched_at` keep whatever the last collection put there. It inserts and updates only: a channel the file no longer lists keeps its row.

### Applying Migrations

`migrations/` holds one SQL file per change, applied in filename order. wrangler records what it has applied in a `d1_migrations` table, so applying twice does nothing the second time.

Against a local SQLite file, which needs no Cloudflare account:

```sh
yarn wrangler d1 migrations list kemov --local
yarn wrangler d1 migrations apply kemov --local
```

Against the real database, which needs the account credentials:

```sh
yarn wrangler d1 migrations apply kemov --remote
```

That command is not usually typed by hand. `Deploy Worker` runs it ahead of every deploy, so a migration reaches the real database on the same push as the code that expects it; see [Deployment](#the-worker).

### Adding a Migration

An applied file is never edited. wrangler tracks files by name, so an edit reaches a fresh database and no existing one, and the two then disagree about what the schema is. Change the schema by adding the next file instead:

```sh
yarn wrangler d1 migrations create kemov <what-it-does>
```

That writes `migrations/000N_<what-it-does>.sql`. Put the forward SQL there and the SQL that undoes it in `migrations/rollback/000N_<what-it-does>.sql`.

Then prove the pair runs against an empty database. The local database keeps whatever earlier runs left in it, and `migrations apply` skips a file it has already recorded, so pointing `--persist-to` at a directory that does not exist yet is what makes the run start from nothing:

```sh
yarn wrangler d1 migrations apply kemov --local --persist-to .wrangler/check
yarn wrangler d1 execute kemov --local --persist-to .wrangler/check --file migrations/rollback/000N_<what-it-does>.sql
rm -rf .wrangler/check
```

The first command must report every migration as applied, not just the new one. If it reports fewer, the directory was not empty.

### Rolling Back

D1 has no `migrations revert`. There are two routes, and what went wrong decides which.

**Data was lost or corrupted — time travel.** D1 keeps the last 30 days restorable on Workers Paid, which is the plan this project runs on; on the free plan the window is 7 days. This rewinds the data along with the schema, so anything collected after the chosen timestamp is rewound too.

```sh
yarn wrangler d1 time-travel info kemov
yarn wrangler d1 time-travel restore kemov --timestamp <ISO 8601>
```

**Only the schema is wrong — the paired rollback file.** It drops what the migration created and deletes its row from `d1_migrations`, so a corrected file applies cleanly afterwards. What was in the dropped tables does not come back this way.

```sh
yarn wrangler d1 execute kemov --local --file migrations/rollback/0001_create_initial_schema.sql
```

Read that file before running it against anything but a local database. For a migration that has been live, losing a table is worse than the schema being wrong, and time travel is the route back.

### Backups

Time travel above covers the last 30 days and only inside D1. The nightly backup covers what happens after that, and what happens to D1 itself: at 00:20 UTC the worker writes what the database holds to the `kemov-backup` R2 bucket, as SQL.

```
channel/2026-09-08.sql              every row, rewritten each night
video/2026-09-08.sql                every row, rewritten each night
channel_snapshot/2026-09-07.sql     one finished day, written once
```

`channel` and `video` are written whole each night because their current values are the whole story. `channel_snapshot` is not: it only ever gains rows, 1,584 of them a day, so a finished day is written once as its own file and never touched again. That keeps a night's work the size of a day rather than the size of the table, which by the end of a year is 578,000 rows.

A run writes at most seven missing days, so a gap left by an outage closes over several nights rather than being attempted all at once. Which days are already written is read from the bucket, not remembered anywhere, so nothing can disagree about it.

Inside a file, one `INSERT` names at most 200 rows and at most 80,000 bytes, whichever comes first. D1 refuses a statement over 100,000 bytes, and the row count alone does not bound the bytes: measured over the 6,433 rows of `video` in production on 2026-09-08, batches of 200 reach 73,687 bytes in the order the backup reads them and 86,890 over the same rows grouped another way. How close a batch gets is therefore a property of which rows land together, not of how many there are, and `video` only grows. A statement that D1 refuses would be found only by whoever was restoring from the file, which is the worst moment to find it.

`collect_task` and `chat_author` are deliberately absent. They hold where collection has got to, they rebuild themselves within a tick or two, and restoring them would send the chat job back through replays it has already read.

`/api/health` covers this job too, since [#115](https://github.com/nanase/kemov/issues/115). It cannot read `collect_task` for it — this job writes none of those rows — so its `backup` field reads the bucket instead: the newest day each table has a file for, and how many days old that is. `channel_snapshot` reads one day older than `channel` and `video` even when nothing is wrong, because it writes yesterday's finished day rather than today's (see above). The field does not say how old is too old; that threshold is [#110](https://github.com/nanase/kemov/issues/110)'s decision.

### Restoring from a Backup

The steps below were run end to end on 2026-09-08, against a real remote D1 and the real bucket, and are written from the commands that were actually issued. What was not run is in [What This Has Not Been Tried On](#what-this-has-not-been-tried-on) after them; a restore is not the moment to find out which is which.

The target was a database created for the test, empty and never migrated. Substitute its name for `kemov-restore` throughout.

**1. Give it the schema.** The backup files hold `INSERT` statements and nothing else, so every one of them fails on a database with no tables. Apply `migrations/` in filename order:

```sh
yarn wrangler d1 execute kemov-restore --remote --file migrations/0001_create_initial_schema.sql
```

**2. Fetch a file and apply it, `channel` first.** `video` and `channel_snapshot` both carry a foreign key to `channel`, and the schema refuses a row whose channel is not there yet. Then `video`, then every `channel_snapshot` day. Each file repeats this in its own header, so a file found on its own is enough.

```sh
yarn wrangler r2 object get kemov-backup/channel/2026-09-08.sql --file channel.sql --remote
yarn wrangler d1 execute kemov-restore --remote --file channel.sql
```

**3. Check.** The run this was written from put back 11 channels, 6,433 videos and 1,452 snapshots — 7,896 rows, and every column of every one of them equal to the source.

Every statement is `ON CONFLICT DO NOTHING`, so applying a file twice does nothing the second time: the re-run reported `rows_written: 0` and left the counts alone. A restore is not a calm operation and it should not also be a careful one.

### What This Has Not Been Tried On

**The rest of this is reasoning, not a rehearsal.** It is the best answer available for each case, and none of it has been run.

**Restoring into `kemov` itself.** `DO NOTHING` puts back a row that is missing and leaves a row that is present alone, whatever it now says. Against a database whose rows are wrong rather than gone — a bad migration, a job that wrote nonsense — it would change nothing and report success. Emptying it first is what would make a restore mean anything:

```sh
yarn wrangler d1 execute kemov --remote --command \
  "DELETE FROM chat_author; DELETE FROM collect_task; DELETE FROM channel_snapshot; DELETE FROM video; DELETE FROM channel"
```

Children before parents, the same order [Rolling Back](#rolling-back) uses and for the same reason. `collect_task` and `chat_author` are not in the backup and would not come back; they rebuild themselves within a tick or two. Losing them is the cost of emptying, so check [time travel](#rolling-back) first: inside 30 days it returns the whole database to a moment, which is a better answer than a restore whenever it is available.

**`migrations apply` against a database `wrangler.toml` does not name.** Step 1 above applies the files directly because that is what was run. `yarn wrangler d1 migrations apply kemov --remote` is the documented route for the database this repository declares, and whether it resolves some other name was not established either way.

Applying the files directly, as step 1 does, leaves `d1_migrations` empty. That is right for a database read once and thrown away, and wrong for one meant to replace `kemov`, where the next `migrations apply` would retry `0001` against tables that already exist.

### What Expires and What Does Not

**Three lifecycle rules are set on `kemov-backup`, one per prefix, because one rule covering the whole bucket would be wrong.**

| Prefix               | Retention    | Why                                                                                                                     |
| -------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `channel/`, `video/` | 30 days      | Each file is a complete copy. The newest one is all that is needed; older ones are duplicates.                          |
| `channel_snapshot/`  | **365 days** | Each file is one day and no other file holds that day. Deleting one leaves a hole in the history that nothing can fill. |

That hole is a hole in R2, not in the history itself: `channel_snapshot` only ever gains rows in D1 (see [Backups](#backups) above), so D1 already holds every day of it forever. R2's copy exists to restore D1 if D1 is what breaks, and that need shows up right after an incident, not a year later — 365 days bounds how long the copy waits around for that, not how long the history survives.

The snapshot history began on 2026-09-07 and exists nowhere else in R2. A day of it is about 119 KiB of SQL, measured against production values on 2026-09-08, so a year of it costs some 44 MB; `channel` and `video` add roughly 70 MB more at 30 days. Both fit well inside R2's free 10 GB tier.

Set with three `lifecycle add` calls, run from `worker/`:

```sh
npx wrangler r2 bucket lifecycle add kemov-backup expire-video-30d video/ --expire-days 30
npx wrangler r2 bucket lifecycle add kemov-backup expire-channel-30d channel/ --expire-days 30
npx wrangler r2 bucket lifecycle add kemov-backup expire-channel-snapshot-365d channel_snapshot/ --expire-days 365
```

Not `lifecycle set --file <json>`: `set` replaces the bucket's whole ruleset, and the existing "Default Multipart Abort Rule" (7 days, all prefixes) would be lost if it were left out of that file. `add` only adds a rule, so the three calls above cannot touch it.

**The trailing slash matters.** `channel` as a prefix also matches `channel_snapshot/`, which would expire a year of irreplaceable history in 30 days instead of 365. All three prefixes above end in `/` for this reason.

Check with `npx wrangler r2 bucket lifecycle list kemov-backup`; it should list four rules — the three above plus the Default Multipart Abort Rule that was already there.

## Deployment

One `Deploy` workflow puts up the worker and the site together, on every push to `main` and on demand from the Actions tab. There is no second project and no GitHub Pages: `wrangler.toml` declares `dist/` as the worker's static assets, so `yarn wrangler deploy` uploads the built site alongside the code that answers `/api`.

Cloudflare serves a request that matches a built file directly and never wakes the worker for it, so the worker's `fetch` sees `/api/*` and the paths that are not files. The split between site and API is therefore a branch in code rather than a route pattern in a dashboard.

They were two workflows until #70. Two meant one could go green while the other did not, and that happened: the worker deployed successfully with none of its secrets registered, and nothing was collected for two and a half hours.

Build output is not committed: `yarn build` writes to `dist/`, which is ignored.

To roll back, revert the commit and let the workflow redeploy. `yarn wrangler rollback` is the faster route when what is deployed is already broken.

### What the workflow does

It builds the site into `dist/`, applies the migrations, seeds the `channel` table from `channels.yml`, and then runs `yarn wrangler deploy`. The build is first because it needs no credentials and a failure there should not leave a migration applied for code that never shipped. Migrations come before the deploy so that the code never arrives at a schema older than itself, and the `d1_migrations` table makes the step a no-op on a push that adds none. The seed follows the migrations because it needs the columns to exist, and precedes the deploy so that the worker never runs against a `channel` table older than the `channels.yml` it shipped with.

It type checks and tests both the frontend and the worker before any of that, in a job that holds no credentials, and afterwards checks that the secrets the worker reads are registered; see [Worker Secrets](#worker-secrets). It has no path filter: what Cloudflare runs is whatever is on `main`. The wrangler it uses comes from the lockfile, so a deploy uses the version the repository was tested against.

### The Hostname

`wrangler.toml` claims `kemov.nanase.cc` as a custom domain, which is why the zone's DNS record is created and kept by Cloudflare rather than by hand.

`workers_dev` is off. The subdomain Cloudflare generates for a worker is built from the account's email address with the local part left in it, and a successful deploy prints that URL — into the Actions logs of a public repository, which anyone can read. Nothing needs it once the custom domain exists. Never turn it off before the domain is in place: it is the only other way to reach the worker.

Its credentials come from a GitHub **environment** rather than from repository secrets. An environment secret is only readable by a job that names the environment; a repository secret is readable by every workflow in the repository, including one running from a pull request branch, and most of them have no business holding a token that can deploy.

| Setting             | Value                                           |
| ------------------- | ----------------------------------------------- |
| Environment         | `cloudflare`                                    |
| Deployment branches | `main` only                                     |
| Secrets             | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` |

Settings → Environments → New environment → name it `cloudflare` → under Deployment branches choose "Selected branches and tags" and add `main` → then Add environment secret twice, once per name above. The token needs the "Edit Cloudflare Workers" template plus D1 Edit, because the worker carries a D1 binding, and DNS Edit on the zone, because the custom domain above is a DNS record.

## LICENSE

[MIT](LICENSE.md)

### Copyright Warning

_KemoV_ works (such as images) are copyrighted by [Kemono Friends Project](https://kemono-friends.jp/) (KFP) and [Kemono Friends V Project](https://www.kemov-project.com/) (KFPV). These contents cannot be included in this repository, but can instead be used by linking to them.
