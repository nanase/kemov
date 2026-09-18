import { createExecutionContext, createScheduledController, env, waitOnExecutionContext } from 'cloudflare:test';

import handler from '../src/index';

// The handler is wired by hand, so these check that each trigger reaches the
// side it belongs to rather than what either side then does. Every argument is
// one the runtime itself makes rather than a cast, so a handler that starts
// reading a binding or a field of the controller fails here rather than at the
// deploy.
describe('the worker entry', () => {
  // An endpoint that exists, so this proves the request reached the API and
  // that the API was handed a D1 binding and a cache to work with. A path that
  // does not exist would answer 404 whether or not either arrived.
  test('sends requests to the API, with the bindings it needs', async () => {
    const ctx = createExecutionContext();
    const response = await handler.fetch!(new Request('https://kemov.nanase.cc/api/channels'), env, ctx);

    await waitOnExecutionContext(ctx);

    expect(response.status).toEqual(200);
    expect(await response.json()).toMatchObject({ channels: expect.any(Array) });
    // Set by the cache the entry point passes in. Without one the API could
    // not have answered at all.
    expect(response.headers.get('x-kemov-cache')).not.toBeNull();
  });

  // The site's own directories have no built file, so they arrive here beside
  // /api/*. Before this they were answered with the API's 404 JSON.
  test('sends the site root to a page rather than to the API', async () => {
    const ctx = createExecutionContext();
    const response = await handler.fetch!(new Request('https://kemov.nanase.cc/'), env, ctx);

    await waitOnExecutionContext(ctx);

    expect(response.status).toEqual(302);
    expect(response.headers.get('location')).toEqual('https://kemov.nanase.cc/stats/');
  });

  // The redirect is asked first, so this is the test that it cannot swallow
  // the API on its way past. Not 200: with no jobs run and no backup written,
  // /api/health answers 503 by #110's own rule, and that is not what this
  // test is checking.
  test('still reaches the API with the redirect in front of it', async () => {
    const ctx = createExecutionContext();
    const response = await handler.fetch!(new Request('https://kemov.nanase.cc/api/health'), env, ctx);

    await waitOnExecutionContext(ctx);

    expect(response.status).not.toEqual(404);
  });

  // The page does not exist yet (#137, #144's later work), so this only
  // proves the request reaches the dynamic-page handler rather than the
  // API's own 404 for an unknown path - handleDynamicPageRequest's own
  // tests (pages.test.ts) cover what it does with an id.
  test('sends /members/<id> to the dynamic-page handler rather than the API', async () => {
    const ctx = createExecutionContext();
    const response = await handler.fetch!(
      new Request('https://kemov.nanase.cc/members/UCabMjG8p6G5xLkPJgEoTnDg'),
      env,
      ctx,
    );

    await waitOnExecutionContext(ctx);

    expect(response.status).toEqual(404);
    expect(await response.text()).not.toContain('no endpoint at');
  });

  test('answers 404 for a path the API does not serve', async () => {
    const ctx = createExecutionContext();
    const response = await handler.fetch!(new Request('https://kemov.nanase.cc/api/nothing'), env, ctx);

    await waitOnExecutionContext(ctx);

    expect(await response.json()).toEqual({ error: 'no endpoint at /api/nothing' });
  });

  // /admin/* is asked before /api/*, on its own branch - the API's own 404
  // for an unknown path must never answer this one. Cloudflare Access, not a
  // test double, is what would carry a real token here, so this only checks
  // that the request reached the admin side's own Access check rather than
  // the API's routing: handleAdminRequest's own tests (admin.test.ts) cover
  // what an authorized caller sees, with a key fetch this test cannot inject
  // through ExportedHandler's fixed fetch(request, env, ctx) signature.
  test('sends admin requests to the admin side, behind Cloudflare Access', async () => {
    const ctx = createExecutionContext();
    const response = await handler.fetch!(new Request('https://kemov.nanase.cc/admin/api/me'), env, ctx);

    await waitOnExecutionContext(ctx);

    expect(response.status).toEqual(401);
    expect(await response.json()).toEqual({ error: 'not authorized by Cloudflare Access' });
  });

  test('answers 404 for /admin paths outside /admin/api, unauthorized or not', async () => {
    const ctx = createExecutionContext();
    const response = await handler.fetch!(new Request('https://kemov.nanase.cc/admin/foo'), env, ctx);

    await waitOnExecutionContext(ctx);

    expect(response.status).toEqual(404);
  });

  test('sends scheduled triggers to the collector', async () => {
    const ctx = createExecutionContext();
    const controller = createScheduledController({ cron: '* * * * *', scheduledTime: new Date() });
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    await handler.scheduled!(controller, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(log).toHaveBeenCalledWith('scheduled * * * * *: chat-replay');

    log.mockRestore();
  });
});
