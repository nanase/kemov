# Architecture

## Worker

Collection and the HTTP API run as one Cloudflare Worker. Its code lives under `worker/`, separate from the frontend in `src/`, and `wrangler.toml` at the root configures it.

```text
worker/src/collector/   scheduled collection jobs
worker/src/api/         the HTTP API
worker/src/pages/       /members/<id> and /videos/<id> (see below)
worker/src/lib/         shared code
worker/test/            tests
```

## `/members/<id>` and `/videos/<id>`

`/members/<channel id>` and `/videos/<video id>` are permalinks to one member or one stream/video (#137), so that sharing one carries that name rather than the site's own title. Each has one built page, `dist/members/index.html` and `dist/videos/index.html` (`vite.config.ts` builds both from `src/members/` and `src/videos/`), and `worker/src/pages/index.ts` rewrites whatever `ASSETS` serves at `/members/` or `/videos/` for the id asked. The worker reaches these requests the same way it reaches `/api/*`: no built file answers `/members/<id>` exactly, so Cloudflare wakes the worker instead of serving one directly.

`[assets]` in `wrangler.toml` carries a `binding = "ASSETS"` for this reason — `directory` alone, which every other page already relies on, only lets Cloudflare serve a matching file itself and gives the worker no way to fetch one. `env.ASSETS.fetch()` reads the exact same built files that binding already serves.

A request's id is checked against the shape YouTube gives it — `UC` followed by 22 characters for a channel, 11 characters for a video — before D1 is asked, and answered 404 without a query if it does not match. A well-shaped id D1 has no row for is also 404. Once a row is found, the page's `<title>`, `og:title` and `og:url` are rewritten with `HTMLRewriter`, and its `ETag` is dropped: the header would otherwise still name the unrewritten body, and a conditional request against it could get a `304` carrying the wrong title.

## The Colour Theme and Its Cookie

A reader's choice of `light` or `dark` (`ThemeToggle`) is kept in two places: `localStorage`, which the page's own script reads, and a cookie of the same name, `kemov-theme`, which the worker reads (#182). The cookie exists because the browser paints a page's canvas before it has parsed any of it, from the `color-scheme` meta. That meta says `light dark`, so a reader who chose light under a dark OS saw a dark frame between one page and the next, and no script in the page can run early enough to prevent it.

`worker/src/lib/theme.ts` answers the built HTML pages with `HTMLRewriter`: for a `light` or `dark` cookie it sets `data-theme` on `<html>` and narrows the `color-scheme` meta to that value. A missing cookie, `system`, or any value that is not `light` or `dark` is answered untouched — `themeFromCookieHeader` in `src/shell/theme.ts` is the one place that decides that, and the frontend and the worker both call it.

- The cookie holds `light` or `dark` and nothing else, so it identifies no one. `Path=/; SameSite=Lax; Secure; Max-Age=` one year. It is not `HttpOnly`, because a script writes it. `system` is the absence of a cookie. Nothing logs it.
- `head.html`'s inline script copies a stored setting into the cookie when the cookie is missing or disagrees. Without it the readers who chose before the cookie existed would never get one, and a reader whose cookie expired would flash until they pressed the toggle again. Those readers see one dark frame on their first visit after the deploy; the second is right.
- `run_worker_first` in `wrangler.toml` lists exactly the HTML paths, `worker/src/lib/themed-pages.ts` lists the same, and `test/worker-config.test.ts` holds the two to each other and to the pages `vite.config.ts` builds. A path listed there costs one worker invocation per page view; the hashed scripts, stylesheets, fonts and images are not listed and are still served without the worker. `/admin/` is not listed: it is light only.
- The answers are `Cache-Control: private, no-cache` and `Vary: Cookie`, with no `ETag`: the body depends on the cookie, so it must not sit in a shared cache, and a `304` against the file's own ETag would keep a page written for another setting. `no-cache` rather than `no-store`, which stops some browsers restoring a page on back and forward. A new page that carries the `color-scheme` meta has to be added to both lists.

## Deployment

One `Deploy` workflow puts up the worker and the site together, on every push to `main` and on demand from the Actions tab. There is no second project and no GitHub Pages: `wrangler.toml` declares `dist/` as the worker's static assets, so `bun wrangler deploy` uploads the built site alongside the code that answers `/api`.

Cloudflare serves a request that matches a built file directly and never wakes the worker for it, so the worker's `fetch` sees `/api/*` and the paths that are not files. The split between site and API is therefore a branch in code rather than a route pattern in a dashboard.

They were two workflows until #70. Two meant one could go green while the other did not, and that happened: the worker deployed successfully with none of its secrets registered, and nothing was collected for two and a half hours.

Build output is not committed: `bun run build` writes to `dist/`, which is ignored.

## What the workflow does

It builds the site into `dist/`, applies the migrations, seeds the `channel` table from `channels.yml`, and then runs `bun wrangler deploy`. The build is first because it needs no credentials and a failure there should not leave a migration applied for code that never shipped. Migrations come before the deploy so that the code never arrives at a schema older than itself, and the `d1_migrations` table makes the step a no-op on a push that adds none. The seed follows the migrations because it needs the columns to exist. It only adds a row for a channel that `channel` does not have yet (see [The Channel Master](data.md#the-channel-master)), so it precedes the deploy for a streamer newly listed in `channels.yml`: the worker never runs without that streamer's row.

It type checks and tests both the frontend and the worker before any of that, in a job that holds no credentials, and afterwards checks that the secrets the worker reads are registered; see [Worker Secrets](../guides/deployment.md#worker-secrets). It has no path filter: what Cloudflare runs is whatever is on `main`. The wrangler it uses comes from the lockfile, so a deploy uses the version the repository was tested against.
