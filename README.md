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

### Compile and Hot-Reload for Development

Default URL: http://localhost:5173/kemov/

```sh
yarn dev
```

### Type-Check, Compile and Minify for Production

```sh
yarn build
```

### Preview Compiled Project for Production

Default URL: http://localhost:4173/kemov/

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
yarn wrangler secret put YOUTUBE_API_KEY        # prompts, so the value misses the shell history
yarn wrangler secret put YOUTUBE_INNERTUBE_KEY
yarn wrangler secret list                       # names only, never values
```

The two keys are different things, and `worker/src/lib/env.ts` says which is which. `YOUTUBE_API_KEY` is this project's own Data API key. `YOUTUBE_INNERTUBE_KEY` is the one the internal endpoints take: the same string for every visitor, served in the HTML of any YouTube page, spending no quota.

That second one is here anyway, and #92 says why. It was a constant in the source until GitHub reported it as a leaked key. It was not one — but nothing reading this repository can tell a value in that shape from a key that is real, and a comment saying "this one is fine" is a claim rather than something a reader can check. Left as it was, it would have taught everyone to read the next such report as noise.

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

| Columns                                                                            | Written by                          |
| ---------------------------------------------------------------------------------- | ----------------------------------- |
| `channel_id`, `name`, `fullname`, `globalname`, `twitter`, `color_*`, `activity_*` | The deploy, from `channels.yml`     |
| `custom_url`, `thumbnail_url`, `fetched_at`                                        | The collector, from `Channels.list` |

Seeding from the YAML therefore upserts those columns by name. Replacing the whole row would blank what the collector has fetched. Every other table is the collector's alone.

### The Channel Master

`channels.yml` at the repository root holds the deploy's half of that table, one entry per streamer, ordered by `activity_start_date`:

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

That reports every problem in the file at once rather than the first: an id that is not a YouTube channel id, a colour that is not `#RRGGBB`, a handle written with the `@`, a date that does not exist, a field name with a typo in it, the same channel twice, an entry out of order.

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

## Deployment

The site is built and published by the `Deploy` workflow on every push to `main`, and GitHub Pages serves that artifact. Build output is not committed: `yarn build` writes to `dist/`, which is ignored.

To roll back, revert the commit and let the workflow redeploy. The workflow can also be run by hand from the Actions tab.

### The Worker

`Deploy Worker` applies the migrations, seeds the `channel` table from `channels.yml`, and then runs `yarn wrangler deploy`, on every push to `main` and on demand from the Actions tab. Migrations go first so that the code never arrives at a schema older than itself, and the `d1_migrations` table makes the step a no-op on a push that adds none. The seed follows them because it needs the columns to exist, and comes before the deploy so that the worker never runs against a `channel` table older than the `channels.yml` it shipped with.

It type checks and tests the worker before any of that, in a job that holds no credentials, and afterwards checks that the secrets the worker reads are registered; see [Worker Secrets](#worker-secrets). It has no path filter: what Cloudflare runs is whatever is on `main`. The wrangler it uses comes from the lockfile, so a deploy uses the version the repository was tested against.

Its credentials come from a GitHub **environment** rather than from repository secrets. An environment secret is only readable by a job that names the environment; a repository secret is readable by every workflow in the repository, including one running from a pull request branch, and most of them have no business holding a token that can deploy.

| Setting             | Value                                           |
| ------------------- | ----------------------------------------------- |
| Environment         | `cloudflare`                                    |
| Deployment branches | `main` only                                     |
| Secrets             | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` |

Settings → Environments → New environment → name it `cloudflare` → under Deployment branches choose "Selected branches and tags" and add `main` → then Add environment secret twice, once per name above. The token needs the "Edit Cloudflare Workers" template plus D1 Edit, because the worker carries a D1 binding.

To roll back, revert the commit and let the workflow redeploy. `yarn wrangler rollback` is the faster route when the worker is already broken.

## LICENSE

[MIT](LICENSE.md)

### Copyright Warning

_KemoV_ works (such as images) are copyrighted by [Kemono Friends Project](https://kemono-friends.jp/) (KFP) and [Kemono Friends V Project](https://www.kemov-project.com/) (KFPV). These contents cannot be included in this repository, but can instead be used by linking to them.
