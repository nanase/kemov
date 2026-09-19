import { siteRedirect } from '../src/lib/site';

/**
 * The paths the built site has no file at.
 *
 * Most vite entries sit under a directory of their own, so a directory above
 * them holds no index and somebody typing it was answered with the API's 404
 * JSON. `/` is not one of them any more: the footprints page builds to
 * `index.html` at the root (#140), so the file answers it and the worker is
 * never woken.
 */

const to = (path: string) => siteRedirect(new URL(`https://kemov.nanase.cc${path}`));

describe('siteRedirect', () => {
  // The footprints page is the site's top page and is built as index.html at
  // the root, so `/` is served from the file. A redirect left here would send
  // the top page somewhere else.
  test('leaves the site root alone, now that it has a page of its own', () => {
    expect(to('/')).toBeNull();
  });

  test('sends the music directory to the one page under it', () => {
    expect(to('/genet/')?.headers.get('location')).toEqual('https://kemov.nanase.cc/genet/music/');
    expect(to('/genet')?.headers.get('location')).toEqual('https://kemov.nanase.cc/genet/music/');
  });

  // The failure this would be. A rule matching a prefix rather than a whole
  // path would send every API call to the statistics page, and the front end
  // would receive HTML where it reads JSON.
  test('never touches the API', () => {
    expect(to('/api/')).toBeNull();
    expect(to('/api/channels')).toBeNull();
    expect(to('/api/videos/ranking?metric=viewCount')).toBeNull();
  });

  test('leaves alone the paths that do have a page', () => {
    expect(to('/')).toBeNull();
    expect(to('/members/')).toBeNull();
    expect(to('/stats/')).toBeNull();
    expect(to('/stats/detail/')).toBeNull();
    expect(to('/stats/ranking/')).toBeNull();
    expect(to('/genet/music/')).toBeNull();
  });

  // A path with no page and no rule keeps the 404 it had. Redirecting anything
  // unknown to the front page would answer a typo with a working screen, which
  // is how a broken link stays unnoticed.
  test('leaves a path it has no landing page for', () => {
    expect(to('/nothing')).toBeNull();
    expect(to('/stats/nothing/')).toBeNull();
  });

  // The host comes from the request, so a preview deployment and wrangler dev
  // redirect to themselves rather than to production.
  test('redirects within whatever host asked', () => {
    expect(siteRedirect(new URL('http://localhost:8787/genet'))?.headers.get('location')).toEqual(
      'http://localhost:8787/genet/music/',
    );
  });

  // 302, because where a directory opens is a decision that has already
  // changed once - `/` moved from the statistics page to a page of its own -
  // and a permanent redirect outlives the decision in browsers that cached it.
  test('does not tell the browser to remember it forever', () => {
    expect(to('/genet')?.status).toEqual(302);
    expect(to('/genet/')?.status).toEqual(302);
  });
});
