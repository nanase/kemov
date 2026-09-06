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
yarn test                # both
yarn vitest run --project worker   # worker only
```

`wrangler.toml` still holds placeholders for `account_id` and `database_id`, so anything that reaches Cloudflare fails until #73 fills them in: `wrangler deploy`, and any command given `--remote`.

`--local` is a different matter and works today. It runs against a SQLite database under `.wrangler/`, wants no account and no network, and carries the placeholders through without looking at them.

```sh
yarn wrangler d1 execute DB --local --command "select 1"
```

### Worker Secrets

No secret value belongs in this repository — not in `wrangler.toml`, not in a workflow file, not in `.env`. `wrangler.toml` names bindings; it never carries their values.

Cloudflare stores the values instead, and `wrangler` is how they get there:

```sh
yarn wrangler secret put YOUTUBE_API_KEY   # prompts, so the value misses the shell history
yarn wrangler secret list                  # names only, never values
```

For local runs, put the same names in `.dev.vars` at the repository root as `NAME=value` lines. `.dev.vars` and `.dev.vars.*` are gitignored.

Actions reads the Cloudflare API token from a repository secret rather than from a file. Deploying from Actions is set up in #73.

`.env` is a different thing and is committed on purpose: Vite inlines it into the published bundle, so what it holds is already public.

## Database

The collected data lives in a Cloudflare D1 database named `kemov`. Everything the site publishes can be rebuilt from it. The commands below need wrangler, which comes with the Worker setup.

### Who Writes Which Column

`channel` has two writers, and one that ignores the split erases the other's work.

| Columns                                                                            | Written by                          |
| ---------------------------------------------------------------------------------- | ----------------------------------- |
| `channel_id`, `name`, `fullname`, `globalname`, `twitter`, `color_*`, `activity_*` | The deploy, from `channels.yml`     |
| `custom_url`, `thumbnail_url`, `fetched_at`                                        | The collector, from `Channels.list` |

Seeding from the YAML therefore upserts those columns by name. Replacing the whole row would blank what the collector has fetched. Every other table is the collector's alone.

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

## LICENSE

[MIT](LICENSE.md)

### Copyright Warning

_KemoV_ works (such as images) are copyrighted by [Kemono Friends Project](https://kemono-friends.jp/) (KFP) and [Kemono Friends V Project](https://www.kemov-project.com/) (KFPV). These contents cannot be included in this repository, but can instead be used by linking to them.
