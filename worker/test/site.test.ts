import { siteRedirect } from '../src/lib/site';

/**
 * The paths the built site has no file at.
 *
 * Every vite entry sits under a directory - stats/, stats/detail/,
 * stats/ranking/, genet/music/ - so the two directories above them hold no
 * index. Somebody typing the host name lands on one and, before this, was
 * answered with the API's 404 JSON.
 */

const to = (path: string) => siteRedirect(new URL(`https://kemov.nanase.cc${path}`));

describe('siteRedirect', () => {
  test('sends the site root to the statistics page', () => {
    expect(to('/')?.status).toEqual(302);
    expect(to('/')?.headers.get('location')).toEqual('https://kemov.nanase.cc/stats/');
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
    expect(siteRedirect(new URL('http://localhost:8787/'))?.headers.get('location')).toEqual(
      'http://localhost:8787/stats/',
    );
  });

  // 302, because which page the root opens is a decision that has already
  // changed once - #99 added a third candidate - and a permanent redirect
  // outlives the decision in browsers that cached it.
  test('does not tell the browser to remember it forever', () => {
    expect(to('/')?.status).toEqual(302);
  });
});
