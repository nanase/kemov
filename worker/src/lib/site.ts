/**
 * The paths the built site has no file for.
 *
 * Cloudflare serves anything that matches a built file and wakes the worker for
 * everything else, so `/api/*` and these arrive here together. Vite's entries
 * are `stats/index.html`, `stats/detail/index.html`, `stats/ranking/index.html`
 * and `genet/music/index.html`: every page sits under a directory, and the two
 * directories above them hold no index of their own. Somebody typing the host
 * name reaches one of those and is answered with the API's 404 JSON.
 *
 * That is #70's split working exactly as written rather than a fault in it, and
 * the fix belongs here rather than in the build: adding an index.html to those
 * directories would mean a second page to keep in step with wherever the site
 * should actually open.
 */

/**
 * Where a directory with no page of its own should send a visitor.
 *
 * `/` picks a landing page among three, and the statistics table is what this
 * site is for. `/genet/` has exactly one page beneath it, so there is nothing
 * to choose.
 *
 * Matched as whole paths and never as prefixes. A rule that sent anything
 * beginning with `/` to the statistics page would send `/api/channels` there
 * too and take the front end down with it, so the lookup is exact by
 * construction rather than by an ordering that a later edit could disturb.
 */
const LANDING: Readonly<Record<string, string>> = {
  '/': '/stats/',
  '/genet': '/genet/music/',
  '/genet/': '/genet/music/',
};

/**
 * A redirect for a path the site has no file at, or null to carry on.
 *
 * The target is resolved against the request's own URL rather than a host
 * written here, so this answers the same way on the custom domain, on a
 * preview and under `wrangler dev`.
 *
 * 302 rather than 301: which page `/` opens is a decision that may change -
 * #99 has just added a third candidate - and a permanent redirect is kept by
 * browsers for as long as they like, which would outlive the decision.
 */
export function siteRedirect(url: URL): Response | null {
  const target = LANDING[url.pathname];

  return target === undefined ? null : Response.redirect(new URL(target, url).toString(), 302);
}
