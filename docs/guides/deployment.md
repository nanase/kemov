# Deployment

## The Account ID

`wrangler.toml` carries the D1 `database_id` but no `account_id`. This repository is public, and that value names the account it belongs to. Anything that reaches Cloudflare — `wrangler deploy`, and any command given `--remote` — resolves the account from the session `wrangler login` leaves in your home directory instead. Actions gets it from an environment secret; see [Deployment](../reference/architecture.md#deployment).

## Worker Secrets

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

## Setting the Lifecycle Rules of the Backup Bucket

Set with `lifecycle add` calls, run from the repository root. `channel/`'s existing 30-day rule is replaced rather than added beside, since a prefix can carry only one rule. `-y` skips the confirmation `add` otherwise asks for, which would stop the loop partway through:

```sh
bun wrangler r2 bucket lifecycle add kemov-backup expire-video-30d video/ --expire-days 30 -y
bun wrangler r2 bucket lifecycle remove kemov-backup --name expire-channel-30d
bun wrangler r2 bucket lifecycle add kemov-backup expire-channel-365d channel/ --expire-days 365 -y
bun wrangler r2 bucket lifecycle add kemov-backup expire-channel-snapshot-365d channel_snapshot/ --expire-days 365 -y

for t in channel_snapshot_exclusion video_override footprints_event footprints_event_member footprints_event_source \
         source_whitelist genet_person genet_tune genet_tune_attribute genet_tune_attribute_person genet_tune_video genet_tune_score \
         genet_stream genet_performance genet_scene revision publication; do
  bun wrangler r2 bucket lifecycle add kemov-backup "expire-${t//_/-}-365d" "$t/" --expire-days 365 -y
done
```

Not `lifecycle set --file <json>`: `set` replaces the bucket's whole ruleset, and the existing "Default Multipart Abort Rule" (7 days, all prefixes) would be lost if it were left out of that file. `add` and `remove` only touch the one rule named, so the calls above cannot touch it.

**The trailing slash matters.** `genet_tune` as a prefix also matches `genet_tune_attribute/`, and `video` matches `video_override/`, which would expire either at the wrong retention. Every prefix above ends in `/` for this reason.

Check with `bun wrangler r2 bucket lifecycle list kemov-backup`; it should list 21 rules — the 20 above plus the Default Multipart Abort Rule that was already there.

## Creating the Public Bucket

The bucket does not exist until created once, before deploying the code that binds it:

```sh
bun wrangler r2 bucket create kemov-public
```

## Rolling Back a Deploy

To roll back, revert the commit and let the workflow redeploy. `bun wrangler rollback` is the faster route when what is deployed is already broken.

## The Hostname

`wrangler.toml` claims `kemov.nanase.cc` as a custom domain, which is why the zone's DNS record is created and kept by Cloudflare rather than by hand.

`workers_dev` is off. The subdomain Cloudflare generates for a worker is built from the account's email address with the local part left in it, and a successful deploy prints that URL — into the Actions logs of a public repository, which anyone can read. Nothing needs it once the custom domain exists. Never turn it off before the domain is in place: it is the only other way to reach the worker.

Its credentials come from a GitHub **environment** rather than from repository secrets. An environment secret is only readable by a job that names the environment; a repository secret is readable by every workflow in the repository, including one running from a pull request branch, and most of them have no business holding a token that can deploy.

| Setting             | Value                                           |
| ------------------- | ----------------------------------------------- |
| Environment         | `cloudflare`                                    |
| Deployment branches | `main` only                                     |
| Secrets             | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` |

Settings → Environments → New environment → name it `cloudflare` → under Deployment branches choose "Selected branches and tags" and add `main` → then Add environment secret twice, once per name above. The token needs the "Edit Cloudflare Workers" template plus D1 Edit, because the worker carries a D1 binding, and DNS Edit on the zone, because the custom domain above is a DNS record.
