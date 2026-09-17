/**
 * Everything the worker is handed at runtime.
 *
 * Bindings come from wrangler.toml. Secrets come from `wrangler secret` and
 * are never written down anywhere in this repository, so this interface is the
 * only place their names appear.
 *
 * The names are not camelCase like the rest of the codebase because Cloudflare
 * supplies them under exactly these spellings.
 */
export interface Env {
  /** D1. The master copy of every channel, video and snapshot. */
  DB: D1Database;

  /** R2. Where the nightly backup writes what D1 holds, so that it can be put back (#111). */
  BACKUP: R2Bucket;

  /** R2. Where the admin site's published JSON lives, for the site to read (#144). Not backed up. */
  PUBLIC_DATA: R2Bucket;

  /** YouTube Data API v3 key, set with `wrangler secret put YOUTUBE_API_KEY`. */
  YOUTUBE_API_KEY: string;

  /**
   * The `aud` tag of the Cloudflare Access application in front of `/admin`,
   * set with `wrangler secret put ACCESS_AUD`. See `verifyAccess` in
   * `worker/src/lib/access.ts` for what it is checked against.
   */
  ACCESS_AUD: string;

  /**
   * The Cloudflare Access team domain, e.g. `nanase.cloudflareaccess.com` -
   * a `[vars]` entry in `wrangler.toml`, not a secret: it is the same domain
   * a browser is already sent to for the Access login page, so it carries
   * nothing `wrangler secret` would be protecting. `verifyAccess` fetches
   * this team's public keys from it to check a token's signature, and reads
   * its own `iss` claim against it.
   */
  ACCESS_TEAM_DOMAIN: string;
}
