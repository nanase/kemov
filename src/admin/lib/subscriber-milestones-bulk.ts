/**
 * まとめて公開待ちにする on the 登録者数の節目 screen (#237). There is no bulk
 * endpoint: each row goes through the same `POST .../:milestoneId/publish`
 * as the edit panel's own button, so every row gets the worker's source
 * check and its own `publish` revision exactly as if it had been pressed by
 * hand.
 */

import { AdminApiError } from './api';
import type { SubscriberMilestone } from './subscriber-milestones';

export interface BulkPublishSkip {
  milestone: SubscriberMilestone;
  /** The worker's own message for the refused check. */
  reason: string;
}

export interface BulkPublishOutcome {
  total: number;
  published: number;
  skipped: BulkPublishSkip[];
  /** The row whose failure stopped the run, or null when every row was tried. Rows after it were not. */
  stopped: BulkPublishSkip | null;
}

/**
 * The rows the button acts on: the drafts among `shown`, which is the table
 * as the member and status filters leave it. A row already published is left
 * alone even though publishing it again is allowed - that is how a changed
 * row gets a new revision, and doing it in bulk would do it to rows nobody
 * looked at.
 */
export function bulkPublishTargets(shown: readonly SubscriberMilestone[]): SubscriberMilestone[] {
  return shown.filter((m) => m.status === 'draft');
}

/**
 * Publishes `targets` one at a time, each request waiting for the one before.
 * A 400 is the check refusing that row, so the row is skipped and the run
 * goes on. Anything else - the network, a 5xx, a 404 for a row deleted since
 * the list was read - stops the run there: the rows after it are not tried.
 * `onProgress` is told how many rows have been answered, stopped row aside.
 */
export async function publishInTurn(
  targets: readonly SubscriberMilestone[],
  publish: (milestoneId: number) => Promise<unknown>,
  onProgress?: (done: number) => void,
): Promise<BulkPublishOutcome> {
  const outcome: BulkPublishOutcome = { total: targets.length, published: 0, skipped: [], stopped: null };

  for (const milestone of targets) {
    try {
      await publish(milestone.milestoneId);
      outcome.published++;
    } catch (error) {
      if (!(error instanceof AdminApiError) || error.status !== 400) {
        outcome.stopped = { milestone, reason: error instanceof Error ? error.message : String(error) };
        break;
      }

      outcome.skipped.push({ milestone, reason: error.message });
    }

    onProgress?.(outcome.published + outcome.skipped.length);
  }

  return outcome;
}
