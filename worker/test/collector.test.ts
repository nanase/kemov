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

  // The branch is the net under the next job somebody adds, and once #63 to
  // #65 have all landed no job is missing a handler, so nothing real reaches
  // it any more. The map is passed in rather than a job being invented in
  // jobsByCron, which would leave the schedule naming a job that never runs.
  test('warns instead of dropping a job with no handler', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await runScheduled('* * * * *', env, {});

    expect(warn).toHaveBeenCalledWith('no handler implemented yet for job "chat-replay"');

    warn.mockRestore();
  });

  // Routing is proven by each handler's own behaviour, not a mock: with no
  // rows in D1 - the default for a fresh test - all three of the ten-minute
  // jobs warn and return without ever calling the YouTube API, and each says
  // something only it says.
  test('routes every ten-minute job to its handler', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await runScheduled('*/10 * * * *', env);

    expect(warn).toHaveBeenCalledWith('channel-stats: no channels in D1 to collect');
    expect(warn).toHaveBeenCalledWith('video-discover: no channels in D1 to collect');
    expect(warn).toHaveBeenCalledWith('video-update: no videos in D1 to refresh');

    warn.mockRestore();
  });

  // The same argument as the ten-minute jobs above: with no queued work and
  // no uncounted streams in D1, chat-replay says so and returns without
  // reaching the network, so routing to it needs no stub either. The clock is
  // pinned to a minute the job is allowed to scan on, which is what logs.
  test('routes chat-replay to its handler', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));

    try {
      await runScheduled('* * * * *', env);
    } finally {
      vi.useRealTimers();
    }

    expect(log).toHaveBeenCalledWith('chat-replay: nothing due and no uncounted streams to queue');

    log.mockRestore();
  });

  // Again no stub: an empty D1 has nothing to back up, and the job says so
  // for each whole-table file it writes. The clock is pinned because the job
  // names today's date in what it writes and in what it logs.
  test('routes backup to its handler', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-08T00:20:00Z'));

    try {
      await runScheduled('20 0 * * *', env);
    } finally {
      vi.useRealTimers();
    }

    expect(log).toHaveBeenCalledWith('backup: wrote 0 rows of channel for 2026-09-08');

    log.mockRestore();
  });

  // Keep this test last, and add new ones above it. It drops a table, and
  // storage rolls back per file rather than per test, so everything after it
  // in this file would run without `channel`. Dropping is still the right way
  // to fail a job here: runScheduled takes no fetch of its own, so a job has
  // to fail before it reaches the network, and a D1 error is what does that.
  test('one job failing does not stop the others', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // A genuine D1 failure, not a mock: without the table, the two jobs that
    // read `channel` throw for real, so this exercises runScheduled's
    // isolation with the real binding rather than a cast standing in for one.
    // video-update reads only `video`, which is still there, so it is the one
    // that has to survive its neighbours failing.
    await env.DB.exec('DROP TABLE channel');

    await runScheduled('*/10 * * * *', env);

    expect(error).toHaveBeenCalledWith('job "channel-stats" failed', expect.any(Error));
    expect(error).toHaveBeenCalledWith('job "video-discover" failed', expect.any(Error));
    expect(warn).toHaveBeenCalledWith('video-update: no videos in D1 to refresh');

    error.mockRestore();
    warn.mockRestore();
  });
});
