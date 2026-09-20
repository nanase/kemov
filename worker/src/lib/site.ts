/**
 * The paths the built site has no file for.
 *
 * Cloudflare serves anything that matches a built file and wakes the worker for
 * everything else, so `/api/*` and these arrive here together. Most of vite's
 * entries sit under a directory of their own, and a directory above them holds
 * no index: somebody typing one reaches nothing and is answered with the API's
 * 404 JSON.
 *
 * That is #70's split working exactly as written rather than a fault in it, and
 * the fix belongs here rather than in the build: adding an index.html to those
 * directories would mean a second page to keep in step with wherever the site
 * should actually open.
 */

/**
 * Where a directory with no page of its own should send a visitor.
 *
 * `/genet/` has exactly one page beneath it, so there is nothing to choose.
 *
 * `/stats/ranking/` was the old ranking page's address (#144). The videos page
 * replaced it and the page's file is no longer built, so the worker is woken
 * for it and sends the reader on. The file has to stay gone for this to work:
 * Cloudflare answers from a built file before it asks the worker, so a file
 * left in the build would leave this rule dead. The other spellings are here
 * because the file's absence takes them from Cloudflare too: it used to send
 * `/stats/ranking` and `/stats/ranking/index.html` on to `/stats/ranking/`
 * itself, and with no file to send them to they would be a 404.
 *
 * `/stats/detail/` is not here. Its old addresses carried the channel in the
 * fragment (`#/<id>`), which a request never sends, so no rule here could pick
 * the member's page. A small page of its own reads the fragment in the browser
 * instead (`src/stats/detail/index.html`).
 *
 * `/` used to be here, sending the site root to the statistics page. It has its
 * own page now - the footprints page is the site's top page (#140) and builds
 * to `index.html` at the root - so Cloudflare serves it from the file and the
 * worker is never woken for it. A rule kept here would be dead either way, and
 * a wrong one would take the top page down.
 *
 * Matched as whole paths and never as prefixes. A rule that sent anything
 * beginning with `/` to a page would send `/api/channels` there too and take
 * the front end down with it, so the lookup is exact by construction rather
 * than by an ordering that a later edit could disturb.
 */
const LANDING: Readonly<Record<string, string>> = {
  '/genet': '/genet/music/',
  '/genet/': '/genet/music/',
  '/stats/ranking': '/videos/',
  '/stats/ranking/': '/videos/',
  '/stats/ranking/index.html': '/videos/',
};

/**
 * A redirect for a path the site has no file at, or null to carry on.
 *
 * The target is resolved against the request's own URL rather than a host
 * written here, so this answers the same way on the custom domain, on a
 * preview and under `wrangler dev`.
 *
 * 302 rather than 301: where a directory opens is a decision that may change -
 * `/` moved from the statistics page to a page of its own - and a permanent
 * redirect is kept by browsers for as long as they like, which would outlive
 * the decision.
 */
export function siteRedirect(url: URL): Response | null {
  const target = LANDING[url.pathname];

  return target === undefined ? null : Response.redirect(new URL(target, url).toString(), 302);
}
