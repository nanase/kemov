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
  test('names the jobs the trigger runs', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    runScheduled('* * * * *');

    expect(log).toHaveBeenCalledWith('scheduled * * * * *: chat-replay');

    log.mockRestore();
  });

  test('warns instead of dropping a cron that reaches no job', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    runScheduled('0 0 * * *');

    expect(warn).toHaveBeenCalledWith('no job is registered for cron "0 0 * * *"');

    warn.mockRestore();
  });
});
