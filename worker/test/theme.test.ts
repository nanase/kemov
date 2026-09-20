import { env } from 'cloudflare:test';

import { handleThemedPageRequest, withReaderTheme } from '../src/lib/theme';
import { THEMED_PAGE_PATHS } from '../src/lib/themed-pages';

/**
 * The reader's colour theme, written into the built pages (#182).
 *
 * What is checked is the answer's HTML and headers for each setting a cookie
 * can carry. That a browser then paints the right canvas is not something a
 * test here can see; the pull request says how that was looked at.
 */

const PAGE = `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <meta name="color-scheme" content="light dark" />
    <title>けもV</title>
  </head>
  <body></body>
</html>`;

const GENET_PAGE = PAGE.replace('<html lang="ja">', '<html lang="ja" data-palette="genet">');

interface Seen {
  method: string;
  ifNoneMatch: string | null;
  cookie: string | null;
}

/** A fake `ASSETS` that serves `body` as a page and records what it was asked. */
function fakeAssets(body = PAGE, contentType = 'text/html; charset=utf-8'): { assets: Fetcher; seen: Seen[] } {
  const seen: Seen[] = [];
  const assets = {
    fetch: async (input: RequestInfo | URL) => {
      const request = input instanceof Request ? input : new Request(input);

      seen.push({
        method: request.method,
        ifNoneMatch: request.headers.get('if-none-match'),
        cookie: request.headers.get('cookie'),
      });

      return new Response(body, {
        status: 200,
        headers: { 'content-type': contentType, etag: '"stub"', 'cache-control': 'public, max-age=0, must-revalidate' },
      });
    },
  } as unknown as Fetcher;

  return { assets, seen };
}

const ask = (path: string, cookie?: string, init: RequestInit = {}) =>
  new Request(`https://kemov.nanase.cc${path}`, {
    ...init,
    headers: { ...(cookie === undefined ? {} : { cookie }), ...(init.headers as Record<string, string> | undefined) },
  });

async function themedPage(path: string, cookie?: string, body?: string): Promise<Response> {
  const response = await handleThemedPageRequest(ask(path, cookie), env, fakeAssets(body).assets);

  return response!;
}

describe('a page for a reader who chose a theme', () => {
  test.each(['light', 'dark'])('%s: <html> and the color-scheme meta both say so', async (setting) => {
    const html = await (await themedPage('/stats/', `kemov-theme=${setting}`)).text();

    expect(html).toContain(`<html lang="ja" data-theme="${setting}">`);
    expect(html).toContain(`<meta name="color-scheme" content="${setting}" />`);
    expect(html).not.toContain('light dark');
  });

  test('finds the cookie among others', async () => {
    const html = await (await themedPage('/', 'a=1; kemov-theme=dark; b=2')).text();

    expect(html).toContain('data-theme="dark"');
  });

  // The page's own palette is chosen by an attribute on the same element.
  test('keeps what else <html> carries', async () => {
    const html = await (await themedPage('/genet/music/', 'kemov-theme=dark', GENET_PAGE)).text();

    expect(html).toContain('data-palette="genet"');
    expect(html).toContain('data-theme="dark"');
  });

  test('is not kept for anyone else, and is never revalidated against the file', async () => {
    const response = await themedPage('/stats/', 'kemov-theme=dark');

    expect(response.headers.get('cache-control')).toBe('private, no-cache');
    expect(response.headers.get('vary')).toBe('Cookie');
    expect(response.headers.get('etag')).toBeNull();
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');
  });
});

// Each of these is a reader the page already suits, and the failure to avoid
// is changing the frame they get: the page says `light dark`, which is right
// for anyone following the OS.
describe('a page for a reader who follows the OS', () => {
  test.each([
    ['no Cookie header', undefined],
    ['other cookies only', 'a=1; b=2'],
    ['system', 'kemov-theme=system'],
    ['an empty value', 'kemov-theme='],
    ['a value that is not ours', 'kemov-theme=Dark'],
    ['a name that only ends like ours', 'x-kemov-theme=dark'],
  ])('%s: the page is as built', async (_, cookie) => {
    const response = await themedPage('/stats/', cookie);

    expect(await response.text()).toBe(PAGE);
  });

  // It still varies by Cookie: the same URL answers differently to a reader
  // who chose, so it must not be kept as one answer for everyone.
  test('is still not kept for anyone else', async () => {
    const response = await themedPage('/stats/');

    expect(response.headers.get('cache-control')).toBe('private, no-cache');
    expect(response.headers.get('vary')).toBe('Cookie');
    expect(response.headers.get('etag')).toBeNull();
  });
});

describe('the paths handleThemedPageRequest answers', () => {
  test.each(THEMED_PAGE_PATHS)('answers %s', async (path) => {
    expect(await themedPage(path, 'kemov-theme=dark')).toBeInstanceOf(Response);
  });

  // /admin/ is light only. /members/<id> is answered by pages/index.ts, and
  // /api/ is not a page at all.
  test.each([
    '/admin/',
    '/admin/videos',
    '/api/channels',
    '/members/UCabcdefghijklmnopqrstuv',
    '/stats',
    '/assets/x.js',
  ])('leaves %s to the rest of the worker', async (path) => {
    const { assets, seen } = fakeAssets();

    expect(await handleThemedPageRequest(ask(path, 'kemov-theme=dark'), env, assets)).toBeNull();
    expect(seen).toEqual([]);
  });
});

describe('asking ASSETS for the file', () => {
  // A 304 for the file as it is would leave the reader holding a copy written
  // for whatever setting they had then.
  test("does not pass the reader's conditional header or cookie on", async () => {
    const { assets, seen } = fakeAssets();

    await handleThemedPageRequest(
      ask('/stats/', 'kemov-theme=dark', { headers: { 'if-none-match': '"stub"' } }),
      env,
      assets,
    );

    expect(seen).toEqual([{ method: 'GET', ifNoneMatch: null, cookie: null }]);
  });

  test('answers HEAD from the same page', async () => {
    const { assets, seen } = fakeAssets();
    const response = await handleThemedPageRequest(
      ask('/stats/', 'kemov-theme=light', { method: 'HEAD' }),
      env,
      assets,
    );

    expect(response!.status).toBe(200);
    expect(seen.map((s) => s.method)).toEqual(['GET']);
  });

  test('hands any other method to ASSETS as it came', async () => {
    const { assets, seen } = fakeAssets();

    await handleThemedPageRequest(ask('/stats/', undefined, { method: 'POST', body: 'x' }), env, assets);

    expect(seen.map((s) => s.method)).toEqual(['POST']);
  });
});

describe('withReaderTheme', () => {
  // The dynamic pages hand their answers here, and their 404 for an id that
  // does not exist is still the page.
  test('themes an HTML answer whatever its status', async () => {
    const answer = new Response(PAGE, { status: 404, headers: { 'content-type': 'text/html; charset=utf-8' } });
    const response = withReaderTheme(answer, ask('/members/x', 'kemov-theme=dark'));

    expect(response.status).toBe(404);
    expect(await response.text()).toContain('data-theme="dark"');
  });

  test('leaves an answer that is not HTML alone, headers included', async () => {
    const answer = new Response('not allowed', { status: 405, headers: { allow: 'GET, HEAD', etag: '"e"' } });
    const response = withReaderTheme(answer, ask('/members/x', 'kemov-theme=dark'));

    expect(response).toBe(answer);
    expect(response.headers.get('cache-control')).toBeNull();
  });
});
