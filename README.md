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

`engines` forbids npm, so `npm install` fails by design. Use bun.

The toolchain is pinned in `mise.toml`: Node and bun both. With [mise](https://mise.jdx.dev/) the pinned versions are installed and selected for you:

```sh
mise install
```

Then install the dependencies:

```sh
bun install --frozen-lockfile
```

### Environment Variables

`.env` holds the values the published site is built with. To point the app somewhere else while developing, put the override in `.env.development.local`.

Do not use `.env.local` for this. Vite reads it in every mode, so a value left there also ends up in the production build and ships to visitors.

| Variable                        | Used by              | Notes                           |
| ------------------------------- | -------------------- | ------------------------------- |
| `VITE_GENET_MUSIC_LIST_URL`     | the music list       | Where the list is fetched from  |
| `VITE_GENET_MUSIC_LIST_SUB_URL` | the music list       | An extra list, read in dev only |
| `VITE_API_BASE`                 | the statistics pages | `vite dev` only — see below     |

The published site leaves `VITE_API_BASE` unset and asks `/api` on its own origin, because the worker that answers the API also serves these pages. Under `bun run dev` the pages come from vite on port 5173 and the worker is not there at all, so point it at a `wrangler dev` or at the deployment:

```sh
echo 'VITE_API_BASE=https://kemov.nanase.cc/api' >> .env.development.local
```

### Compile and Hot-Reload for Development

Default URL: http://localhost:5173/stats/

```sh
bun run dev
```

### Type-Check, Compile and Minify for Production

```sh
bun run build
```

### Preview Compiled Project for Production

Default URL: http://localhost:4173/stats/

```sh
bun run preview
```

### Screenshots

Playwright takes the screenshots that a review of a visual change asks for. It keeps its own Chromium, separate from any browser already open on the machine, so clean-up is `browser.close()` and nothing more — see #120 for why that distinction matters.

`bun install` does not fetch the browser; do that once per machine:

```sh
bunx playwright install chromium
```

Then, with the pages served by `bun run preview` (port 4173) or `bun run dev` (port 5173):

```sh
bun run screenshot screenshots stats=http://localhost:4173/stats/ ranking=http://localhost:4173/stats/ranking/
```

Each `<name>=<url>` pair becomes `screenshots/<name>-<light|dark>-<390|768|1280>.png`, one file per width and colour scheme. `screenshots/` is gitignored: nothing this script writes is committed.

### Lint with [ESLint](https://eslint.org/)

```sh
bun run lint
```

### CSS Lint with [Stylelint](https://stylelint.io/)

```sh
bun run lint:style
```

### Format with [Prettier](https://prettier.io/)

`.prettierrc.json` covers the whole repository and CI checks all of it, so `bun run format` writes to all of it too. Neither reaches what git ignores.

```sh
bun run format                 # rewrite
bun run prettier --check .     # what CI runs
```

## Worker

Collection and the HTTP API run as one Cloudflare Worker. Its code lives under `worker/`, separate from the frontend in `src/`, and `wrangler.toml` at the root configures it.

```text
worker/src/collector/   scheduled collection jobs
worker/src/api/         the HTTP API
worker/src/pages/       /members/<id> and /videos/<id> (see below)
worker/src/lib/         shared code
worker/test/            tests
```

The worker runs on workerd and shares no lib, global or path alias with the frontend, so it has its own `worker/tsconfig.json` and its own vitest project:

```sh
bun run type-check          # frontend
bun run type-check:worker   # worker
bun run test                # every project
bun run vitest run --project worker   # worker only
```

`wrangler.toml` carries the D1 `database_id` but no `account_id`. This repository is public, and that value names the account it belongs to. Anything that reaches Cloudflare — `wrangler deploy`, and any command given `--remote` — resolves the account from the session `wrangler login` leaves in your home directory instead. Actions gets it from an environment secret; see [Deployment](#deployment).

```sh
bun wrangler login                                        # once per machine
bun wrangler d1 execute DB --remote --command "select 1"
```

`--local` needs neither an account nor a network. It runs against a SQLite database under `.wrangler/`.

```sh
bun wrangler d1 execute DB --local --command "select 1"
```

### Worker Secrets

No secret value belongs in this repository — not in `wrangler.toml`, not in a workflow file, not in `.env`. `wrangler.toml` names bindings; it never carries their values.

Cloudflare stores the values instead, and `wrangler` is how they get there. Run these from the repository root. `wrangler` is a devDependency rather than something on your `PATH`, so it is `bun wrangler`:

```sh
bun wrangler secret put YOUTUBE_API_KEY   # prompts, so the value misses the shell history
bun wrangler secret list                  # names only, never values
```

Secrets belong to a Worker that already exists, so the first `bun wrangler deploy` has to come first — before it, wrangler answers `Worker "kemov" not found`. The worker is deployed, so nothing is waiting on that today.

The dashboard is the other way in, if you would rather the value never passed through a terminal: Workers & Pages → `kemov` → Settings → Variables and Secrets → Add → type Secret.

| Secret            | Read by                                   |
| ----------------- | ----------------------------------------- |
| `YOUTUBE_API_KEY` | the collection jobs (#62 to #65)          |
| `ACCESS_AUD`      | the check in front of `/admin/api` (#144) |

`Deploy Worker` checks that every secret the worker reads is registered, and fails if one is not. What counts as a secret is decided by absence: a member of `Env` in `worker/src/lib/env.ts` that `wrangler.toml` does not supply as a binding or a `[vars]` entry. Adding a member to `Env` is therefore enough to put it under the check.

It runs after the deploy rather than before, and only names are involved on either side. A missing secret does not stop a deploy — wrangler resolves the bindings and never looks at the secrets — so before this existed the worker shipped and its jobs failed one at a time inside D1, which is what #89 records.

For local runs, put the same names in `.dev.vars` at the repository root as `NAME=value` lines. `.dev.vars` and `.dev.vars.*` are gitignored.

`.env` is a different thing and is committed on purpose: Vite inlines it into the published bundle, so what it holds is already public. `wrangler dev` also reads it and hands the worker what it finds, which is another reason nothing secret may go there.

### `/admin` and Cloudflare Access

`/admin/*` is the write side of the site (#141). `/admin/api/*` is its API — the worker answers that directly, with no built file behind it. Every other `/admin/*` path answers with the admin site itself (`src/admin/`, #144): one built page, `dist/admin/index.html`, served through `ASSETS` for whatever the path is — `worker/src/admin/index.ts`'s `servePage`, the same "one file answers every path under here" shape `worker/src/pages/index.ts` already uses for `/members/<id>` and `/videos/<id>`. Which screen that one page shows is a route `src/admin/router.ts` reads client-side, not something the worker itself understands. Cloudflare Access sits in front of all of `/admin` and is what actually keeps everyone but its allowed identities out — no request lacking Access's approval reaches the worker at all.

Every `/admin/api/*` request is also checked by the worker itself, in `worker/src/lib/access.ts`: it fetches Access's own public keys from `https://${ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs` and verifies the `Cf-Access-Jwt-Assertion` header's signature, `iss`, `aud` and `exp`/`nbf` against them, the same way Access's own edge does, and refuses the request otherwise. This is not a substitute for Access — the policy in front of `/admin` is what actually authorizes a caller — it exists so that a request is still refused here, rather than reaching a route that writes to D1 or to the public bucket unchecked, if that policy is ever removed or misconfigured. An earlier version compared only the `aud` claim without checking the signature; #144's review found that too little for a route meant to write, so this checks the signature instead (2026-09-18).

`ACCESS_AUD` is the `aud` tag of the Access application in front of `/admin`, and `ACCESS_TEAM_DOMAIN` is that Access team's domain (e.g. `nanase.cloudflareaccess.com`) — a `[vars]` entry in `wrangler.toml`, not a secret, because it is the same domain a browser is already sent to for the Access login page. With either `ACCESS_AUD` or `ACCESS_TEAM_DOMAIN` unset, or with a key set that cannot be fetched, every `/admin/api/*` request is refused, Access policy notwithstanding.

### The Admin API's Endpoints

| Method | Path                                                       | Answers with                                                        |
| ------ | ---------------------------------------------------------- | ------------------------------------------------------------------- |
| GET    | `/admin/api/me`                                            | The email Cloudflare Access identified the caller as                |
| GET    | `/admin/api/members`                                       | Every `channel` row                                                 |
| PUT    | `/admin/api/members/<channel ID>`                          | The row after replacing the columns a person may edit               |
| GET    | `/admin/api/snapshot-exclusions`                           | Every `channel_snapshot_exclusion` row                              |
| PUT    | `/admin/api/snapshot-exclusions/<channel ID>/<fetched_at>` | The exclusion after creating or replacing it                        |
| DELETE | `/admin/api/snapshot-exclusions/<channel ID>/<fetched_at>` | Nothing but the revision logged for the removal                     |
| GET    | `/admin/api/video-overrides`                               | Every `video_override` row, with the video's own title alongside it |
| PUT    | `/admin/api/video-overrides/<video ID>`                    | The override after creating or replacing it                         |
| DELETE | `/admin/api/video-overrides/<video ID>`                    | Nothing but the revision logged for the removal                     |

`channel`, `video_override` and `channel_snapshot_exclusion` take effect the moment they are saved — #141's design decision 5 — unlike `footprints_event` and `genet_stream` below, which pass through a publish step instead. Every PUT or DELETE above logs one row to `revision` in the same `db.batch` as the row it changes, so a row and its history cannot come apart if one write in the pair fails. A PUT answers with `revisionId` alongside the saved row; a DELETE answers with `revisionId` alone.

A PUT replaces every column at once rather than patching one: a column its endpoint does not name is refused with 400, and a column left out of the body is treated as null, which is itself refused with 400 for a column that may not be null. `worker/src/lib/revision.ts` is what each save's `revision.body` goes through — the row as saved, minus columns that only say when a save happened rather than what it changed, with its JSON keys in the row's own column order.

### Footprints: Editing and Publishing

| Method | Path                                               | Answers with                                                                                     |
| ------ | -------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| GET    | `/admin/api/footprints/events`                     | Every `footprints_event` row, with its members and sources                                       |
| GET    | `/admin/api/footprints/events/<event ID>`          | One row, with its members and sources                                                            |
| POST   | `/admin/api/footprints/events`                     | The row after creating it in `draft`                                                             |
| PUT    | `/admin/api/footprints/events/<event ID>`          | The row after replacing it, its members and its sources - `status` unchanged                     |
| DELETE | `/admin/api/footprints/events/<event ID>`          | `{}` - 409 instead, if the event is `published`                                                  |
| POST   | `/admin/api/footprints/events/<event ID>/publish`  | The row after validating it and setting `status` to `published`                                  |
| POST   | `/admin/api/footprints/events/<event ID>/withdraw` | The row after setting `status` back to `draft`                                                   |
| GET    | `/admin/api/footprints/pending`                    | Events not yet reflected in the published JSON, and published events whose row has since changed |
| POST   | `/admin/api/footprints/publish`                    | Whether anything was published, and how many events if so                                        |

`GET /admin/api/footprints/events` takes `status` and `q` (a substring of `title`) as query parameters, narrowing the list.

An event passes through a publish gate rather than taking effect on save, the same as the table above already draws the line for `footprints_event` and `genet_stream`. Creating, updating and deleting an event logs no `revision` at all; only `publish` and `withdraw` do, in the same `db.batch` as the `status` change. `POST .../publish` refuses with 400 and every failing condition together when the event is not ready — an empty `title`, `sourcePending: false` with no source in the whitelist (`worker/src/lib/source-whitelist.ts`), or a `videoId` that is not 11 characters. Publishing an already-published event is allowed, and is how an event `GET .../pending` reports as changed gets a fresh `publish` revision matching its current row.

`POST /admin/api/footprints/publish` builds `footprints/events.json` from the latest `revision` of every event whose latest action is not `withdraw`, writes it to `PUBLIC_DATA`, and appends one `publication` row recording the newest `revision_id` it saw. Nothing is written when there is nothing newer than the last run.

### The Admin Site

`src/admin/` is the admin site's own frontend (#141, #144) — plain Vue, plain HTML and CSS, no Vuetify, because #127's decision to keep the admin site apart from the public site's own component library applies here too. It shares one thing with the public site: `src/shell/tokens.css`'s colour variables. It does not share the public site's own shell (`SiteNav.vue` and friends) or its dark theme — `src/admin/index.html` fixes `<html data-theme="light">`, which pins every colour tokens.css defines to its light block regardless of the reader's own OS setting, because #141's design confirmed the admin site light-only.

`src/admin/router.ts` is a client-side router (`vue-router`, history mode) rather than `#` fragments, so a reload or a shared link lands back on the same screen — the worker answers the same built page for every `/admin/*` path (see "`/admin` and Cloudflare Access" above) and leaves picking a screen to the browser.

`src/admin/AdminShell.vue` is the outer frame every screen sits inside: the top bar (page name, the email `GET /admin/api/me` answers with), and the sidebar's three groups (やること, データ, 運用) in the same order as the public site's own nav. Only 公開's own count is shown — `GET /admin/api/footprints/pending`'s `pending`/`changed` together — because that is the only one this task's own screens can compute; every other sidebar item names itself without a count until a later task builds the screen behind it (`src/admin/pages/PlaceholderPage.vue` in the meantime). The table/edit-panel split (`.main`/`.pane`/`.inspector`) narrows at two widths, `@container` rather than `@media`: `src/admin/shell.css`'s own comment says why.

Two screens exist so far, both reusing #158/#160's `/admin/api/footprints/*`:

- あしあと (`src/admin/pages/FootprintsPage.vue`, `src/admin/components/FootprintsInspector.vue`) — the table (narrowed by `status` and a title substring) and the edit panel (read, save, 公開にする/下書きに戻す, delete). A save's 400 is shown on the panel's own band, and `src/admin/lib/footprints.ts`'s `fieldForSaveError` reads the worker's own message to mark which field it is about, rather than a second copy of the worker's validation living here too.
- 公開 (`src/admin/pages/PublishPage.vue`) — `GET .../pending`'s two lists and `いま公開する`. Genet music's own publish gate (task 10) has no PR on `main` yet, so this screen has no ジェネット楽曲一覧 section until it does.

The screen-side logic worth testing without a browser — the table's own query string, which field a save error names, which buttons the edit panel shows for a given `status` — is pulled out into `src/admin/lib/*.ts` and tested under `test/admin/lib/`, the same split the rest of this project's frontend already uses for its own `src/lib/*.ts`.

### `/members/<id>` and `/videos/<id>`

`/members/<channel id>` and `/videos/<video id>` are permalinks to one member or one stream/video (#137), so that sharing one carries that name rather than the site's own title. Neither has a page of its own yet — a later PR adds them — so today `worker/src/pages/index.ts` rewrites whatever `ASSETS` serves at `/members/` or `/videos/` and answers 404, unrewritten, until that page exists. The worker reaches these requests the same way it reaches `/api/*`: no built file answers `/members/<id>` exactly, so Cloudflare wakes the worker instead of serving one directly.

`[assets]` in `wrangler.toml` carries a `binding = "ASSETS"` for this reason — `directory` alone, which every other page already relies on, only lets Cloudflare serve a matching file itself and gives the worker no way to fetch one. `env.ASSETS.fetch()` reads the exact same built files that binding already serves.

A request's id is checked against the shape YouTube gives it — `UC` followed by 22 characters for a channel, 11 characters for a video — before D1 is asked, and answered 404 without a query if it does not match. A well-shaped id D1 has no row for is also 404. Once a row is found, the page's `<title>`, `og:title` and `og:url` are rewritten with `HTMLRewriter`, and its `ETag` is dropped: the header would otherwise still name the unrewritten body, and a conditional request against it could get a `304` carrying the wrong title.

## Database

The collected data lives in a Cloudflare D1 database named `kemov`, running in the APAC region. Everything the site publishes can be rebuilt from it. The commands below need wrangler, which comes with the Worker setup.

A region is chosen when the database is created and never again, so moving it means creating another one and copying the data across.

### Who Writes Which Column

`channel` has two writers, and one that ignores the split erases the other's work.

| Columns                                                                                                       | Written by                                     |
| ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `channel_id`, `name`, `fullname`, `globalname`, `twitter`, `twitch`, `color_*`, `activity_*`, `display_order` | The deploy's initial seed, from `channels.yml` |
| `custom_url`, `thumbnail_url`, `fetched_at`                                                                   | The collector, from `Channels.list`            |

Seeding from the YAML therefore names only those columns, and only for a row that does not exist yet - see "The Channel Master" below. Every other table is the collector's alone.

### The Channel Master

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

### Retiring a Streamer

Give the entry an `activity_end_date`. Never delete one.

`channel_snapshot` and `video` reference `channel`, so D1 refuses a delete that would leave them pointing at nothing. That refusal is deliberate: a line dropped from this file must not be able to take years of collected history with it. A streamer who stops still has the history of when they did not.

### Seeding the Channel Table

The deploy turns the file into one `INSERT ... ON CONFLICT DO NOTHING` and applies it. The same two commands fill a local database:

```sh
bun run build-channels-sql .wrangler/channels.sql
bun wrangler d1 execute kemov --local --file .wrangler/channels.sql
```

The generated SQL is not committed. It is whatever the file says at the moment it runs, and a copy in the repository would be one more thing that can disagree with the file. `.wrangler/` is gitignored, which is why the example writes there.

The statement names the deploy's columns and nothing else, so `custom_url`, `thumbnail_url` and `fetched_at` keep whatever the last collection put there. It only inserts: a channel already in the table keeps every column it has, whatever this file now says, and a channel the file no longer lists keeps its row too.

### Applying Migrations

`migrations/` holds one SQL file per change, applied in filename order. wrangler records what it has applied in a `d1_migrations` table, so applying twice does nothing the second time.

Against a local SQLite file, which needs no Cloudflare account:

```sh
bun wrangler d1 migrations list kemov --local
bun wrangler d1 migrations apply kemov --local
```

Against the real database, which needs the account credentials:

```sh
bun wrangler d1 migrations apply kemov --remote
```

That command is not usually typed by hand. `Deploy Worker` runs it ahead of every deploy, so a migration reaches the real database on the same push as the code that expects it; see [Deployment](#the-worker).

### Adding a Migration

An applied file is never edited. wrangler tracks files by name, so an edit reaches a fresh database and no existing one, and the two then disagree about what the schema is. Change the schema by adding the next file instead:

```sh
bun wrangler d1 migrations create kemov <what-it-does>
```

That writes `migrations/000N_<what-it-does>.sql`. Put the forward SQL there and the SQL that undoes it in `migrations/rollback/000N_<what-it-does>.sql`.

Then prove the pair runs against an empty database. The local database keeps whatever earlier runs left in it, and `migrations apply` skips a file it has already recorded, so pointing `--persist-to` at a directory that does not exist yet is what makes the run start from nothing:

```sh
bun wrangler d1 migrations apply kemov --local --persist-to .wrangler/check
bun wrangler d1 execute kemov --local --persist-to .wrangler/check --file migrations/rollback/000N_<what-it-does>.sql
rm -rf .wrangler/check
```

The first command must report every migration as applied, not just the new one. If it reports fewer, the directory was not empty.

### Rolling Back

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

### Backups

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

### Restoring from a Backup

The steps below were run end to end on 2026-09-08, against a real remote D1 and the real bucket, and are written from the commands that were actually issued for the three tables that existed then — `channel`, `video` and `channel_snapshot`. Step 1's command has since been generalized to cover every table `BACKED_UP_TABLES` added afterward. What that generalization was and was not checked against is in [What This Has Not Been Tried On](#what-this-has-not-been-tried-on) after these steps; a restore is not the moment to find out which is which.

The target was a database created for the test, empty and never migrated. Substitute its name for `kemov-restore` throughout.

**1. Give it the schema.** The backup files hold `INSERT` statements and nothing else, so every one of them fails on a database with no tables. Apply every file in `migrations/`, in filename order — not only `0001`: a table `BACKED_UP_TABLES` added later, such as `revision` or `publication` (from `0005_add_revision_and_publication.sql`), needs its own migration applied first, or its backup file fails the same way:

```sh
for f in migrations/*.sql; do
  bun wrangler d1 execute kemov-restore --remote --file "$f"
done
```

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

`revision` and `publication` each refuse a DELETE by trigger (see [Backups](#backups) above): append-only holds here the same way it holds in `worker/test/backup.test.ts`'s `clearEverything`, so the trigger has to come off for the DELETE below and go back on right after, the same way that test does it. The two `CREATE TRIGGER` statements are copied from `migrations/0005_add_revision_and_publication.sql`, so this drifts if that migration's trigger text ever changes without this being updated too:

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

### What Expires and What Does Not

**Prefix-specific lifecycle rules are set on `kemov-backup`, in addition to its existing Default Multipart Abort Rule, because one rule covering the whole bucket would be wrong.**

| Prefix                                                                                                                                                                                                                                                                                                                                                                                | Retention    | Why                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `video/`                                                                                                                                                                                                                                                                                                                                                                              | 30 days      | Each file is a complete copy, collected fresh from the YouTube API. The newest one is all that is needed; older ones are duplicates. |
| `channel/`, `channel_snapshot/`, `channel_snapshot_exclusion/`, `video_override/`, `footprints_event/`, `footprints_event_member/`, `footprints_event_source/`, `genet_person/`, `genet_tune/`, `genet_tune_attribute/`, `genet_tune_attribute_person/`, `genet_tune_video/`, `genet_tune_score/`, `genet_stream/`, `genet_performance/`, `genet_scene/`, `revision/`, `publication/` | **365 days** | See below.                                                                                                                           |

`channel_snapshot/` and `revision/` hold one file per day and no other file holds that day: deleting one leaves a hole in the history that nothing can fill. That hole is a hole in R2, not in the history itself — both tables only ever gain rows in D1 (see [Backups](#backups) above), so D1 already holds every day of either forever. R2's copy exists to restore D1 if D1 is what breaks, and that need shows up right after an incident, not a year later — 365 days bounds how long the copy waits around for that, not how long the history survives.

Every other table in the 365-day row holds data a person typed once through the admin site rather than data the collector can fetch again — `channel` joined this group for the same reason, once `channel` itself became a table people edit rather than one only the collector wrote to. `video/` is the one table this reasoning does not reach: losing 30 days of it costs nothing beyond a slower rebuild, because it can be recollected from the YouTube API.

The snapshot history began on 2026-09-07 and exists nowhere else in R2. A day of it is about 119 KiB of SQL, measured against production values on 2026-09-08, so a year of it costs some 44 MB; `video` adds roughly 70 MB more at 30 days (`channel`'s own few dozen rows barely move that figure). Both fit well inside R2's free 10 GB tier; the tables #144 added hold at most a few hundred rows each and add little beside that.

Set with `lifecycle add` calls, run from the repository root. `channel/`'s existing 30-day rule is replaced rather than added beside, since a prefix can carry only one rule. `-y` skips the confirmation `add` otherwise asks for, which would stop the loop partway through:

```sh
bun wrangler r2 bucket lifecycle add kemov-backup expire-video-30d video/ --expire-days 30 -y
bun wrangler r2 bucket lifecycle remove kemov-backup --name expire-channel-30d
bun wrangler r2 bucket lifecycle add kemov-backup expire-channel-365d channel/ --expire-days 365 -y
bun wrangler r2 bucket lifecycle add kemov-backup expire-channel-snapshot-365d channel_snapshot/ --expire-days 365 -y

for t in channel_snapshot_exclusion video_override footprints_event footprints_event_member footprints_event_source \
         genet_person genet_tune genet_tune_attribute genet_tune_attribute_person genet_tune_video genet_tune_score \
         genet_stream genet_performance genet_scene revision publication; do
  bun wrangler r2 bucket lifecycle add kemov-backup "expire-${t//_/-}-365d" "$t/" --expire-days 365 -y
done
```

Not `lifecycle set --file <json>`: `set` replaces the bucket's whole ruleset, and the existing "Default Multipart Abort Rule" (7 days, all prefixes) would be lost if it were left out of that file. `add` and `remove` only touch the one rule named, so the calls above cannot touch it.

**The trailing slash matters.** `genet_tune` as a prefix also matches `genet_tune_attribute/`, and `video` matches `video_override/`, which would expire either at the wrong retention. Every prefix above ends in `/` for this reason.

Check with `bun wrangler r2 bucket lifecycle list kemov-backup`; it should list 20 rules — the 19 above plus the Default Multipart Abort Rule that was already there.

### Public Data

The admin site publishes JSON to its own bucket, `kemov-public`, bound as `PUBLIC_DATA` (#144). No lifecycle rule is set on it: a publish overwrites the same key every time, so there is never an old object for a rule to expire.

It is not backed up. Every published object is built from `revision`, which is backed up, so losing `kemov-public` costs a republish rather than the data itself — the same reasoning that keeps `collect_task` and `chat_author` out of `kemov-backup` (see [Backups](#backups) above), applied to a bucket instead of a table.

Nothing writes to it yet - publishing is later work - but `/api` already serves it. `GET /api/footprints/events` and `GET /api/genet/music` pass the bucket's `footprints/events.json` and `genet/music.json` straight through: the same bytes, the object's own `ETag` and `Last-Modified`, and no reparsing. Until a publish exists to write either key, both answer 404 with `{"error":"not published yet"}`. `If-None-Match` is honoured with 304, and HEAD answers with the same status and headers as GET but no body.

The bucket does not exist until created once, before deploying the code that binds it:

```sh
bun wrangler r2 bucket create kemov-public
```

## Deployment

One `Deploy` workflow puts up the worker and the site together, on every push to `main` and on demand from the Actions tab. There is no second project and no GitHub Pages: `wrangler.toml` declares `dist/` as the worker's static assets, so `bun wrangler deploy` uploads the built site alongside the code that answers `/api`.

Cloudflare serves a request that matches a built file directly and never wakes the worker for it, so the worker's `fetch` sees `/api/*` and the paths that are not files. The split between site and API is therefore a branch in code rather than a route pattern in a dashboard.

They were two workflows until #70. Two meant one could go green while the other did not, and that happened: the worker deployed successfully with none of its secrets registered, and nothing was collected for two and a half hours.

Build output is not committed: `bun run build` writes to `dist/`, which is ignored.

To roll back, revert the commit and let the workflow redeploy. `bun wrangler rollback` is the faster route when what is deployed is already broken.

### What the workflow does

It builds the site into `dist/`, applies the migrations, seeds the `channel` table from `channels.yml`, and then runs `bun wrangler deploy`. The build is first because it needs no credentials and a failure there should not leave a migration applied for code that never shipped. Migrations come before the deploy so that the code never arrives at a schema older than itself, and the `d1_migrations` table makes the step a no-op on a push that adds none. The seed follows the migrations because it needs the columns to exist, and precedes the deploy so that the worker never runs against a `channel` table older than the `channels.yml` it shipped with.

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
