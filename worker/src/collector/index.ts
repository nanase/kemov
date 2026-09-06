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

/**
 * Entry point for every scheduled trigger.
 *
 * The jobs themselves are implemented in #62 to #65. Dispatching before they
 * exist keeps the deploy in #73 verifiable on its own: the trigger fires, the
 * worker names what it would have run, and a schedule that reaches no job is
 * reported rather than dropped.
 */
export function runScheduled(cron: string): void {
  const jobs = jobsFor(cron);

  if (jobs.length === 0) {
    console.warn(`no job is registered for cron "${cron}"`);
    return;
  }

  console.log(`scheduled ${cron}: ${jobs.join(', ')}`);
}
