# kemov

This is _Unofficial_ KemoV fan pages! 🐾

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

| Variable         | Used by              | Notes                       |
| ---------------- | -------------------- | --------------------------- |
| `VITE_API_PROXY` | the statistics pages | `vite dev` only — see below |
| `VITE_API_BASE`  | the statistics pages | `vite dev` only — see below |

The published site leaves both unset and asks `/api` on its own origin, because the worker that answers the API also serves these pages. Under `bun run dev` the pages come from vite on port 5173 and the worker is not there at all, so tell the dev server where to send `/api`:

```sh
echo 'VITE_API_PROXY=https://kemov.nanase.cc' >> .env.development.local
```

The pages still ask their own origin and vite forwards it, which is what makes the answers readable: the API sends no `Access-Control-Allow-Origin`, so a page that asks another host directly has every response refused by the browser before it arrives. A `wrangler dev` works the same way — `VITE_API_PROXY=http://localhost:8787`.

`VITE_API_BASE` is the older setting and points the pages straight at another host. It is only usable where that host allows this origin, which the deployment does not, so prefer `VITE_API_PROXY`.

The dev server reads `.env.development.local` at startup. Restart it after changing the file.

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
bun run screenshot screenshots stats=http://localhost:4173/stats/ videos=http://localhost:4173/videos/
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

The worker runs on workerd and shares no lib, global or path alias with the frontend, so it has its own `worker/tsconfig.json` and its own vitest project:

```sh
bun run type-check          # frontend
bun run type-check:worker   # worker
bun run test                # every project
bun run vitest run --project worker   # worker only
```

```sh
bun wrangler login                                        # once per machine
bun wrangler d1 execute DB --remote --command "select 1"
```

`--local` needs neither an account nor a network. It runs against a SQLite database under `.wrangler/`.

```sh
bun wrangler d1 execute DB --local --command "select 1"
```

## Documentation

How the site is put together and how it is run lives under `docs/`.

- Guides: what to do
  - [Migrations](docs/guides/migrations.md)
  - [Recovery](docs/guides/recovery.md)
  - [Deployment](docs/guides/deployment.md)
- Reference: how it works, and why
  - [Architecture](docs/reference/architecture.md)
  - [Admin Site](docs/reference/admin.md)
  - [Data](docs/reference/data.md)

## LICENSE

[MIT](LICENSE.md)

### Copyright Warning

_KemoV_ works (such as images) are copyrighted by [Kemono Friends Project](https://kemono-friends.jp/) (KFP) and [Kemono Friends V Project](https://www.kemov-project.com/) (KFPV). These contents cannot be included in this repository, but can instead be used by linking to them.
