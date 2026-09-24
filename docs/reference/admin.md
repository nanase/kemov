# Admin Site

## `/admin` and Cloudflare Access

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

An event passes through a publish gate rather than taking effect on save, the same as the table above already draws the line for `footprints_event` and `genet_stream`. Creating, updating and deleting an event logs no `revision` at all; only `publish` and `withdraw` do, in the same `db.batch` as the `status` change. `POST .../publish` refuses with 400 and every failing condition together when the event is not ready — an empty `title`, `sourcePending: false` with no source that counts (see [The Source Whitelist](#the-source-whitelist) below), or a `videoId` that is not 11 characters. Publishing an already-published event is allowed, and is how an event `GET .../pending` reports as changed gets a fresh `publish` revision matching its current row.

### The Source Whitelist

`sourcePending: false` needs either one source on the whitelist, or sources on two different hosts. The whitelist is the URL prefixes of a source strong enough to stand alone — the project's own domains and accounts, partners' announcements, an event's organizer, two fan wikis. It is the `source_whitelist` table (`migrations/0008_add_source_whitelist.sql`, #175), seeded with the 13 entries the code once held as a constant, and read by `worker/src/lib/source-whitelist.ts` on every publish. The check itself, `isWhitelistedSource`, is a prefix match with a boundary check on what follows it, so `https://x.com/KEMOVP_staff_fake` does not count as `https://x.com/KEMOVP_staff`; it takes the list as an argument, and nothing else decides what counts.

Two sources on different hosts are enough without either being listed: two URLs on the same host, such as two YouTube videos, only repeat one another. A host is what `new URL(url).hostname` reads, less a leading `www.`, with `twitter.com` counted as `x.com` and `youtu.be` and `m.youtube.com` as `youtube.com` (`HOST_ALIASES` in `worker/src/lib/source-whitelist.ts`, which keeps to hosts known to be the same resource written another way): two URLs for one post, or one account, are one source. This is only for counting hosts; the whitelist match compares the URL's own text.

| Method | Path                                   | Answers with                                                  |
| ------ | -------------------------------------- | ------------------------------------------------------------- |
| GET    | `/admin/api/source-whitelist`          | Every entry, in the order it was added                        |
| POST   | `/admin/api/source-whitelist`          | The entry after adding it - 409 if the prefix is on it        |
| PUT    | `/admin/api/source-whitelist/<prefix>` | The entry after changing its `note`, the only editable column |
| DELETE | `/admin/api/source-whitelist/<prefix>` | `{}`                                                          |

`<prefix>` is the URL, percent-encoded into one path segment. Saving takes effect at once and logs no `revision`: the list is a setting of the publish gate, not something published. Removing an entry changes what the next publish accepts and nothing already published — an event that is live stays live, and one whose only source that entry covered is refused when somebody next publishes it. Nothing refuses a removal because an event still uses the entry.

`POST /admin/api/footprints/publish` builds `footprints/events.json` from the latest `revision` of every event whose latest action is not `withdraw`, writes it to `PUBLIC_DATA`, and appends one `publication` row recording the newest `revision_id` it saw. Nothing is written when there is nothing newer than the last run.

### Genet Music: Editing and Publishing

| Method | Path                                           | Answers with                                                                                                                      |
| ------ | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/admin/api/genet/people`                      | Every `genet_person` row                                                                                                          |
| POST   | `/admin/api/genet/people`                      | The row after creating it                                                                                                         |
| GET    | `/admin/api/genet/people/<person ID>`          | One row                                                                                                                           |
| PUT    | `/admin/api/genet/people/<person ID>`          | The row after replacing it                                                                                                        |
| DELETE | `/admin/api/genet/people/<person ID>`          | `{}` - 409 instead, if a tune still credits them                                                                                  |
| GET    | `/admin/api/genet/tunes`                       | Every `genet_tune` row, with its attributes, videos and scores                                                                    |
| POST   | `/admin/api/genet/tunes`                       | The row after creating it                                                                                                         |
| GET    | `/admin/api/genet/tunes/<tune ID>`             | One row, with its attributes, videos and scores                                                                                   |
| PUT    | `/admin/api/genet/tunes/<tune ID>`             | The row after replacing it, its attributes, videos and scores                                                                     |
| DELETE | `/admin/api/genet/tunes/<tune ID>`             | `{}` - 409 instead, if a stream still performs it                                                                                 |
| GET    | `/admin/api/genet/streams`                     | Every `genet_stream` row, with its performances and scenes                                                                        |
| POST   | `/admin/api/genet/streams`                     | The row after creating it in `draft`                                                                                              |
| GET    | `/admin/api/genet/streams/<video ID>`          | One row, with its performances and scenes                                                                                         |
| PUT    | `/admin/api/genet/streams/<video ID>`          | The row after replacing it, its performances and scenes - `status` unchanged                                                      |
| DELETE | `/admin/api/genet/streams/<video ID>`          | `{}` - 409 instead, if the stream is `published`                                                                                  |
| POST   | `/admin/api/genet/streams/<video ID>/publish`  | The row after validating it (and the tunes/people it performs) and setting `status` to `published`                                |
| POST   | `/admin/api/genet/streams/<video ID>/withdraw` | The row after setting `status` back to `draft`                                                                                    |
| GET    | `/admin/api/genet/pending`                     | Streams, tunes and people not yet reflected in the published JSON, and published streams/tunes/people whose row has since changed |
| POST   | `/admin/api/genet/publish`                     | Whether anything was published, and how many streams/tunes/people if so                                                           |

`GET /admin/api/genet/tunes` takes `q` (a substring of `title`); `GET /admin/api/genet/streams` takes `status` and `q`, the same as footprints' own list endpoints.

`genet_tune` and `genet_person` carry no `status` of their own - #141's design gives only `genet_stream` a publish gate - so saving either logs no `revision`. Publishing a stream validates it together with every tune it performs and every person one of those tunes credits, and logs a `publish` revision for the stream and for whichever of those tunes/people do not already match their own latest revision, all in one `db.batch`. `POST /admin/api/genet/streams/<video ID>/publish` collects every failing condition into one 400 answer, the same as footprints' own publish endpoint - an empty `title`, a `videoId` that is not 11 characters (`youtube` streams only), an invalid `publishedAt`, no performances, a performance or scene referring to a tune/video that does not exist (this last pair cannot actually happen through this API, since the underlying foreign keys are enforced at save time already; the check stays as a second line of defense), a tune attribute with both `text` and credited people, or an empty tune title/person name.

`POST /admin/api/genet/publish` builds `genet/music.json` from the latest `revision` of every stream whose latest action is not `withdraw`, together with every tune and person those streams' own published bodies name - not a fresh read of the working tables, so a tune dropped from a stream after it was published cannot leak back into the JSON. Streams, tunes and people share one `publication` row (`target = 'genet_music'`).

The JSON also carries `shape_version` (`GENET_MUSIC_SHAPE_VERSION` in `genet-publish.ts`) and `channel_id`, the channel whose icon the page draws beside its title. `channel_id` is the channel that at least half of the published YouTube streams found in `video` belong to, and that leads every other; it is `null` when no channel does, and the page then keeps its coloured circle. A run finds the version by reading the stored JSON itself, not the `publication` row, and builds again when it is older than the one in the code (a JSON with no `shape_version` is version 1) even though no revision is newer. Raise the constant whenever the shape changes, and the change reaches the public JSON on the next "いま公開する".

### Read-Only Admin Endpoints

A few of the data screens have nothing to save through - they only pick a row to act on elsewhere, or read a record no other endpoint exposes. None of these log a `revision`.

| Method | Path                                                      | Answers with                                                                                                                                                  |
| ------ | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/admin/api/videos`                                       | `video` rows, narrowed by `q` (a substring of `title`), `channelId` and `limit` (default 50, up to 100), for 配信・動画 to pick one to override               |
| GET    | `/admin/api/snapshots`                                    | `channel_snapshot` ticks for `channelId` between `from`/`to` (Japan-time dates, both default to today), plus any `channel_snapshot_exclusion` over that range |
| GET    | `/admin/api/collect-tasks`                                | Every `failed`, not yet acknowledged `collect_task` row, and how many                                                                                         |
| POST   | `/admin/api/collect-tasks/<kind>/<target ID>/retry`       | The row after setting it back to `pending`                                                                                                                    |
| POST   | `/admin/api/collect-tasks/<kind>/<target ID>/ack`         | The row after stamping `checked_at`, dropping it off the list above                                                                                           |
| POST   | `/admin/api/collect-tasks/<kind>/<target ID>/unavailable` | The row after settling `video.availability` as `unavailable` - 400 for a channel failure, not a video's                                                       |
| GET    | `/admin/api/revisions`                                    | `revision` rows, most recent first, narrowed by `entity`, `action`, `from`/`to` (Japan-time dates) and `limit` (default 50, up to 200)                        |
| GET    | `/admin/api/revisions/<revision ID>`                      | One `revision` row, `body` included                                                                                                                           |
| GET    | `/admin/api/publications`                                 | Every `publication` row, most recent first                                                                                                                    |

### The Admin Site

`src/admin/` is the admin site's own frontend (#141, #144) — plain Vue, plain HTML and CSS, no Vuetify, because #127's decision to keep the admin site apart from the public site's own component library applies here too. It shares one thing with the public site: `src/shell/tokens.css`'s colour variables. It does not share the public site's own shell (`SiteNav.vue` and friends) or its dark theme — `src/admin/index.html` fixes `<html data-theme="light">`, which pins every colour tokens.css defines to its light block regardless of the reader's own OS setting, because #141's design confirmed the admin site light-only.

`src/admin/router.ts` is a client-side router (`vue-router`, history mode) rather than `#` fragments, so a reload or a shared link lands back on the same screen — the worker answers the same built page for every `/admin/*` path (see "`/admin` and Cloudflare Access" above) and leaves picking a screen to the browser.

`src/admin/AdminShell.vue` is the outer frame every screen sits inside: the top bar (page name, the email `GET /admin/api/me` answers with), and the sidebar's three groups (やること, データ, 運用) in the same order as the public site's own nav. Only 公開's own count is shown — `GET /admin/api/footprints/pending`'s `pending`/`changed` together — because that is the only one this task's own screens can compute; every other sidebar item names itself without a count until a later task builds the screen behind it (`src/admin/pages/PlaceholderPage.vue` in the meantime). The table/edit-panel split (`.main`/`.pane`/`.inspector`) narrows at two widths, `@container` rather than `@media`: `src/admin/shell.css`'s own comment says why.

A few screens worth calling out beyond the general shell above:

- あしあと (`src/admin/pages/FootprintsPage.vue`, `src/admin/components/FootprintsInspector.vue`) — the table (narrowed by `status` and a title substring) and the edit panel (read, save, 公開待ちにする/下書きに戻す, delete - the chip says 公開待ち until the 公開 screen's いま公開する has written the JSON, see `src/admin/lib/footprints-publish.ts`). A save's 400 is shown on the panel's own band, and `src/admin/lib/footprints.ts`'s `fieldForSaveError` reads the worker's own message to mark which field it is about, rather than a second copy of the worker's validation living here too.
- 公開 (`src/admin/pages/PublishPage.vue`) — footprints and ジェネット楽曲一覧 each get their own `GET .../pending` pair of lists and their own `いま公開する`, loaded and published independently of each other.
- ジェネット楽曲一覧 (`src/admin/pages/SetsPage.vue`) — the one screen that does not use `.pane`/`.inspector`: `.setlist`/`.editor` instead, full width, because a stream's own data does not fit the narrow inspector every other screen uses (#141's design). A tune is shared across every stream that performs it, so saving a tune's own credits (`src/admin/lib/genet-tunes.ts`) is its own action, separate from saving a stream's own fields and which tunes/scenes it performs (`src/admin/lib/genet-streams.ts`). Every Markdown field (a tune's title, a performance's description) is a write box with a live preview directly below it (`src/components/genet/MarkDown.vue`, the public site's own renderer) and 4 buttons that insert a fixed-shape Markdown link (Wikipedia / English Wikipedia / a stream timestamp / a bare URL) at the caret.
- メンバー (`src/admin/pages/MembersPage.vue`) — name, colours, activity span and display order, the 12 columns #158 already lets a PUT replace. Adding a member has no endpoint yet (new members arrive through seed, #152); the button here shows a one-line band saying so instead of opening a panel.
- 配信・動画 (`src/admin/pages/VideosPage.vue`) — picks a collected `video` row (`GET /admin/api/videos`) to give it a `video_override`; saving and deleting the override itself is still video-overrides.ts's own job.
- 統計 (`src/admin/pages/SnapsPage.vue`) — one day's ticks at a time (`GET /admin/api/snapshots`), each markable excluded or not without deleting the tick itself.
- 収集の失敗 (`src/admin/pages/CollectPage.vue`) — the three exits #141 decided for a `collect_task` stuck `failed`: retry now, acknowledge without retrying, or settle a video as gone.
- 版の履歴 (`src/admin/pages/HistoryPage.vue`) — `revision` narrowed by entity/action/date range, one row's `body` opened as fields rather than raw JSON, and `publication`'s own record alongside it in the same screen.

The screen-side logic worth testing without a browser — the table's own query string, which field a save error names, which buttons the edit panel shows for a given `status` — is pulled out into `src/admin/lib/*.ts` and tested under `test/admin/lib/`, the same split the rest of this project's frontend already uses for its own `src/lib/*.ts`.
