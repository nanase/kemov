/**
 * How a change over a period is worked out from two samples of a count.
 *
 * `channel_snapshot` stores readings and nothing else - no rates, by design,
 * so that the way a rate is computed can change without refetching anything
 * (see the schema's opening comment). This is where it is computed.
 *
 * The system this replaces computed rates at collection time and stored them,
 * and its rule was "the sample nearest to 24 hours ago", with no limit on how
 * near that had to be. With two hours of history it reported the change over
 * two hours as the change over a day. #58 lists that among the defects this
 * rewrite exists to remove, so the rule here refuses rather than guesses.
 */

/** A reading of one count at one instant. */
export interface Sample {
  /** 'YYYY-MM-DDTHH:MM:SSZ', as the schema stores it. */
  fetchedAt: string;
  /** NULL in the column, for a count the channel hides or nobody took yet. */
  value: number | null;
}

/** A change over a period, or why there is not one. */
export type Delta =
  { value: number; over: { from: string; to: string; seconds: number } } | { value: null; reason: DeltaMissing };

/**
 * Why there is no change to report. Four answers, not one absence, because
 * they call for different things from whoever is reading.
 *
 *   nothing collected    No reading at all for this channel. Something is
 *                        wrong, or collection has not started.
 *   history too short    Readings exist, but none reaches back far enough.
 *                        This is the whole site on its first day, and on the
 *                        first day of any period longer than it has been
 *                        running. It fixes itself by waiting.
 *   gap too wide         A reading exists back there, but too far from the
 *                        period to stand for it. Collection stopped for a
 *                        while. Waiting does not fix the period that was
 *                        missed.
 *   count not collected  The readings are there and the count inside them is
 *                        not - a channel hiding its subscribers, say.
 */
export type DeltaMissing = 'nothing collected' | 'history too short' | 'gap too wide' | 'count not collected';

/**
 * How far the older sample may sit from the period asked for.
 *
 * Two parts, and the larger wins:
 *
 *   * A tenth of the period. A day's change may be measured over 21.6 to 26.4
 *     hours, which absorbs a collector that missed a run or two without
 *     letting a half-day stand in for a day.
 *   * Fifteen minutes, whatever the period. Collection runs every ten minutes,
 *     so the nearest sample to any instant is at most five minutes from it,
 *     and one missed run still lands inside. Without the floor an hour's
 *     change would demand a sample within six minutes and refuse most of the
 *     time.
 *
 * Both directions are refused, not just the short one. A sample thirty hours
 * back is no more "a day ago" than one two hours back is.
 */
export const TOLERANCE_FRACTION = 0.1;
export const TOLERANCE_FLOOR_SECONDS = 15 * 60;

/** The periods the API reports a change over. */
export const HOUR_SECONDS = 60 * 60;
export const DAY_SECONDS = 24 * HOUR_SECONDS;

export function toleranceSeconds(periodSeconds: number): number {
  return Math.max(TOLERANCE_FLOOR_SECONDS, periodSeconds * TOLERANCE_FRACTION);
}

function secondsBetween(from: string, to: string): number {
  return (new Date(to).getTime() - new Date(from).getTime()) / 1000;
}

/**
 * The change in a count over `periodSeconds`, from the newest sample back to
 * whichever earlier sample best matches that period.
 *
 * `earlier` is the newest sample at or before the target instant - the same
 * one the old rule would have picked. What is new is that it is checked
 * against the period before being used, and refused with a reason rather than
 * reported as if it fitted.
 *
 * The reason travels with the absence because "this channel has not moved" and
 * "nobody has measured it for long enough to say" are different answers, and
 * a caller shown only `null` would have to guess which it was.
 */
export function changeOver(latest: Sample | undefined, earlier: Sample | undefined, periodSeconds: number): Delta {
  // Told apart on purpose. A channel nobody has read yet and a channel read
  // for an hour when the question was about a day are both missing the same
  // number, and only one of them means anything is wrong.
  if (latest === undefined) return { value: null, reason: 'nothing collected' };
  if (earlier === undefined) return { value: null, reason: 'history too short' };

  // A hidden subscriber count is not zero - the schema says so - so a period
  // with one at either end has no change to report rather than a change of
  // however much the other end holds.
  if (latest.value === null || earlier.value === null) return { value: null, reason: 'count not collected' };

  const elapsed = secondsBetween(earlier.fetchedAt, latest.fetchedAt);

  if (Math.abs(elapsed - periodSeconds) > toleranceSeconds(periodSeconds)) {
    return { value: null, reason: 'gap too wide' };
  }

  return {
    value: latest.value - earlier.value,
    over: { from: earlier.fetchedAt, to: latest.fetchedAt, seconds: elapsed },
  };
}
