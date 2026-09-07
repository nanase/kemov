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
}
