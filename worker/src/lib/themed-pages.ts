/**
 * The built pages the worker answers so that it can write the reader's colour
 * theme into them (#182).
 *
 * Only these reach the worker: `run_worker_first` in wrangler.toml lists the
 * same paths, and everything else - the hashed scripts, stylesheets, fonts and
 * images, which are most of what a page loads - is still served by Cloudflare
 * without waking the worker. Each path listed is one more invocation per page
 * view, so a page joins this list because it carries the `color-scheme` meta,
 * not because it is a page.
 *
 * `/admin/` is not here: it is light only and has no `system` to write.
 * `/members/<id>` and `/videos/<id>` are not either, because no file answers
 * them and the worker is woken for them already (worker/src/pages/index.ts).
 *
 * Kept in a file of its own, with no worker global in it, so that
 * test/worker-config.test.ts can hold this list to wrangler.toml and to the
 * pages vite builds.
 */
export const THEMED_PAGE_PATHS: readonly string[] = [
  '/',
  '/stats/',
  '/stats/detail/',
  '/members/',
  '/videos/',
  '/genet/music/',
];

export function isThemedPagePath(pathname: string): boolean {
  return THEMED_PAGE_PATHS.includes(pathname);
}
