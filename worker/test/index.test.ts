import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';

import handler from '../src/index';

// The handler is wired by hand, so these check that each trigger reaches the
// side it belongs to rather than what either side then does. env and ctx are
// the real ones the runtime passes, not stubs, so a handler that starts
// reading a binding fails here rather than at the deploy.
describe('the worker entry', () => {
  test('sends requests to the API', async () => {
    const ctx = createExecutionContext();
    const response = await handler.fetch!(new Request('https://kemov.nanase.cc/api/channels'), env, ctx);

    await waitOnExecutionContext(ctx);

    expect(await response.json()).toEqual({ error: 'no endpoint at /api/channels' });
  });

  test('sends scheduled triggers to the collector', async () => {
    const ctx = createExecutionContext();
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    await handler.scheduled!({ cron: '* * * * *' } as ScheduledController, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(log).toHaveBeenCalledWith('scheduled * * * * *: chat-replay');

    log.mockRestore();
  });
});
