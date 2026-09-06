import handler from '../src/index';
import type { Env } from '../src/lib/env';

// The handler is wired by hand, so these check that each trigger reaches the
// side it belongs to rather than what either side then does.
const env = {} as Env;
const ctx = {} as ExecutionContext;

describe('the worker entry', () => {
  test('sends requests to the API', async () => {
    const response = await handler.fetch!(new Request('https://kemov.nanase.cc/api/channels'), env, ctx);

    expect(await response.json()).toEqual({ error: 'no endpoint at /api/channels' });
  });

  test('sends scheduled triggers to the collector', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    await handler.scheduled!({ cron: '* * * * *' } as ScheduledController, env, ctx);

    expect(log).toHaveBeenCalledWith('scheduled * * * * *: chat-replay');

    log.mockRestore();
  });
});
