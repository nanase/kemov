// A relative import across the worker/frontend boundary, as pages/index.ts does
// for pageTitle: theme.ts is plain string handling, and importing it is what
// keeps the worker and the pages agreeing on what a cookie or a value means
// rather than each carrying a copy of the rule.
import { colorSchemeContent, themeFromCookieHeader, type ThemeSetting } from '../../../src/shell/theme';
import type { Env } from './env';
import { isThemedPagePath } from './themed-pages';

/**
 * The reader's colour theme written into a page before it leaves the worker (#182).
 *
 * The browser decides what colour to paint a page's canvas before it has
 * parsed a byte of it, and it decides from the `color-scheme` meta. head.html
 * ships `light dark`, which a browser under a dark OS reads as "dark is fine"
 * and paints dark - so a reader who chose light sees a dark frame between one
 * page and the next. Nothing inside the page can run early enough to change
 * that, so the worker, which sees the reader's cookie, changes the meta itself
 * and sets `data-theme` on `<html>` so that the page's own colours agree.
 *
 * A reader with no cookie, or a cookie that is not `light` or `dark`, is
 * following the OS, which is what the page already says: it is answered
 * untouched.
 */

/**
 * What a themed answer says about caching.
 *
 * The body depends on the request's Cookie, so a copy kept for one reader is
 * wrong for another. `Vary: Cookie` says so, and is sent for whatever holds a
 * copy in spite of the rest; but the Cookie header differs for every reader,
 * so a shared cache could keep next to nothing under it. `private` keeps the
 * answer out of shared caches instead, and `no-cache` has a browser ask again
 * before reusing it, as Cloudflare's own `max-age=0, must-revalidate` for
 * these files did. It is not `no-store`, which stops some browsers restoring a
 * page on back and forward. The hashed scripts and stylesheets keep the
 * caching they had.
 */
const THEMED_CACHE_CONTROL = 'private, no-cache';

/** `response` with `setting` written into its HTML, or as it came when `setting` is `system`. */
function writeTheme(response: Response, setting: ThemeSetting): Response {
  if (setting === 'system') return response;

  return new HTMLRewriter()
    .on('html', {
      element(element) {
        element.setAttribute('data-theme', setting);
      },
    })
    .on('meta[name="color-scheme"]', {
      element(element) {
        element.setAttribute('content', colorSchemeContent(setting));
      },
    })
    .transform(response);
}

/**
 * `response` as the request's reader should get it, when it is a page.
 *
 * Anything that is not HTML is returned as it is, so a 404 from a route that
 * answers JSON or plain text is not given a cache policy it never had.
 * The ETag goes for the reason pages/index.ts drops it: it names the body the
 * file has, not the one the reader is sent, and a `304` on it would keep a
 * page written for another setting.
 */
export function withReaderTheme(response: Response, request: Request): Response {
  if (!response.headers.get('content-type')?.toLowerCase().startsWith('text/html')) return response;

  const themed = writeTheme(response, themeFromCookieHeader(request.headers.get('cookie')));
  const headers = new Headers(themed.headers);

  headers.delete('etag');
  headers.set('cache-control', THEMED_CACHE_CONTROL);
  headers.append('vary', 'Cookie');

  return new Response(themed.body, { status: themed.status, statusText: themed.statusText, headers });
}

/**
 * A built page from THEMED_PAGE_PATHS, answered with the reader's theme, or
 * null for any other path.
 *
 * The file is asked for with a request of its own rather than the reader's:
 * `ASSETS` would answer a conditional request with a `304` for the file as it
 * is, and the reader would keep a copy that was written for a setting they
 * may no longer have. Methods other than GET and HEAD are handed to `ASSETS`
 * unchanged, which is what would have answered them before the worker was
 * woken for these paths.
 *
 * `assets` defaults to `env.ASSETS` and exists so a test can hand this a page
 * of its own, as pages/index.ts's does.
 */
export async function handleThemedPageRequest(
  request: Request,
  env: Env,
  assets: Fetcher = env.ASSETS,
): Promise<Response | null> {
  const url = new URL(request.url);

  if (!isThemedPagePath(url.pathname)) return null;

  if (request.method !== 'GET' && request.method !== 'HEAD') return await assets.fetch(request);

  const page = await assets.fetch(new Request(url, { method: 'GET' }));

  return withReaderTheme(page, request);
}
