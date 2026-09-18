import { unescapeHtml } from '@nanase/alnilam/string';

import type { Env } from '../lib/env';
import { VIDEO_EFFECTIVE } from '../lib/overrides';

/**
 * `/members/<channel id>` and `/videos/<video id>`: a permalink to one member
 * or one stream/video (#137), so that sharing it carries that one name rather
 * than the site's own title.
 *
 * Neither page exists yet - #144's later work adds them - so this rewrites
 * whatever `ASSETS` already serves at `/members/` or `/videos/` rather than
 * building a page of its own. The worker only ever sees these requests
 * because no built file answers `/members/<id>` exactly, the same reason
 * `/api/*` reaches `../api/index.ts`: Cloudflare serves a matching file
 * directly and wakes the worker only for the paths that are not one.
 */

type Kind = 'members' | 'videos';

interface Route {
  kind: Kind;
  id: string;
}

/** The exact shape of each id, checked before D1 is asked. */
const ID_PATTERN: Readonly<Record<Kind, RegExp>> = {
  members: /^UC[\w-]{22}$/,
  videos: /^[\w-]{11}$/,
};

/** Where the page each kind rewrites is served from today. */
const PAGE_PATH: Readonly<Record<Kind, string>> = {
  members: '/members/',
  videos: '/videos/',
};

/**
 * A request path as a `{ kind, id }` route, or null for anything else -
 * including `/members/` and `/videos/` themselves, which have no id to fill
 * in and are left to `ASSETS` untouched.
 */
function matchRoute(pathname: string): Route | null {
  const segments = pathname.replace(/^\/+|\/+$/g, '').split('/');

  if (segments.length !== 2) return null;

  const [resource, id] = segments;

  if (id === undefined || id === '') return null;
  if (resource === 'members' || resource === 'videos') return { kind: resource, id };

  return null;
}

/** What a route's page should say, or null when its id does not resolve. */
interface Titled {
  title: string;
  ogUrl: string;
}

/**
 * `title`/`og:title` and `og:url` for a route, or null when the id is not in
 * D1.
 *
 * The stored name or title is unescaped before use. Some rows carry `&quot;`,
 * `&amp;` and `&#39;` as literal text rather than the characters they stand
 * for - src/components/genet/MarkDown.vue already unescapes the same way
 * before showing a title on screen, and this reuses that exact function
 * rather than a second copy of the same rule. `HTMLRewriter`'s
 * `setInnerContent`/`setAttribute` (see `rewrite` below) escape whatever
 * string they are handed, so unescaping first is what keeps that the only
 * escaping the text goes through - skipping it would show `&amp;quot;`
 * instead of a literal `"`.
 *
 * The video title is read through `video_effective` (#156) rather than
 * `video` directly, so an overridden title answers here the same way it
 * already does for every public API - no second place merges the override.
 */
async function titleFor(env: Env, route: Route): Promise<Titled | null> {
  if (route.kind === 'members') {
    const row = await env.DB.prepare(`SELECT name FROM channel WHERE channel_id = ?1`)
      .bind(route.id)
      .first<{ name: string }>();

    if (row === null) return null;

    return {
      title: `${unescapeHtml(row.name)} - けもV メンバー`,
      ogUrl: `https://kemov.nanase.cc/members/${route.id}`,
    };
  }

  const row = await env.DB.prepare(`WITH ${VIDEO_EFFECTIVE} SELECT title FROM video_effective WHERE video_id = ?1`)
    .bind(route.id)
    .first<{ title: string }>();

  if (row === null) return null;

  return {
    title: `${unescapeHtml(row.title)} - けもV 配信・動画`,
    ogUrl: `https://kemov.nanase.cc/videos/${route.id}`,
  };
}

/**
 * `response`, with its `<title>`, `og:title` and `og:url` replaced.
 *
 * Both `setInnerContent` and `setAttribute` HTML-escape the string they are
 * given by default, which is what makes a title carrying a literal `&` or
 * `<` safe to hand straight to them: nothing here escapes the text itself.
 */
function rewrite(response: Response, titled: Titled): Response {
  return new HTMLRewriter()
    .on('title', {
      element(element) {
        element.setInnerContent(titled.title);
      },
    })
    .on('meta[property="og:title"]', {
      element(element) {
        element.setAttribute('content', titled.title);
      },
    })
    .on('meta[property="og:url"]', {
      element(element) {
        element.setAttribute('content', titled.ogUrl);
      },
    })
    .transform(response);
}

/** `response`, answered with `status` instead of whatever it already carried. */
function withStatus(response: Response, status: number): Response {
  return new Response(response.body, { status, statusText: response.statusText, headers: response.headers });
}

/**
 * `/members/<id>` or `/videos/<id>`, or null for a path neither names -
 * `worker/src/index.ts` falls through to `/admin/*` or `/api/*` in that case.
 *
 * `assets` defaults to `env.ASSETS` and exists as a parameter so a test can
 * hand this a page `/members/` or `/videos/` does not have yet: both are
 * added in a later PR, and until then `env.ASSETS` answers every request
 * under either path with a 404, which is the "ASSETS からページが取れない"
 * path below rather than the tested rewrite.
 */
export async function handleDynamicPageRequest(
  request: Request,
  env: Env,
  assets: Fetcher = env.ASSETS,
): Promise<Response | null> {
  const url = new URL(request.url);
  const route = matchRoute(url.pathname);

  if (route === null) return null;

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response(`${request.method} is not allowed here`, { status: 405, headers: { Allow: 'GET, HEAD' } });
  }

  // Fetched before the id is even checked for shape: a bare-shaped 404 still
  // has to answer with the page's own HTML, not an empty body, and this is
  // the one place that HTML comes from.
  const pageResponse = await assets.fetch(new Request(new URL(PAGE_PATH[route.kind], url), { method: 'GET' }));

  if (!ID_PATTERN[route.kind].test(route.id)) return withStatus(pageResponse, 404);

  const titled = await titleFor(env, route);

  if (titled === null) return withStatus(pageResponse, 404);

  // Not 200: ASSETS could not supply the page to rewrite, whatever the
  // reason. Its own answer is the honest one, not a 200 built by rewriting a
  // body that is not the page at all.
  if (pageResponse.status !== 200) return pageResponse;

  const rewritten = rewrite(pageResponse, titled);
  const headers = new Headers(rewritten.headers);

  // The stored ETag names the unrewritten body. Serving it beside a body
  // that no longer matches would let a conditional request on this path
  // answer 304 with the wrong title.
  headers.delete('etag');

  return new Response(rewritten.body, { status: rewritten.status, statusText: rewritten.statusText, headers });
}
