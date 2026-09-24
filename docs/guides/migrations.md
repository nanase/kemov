# Migrations

## Applying Migrations

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

That command is not usually typed by hand. `Deploy Worker` runs it ahead of every deploy, so a migration reaches the real database on the same push as the code that expects it; see [Deployment](../reference/architecture.md#deployment).

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
