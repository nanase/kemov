/**
 * How old the channel list is, in three steps.
 *
 * Kept identical to `/stats/`'s `freshnessOf` in `src/stats/model.ts` (#161,
 * not yet on main) so the two can share one copy once it merges. `ok` and
 * `warn` alone could not draw #135's freshness badge, so a third step - late
 * but not broken - sits between them.
 */
export type Freshness = 'ok' | 'warn' | 'bad';

export function freshnessOf(ageSeconds: number): Freshness {
  if (ageSeconds <= 10 * 60) return 'ok';

  return ageSeconds <= 30 * 60 ? 'warn' : 'bad';
}
