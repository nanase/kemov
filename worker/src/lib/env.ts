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

  /** YouTube Data API v3 key, set with `wrangler secret put YOUTUBE_API_KEY`. */
  YOUTUBE_API_KEY: string;

  /**
   * The key the innertube endpoints take, set with
   * `wrangler secret put YOUTUBE_INNERTUBE_KEY`.
   *
   * Not the same thing as YOUTUBE_API_KEY above. That one is this project's
   * own Data API key: it carries a quota and belongs to an account. This one
   * identifies the web client, is the same string for every visitor, and is
   * served in the HTML of any YouTube page. Nothing is spent by using it.
   *
   * It is a secret here anyway, and #92 says why: a value in this shape cannot
   * be told from a real key by anything that reads the repository, so leaving
   * it in the source made GitHub report a leak that was not one - and a leak
   * report nobody can check is worse than no report at all.
   */
  YOUTUBE_INNERTUBE_KEY: string;
}
