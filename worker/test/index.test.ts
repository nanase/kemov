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
  // the API on its way past.
  test('still reaches the API with the redirect in front of it', async () => {
    const ctx = createExecutionContext();
    const response = await handler.fetch!(new Request('https://kemov.nanase.cc/api/health'), env, ctx);

    await waitOnExecutionContext(ctx);

    expect(response.status).toEqual(200);
  });

  test('answers 404 for a path the API does not serve', async () => {
    const ctx = createExecutionContext();
    const response = await handler.fetch!(new Request('https://kemov.nanase.cc/api/nothing'), env, ctx);

    await waitOnExecutionContext(ctx);

    expect(await response.json()).toEqual({ error: 'no endpoint at /api/nothing' });
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
