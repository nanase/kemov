import { createExecutionContext, createScheduledController, env, waitOnExecutionContext } from 'cloudflare:test';

import handler from '../src/index';

// The handler is wired by hand, so these check that each trigger reaches the
// side it belongs to rather than what either side then does. Every argument is
// one the runtime itself makes rather than a cast, so a handler that starts
// reading a binding or a field of the controller fails here rather than at the
// deploy.
describe('the worker entry', () => {
  test('sends requests to the API', async () => {
    const ctx = createExecutionContext();
    const response = await handler.fetch!(new Request('https://kemov.nanase.cc/api/channels'), env, ctx);

    await waitOnExecutionContext(ctx);

    expect(await response.json()).toEqual({ error: 'no endpoint at /api/channels' });
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
