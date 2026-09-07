import type { Env } from '../lib/env';
import { runChannelStats } from './channel-stats';
import { runChatReplay } from './chat-replay';
import { runVideoDiscover, runVideoUpdate } from './video';

/**
 * Which jobs each cron trigger in wrangler.toml runs, from the schedule in
 * #58.
 *
 * The mapping is written down rather than inferred so that a schedule added to
 * wrangler.toml without a job here is visible: it fires, matches nothing, and
 * says so.
 */
const jobsByCron = new Map<string, readonly string[]>([
  ['*/10 * * * *', ['channel-stats', 'video-discover', 'video-update']],
  ['* * * * *', ['chat-replay']],
]);

/** The jobs a cron expression runs, or an empty list if it runs none. */
export function jobsFor(cron: string): readonly string[] {
  return jobsByCron.get(cron) ?? [];
}

type JobHandler = (env: Env) => Promise<void>;

/** What runScheduled dispatches through: a job's name to the code that runs it. */
export type JobHandlers = Readonly<Record<string, JobHandler>>;

/**
 * One entry per implemented job. #63 to #65 add their own entry here; neither
 * this map's shape nor the dispatch loop below changes to fit them. A job
 * named by jobsFor with no entry here is still valid - see the warning below -
 * so #63 to #65 are free to land in any order.
 */
const jobHandlers: JobHandlers = {
  'channel-stats': runChannelStats,
  'chat-replay': runChatReplay,
  'video-discover': runVideoDiscover,
  'video-update': runVideoUpdate,
};

/**
 * Entry point for every scheduled trigger.
 *
 * A cron tick can name several jobs (see jobsByCron above), and they run
 * independently: each job's own errors are caught here so that one job
 * failing - a bad API response, a D1 error - never stops the others from
 * running or crashes the trigger.
 *
 * `handlers` is the map above unless a caller says otherwise, the same way a
 * collector takes its own fetch. Only a test passes it, and only to reach the
 * branch below: every job jobsByCron names now has a handler, so a job without
 * one cannot otherwise be produced - and that branch is the net under the next
 * job somebody adds.
 */
export async function runScheduled(cron: string, env: Env, handlers: JobHandlers = jobHandlers): Promise<void> {
  const jobs = jobsFor(cron);

  if (jobs.length === 0) {
    console.warn(`no job is registered for cron "${cron}"`);
    return;
  }

  console.log(`scheduled ${cron}: ${jobs.join(', ')}`);

  await Promise.all(
    jobs.map(async (job) => {
      const handler = handlers[job];

      if (!handler) {
        console.warn(`no handler implemented yet for job "${job}"`);
        return;
      }

      try {
        await handler(env);
      } catch (error) {
        console.error(`job "${job}" failed`, error);
      }
    }),
  );
}
