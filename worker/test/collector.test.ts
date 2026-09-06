import { env } from 'cloudflare:test';

// Through vite's ?raw rather than node:fs: these tests run on workerd, which
// has no filesystem.
import wranglerConfig from '../../wrangler.toml?raw';

import { jobsFor, runScheduled } from '../src/collector';

describe('jobsFor', () => {
  test('runs the three ten-minute jobs', () => {
    expect(jobsFor('*/10 * * * *')).toEqual(['channel-stats', 'video-discover', 'video-update']);
  });

  test('runs chat-replay every minute', () => {
    expect(jobsFor('* * * * *')).toEqual(['chat-replay']);
  });

  test('runs nothing for a cron it does not know', () => {
    expect(jobsFor('0 0 * * *')).toEqual([]);
  });

  // A plain object would answer this lookup with Object.prototype.constructor.
  test('runs nothing for an inherited property name', () => {
    expect(jobsFor('constructor')).toEqual([]);
  });

  // The mapping is maintained by hand, so the two lists can drift. A cron that
  // reaches no job would deploy and then fire into nothing every time.
  test('covers every cron declared in wrangler.toml', () => {
    const declared = /crons\s*=\s*\[([\s\S]*?)]/.exec(wranglerConfig)?.[1] ?? '';
    const crons = [...declared.matchAll(/"([^"]+)"/g)].map(([, cron]) => cron);

    expect(crons).not.toEqual([]);

    for (const cron of crons) {
      expect(jobsFor(cron)).not.toEqual([]);
    }
  });
});

describe('runScheduled', () => {
  test('names the jobs the trigger runs', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    await runScheduled('* * * * *', env);

    expect(log).toHaveBeenCalledWith('scheduled * * * * *: chat-replay');

    log.mockRestore();
  });

  test('warns instead of dropping a cron that reaches no job', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await runScheduled('0 0 * * *', env);

    expect(warn).toHaveBeenCalledWith('no job is registered for cron "0 0 * * *"');

    warn.mockRestore();
  });

  test('warns instead of dropping a job with no handler yet', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await runScheduled('* * * * *', env);

    expect(warn).toHaveBeenCalledWith('no handler implemented yet for job "chat-replay"');

    warn.mockRestore();
  });

  // channel-stats is the one implemented handler. Routing to it is proven by
  // its own behaviour, not a mock: with no channel rows in D1 - the default
  // for a fresh test - it warns and returns without ever calling the YouTube
  // API, so this needs no network stub of its own.
  test('routes channel-stats to its handler', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await runScheduled('*/10 * * * *', env);

    expect(warn).toHaveBeenCalledWith('channel-stats: no channels in D1 to collect');
    expect(warn).toHaveBeenCalledWith('no handler implemented yet for job "video-discover"');
    expect(warn).toHaveBeenCalledWith('no handler implemented yet for job "video-update"');

    warn.mockRestore();
  });

  test('one job failing does not stop the others', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // A genuine D1 failure, not a mock: without its table, channel-stats' own
    // query throws for real, so this exercises runScheduled's isolation with
    // the real binding rather than a cast standing in for one.
    await env.DB.exec('DROP TABLE channel');

    await runScheduled('*/10 * * * *', env);

    expect(error).toHaveBeenCalledWith('job "channel-stats" failed', expect.any(Error));
    expect(warn).toHaveBeenCalledWith('no handler implemented yet for job "video-discover"');
    expect(warn).toHaveBeenCalledWith('no handler implemented yet for job "video-update"');

    error.mockRestore();
    warn.mockRestore();
  });
});
