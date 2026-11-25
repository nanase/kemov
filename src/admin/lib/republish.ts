/**
 * 「本番に反映」 above each list (#285): what was the 公開 screen's
 * 「いま公開する」, for the one data a list shows. The message above the list
 * appears only while the worker would write the public JSON - something is
 * waiting, it may be behind (`publication_write`), or it is outdated - by
 * the same rule as the sidebar's mark (worker/src/admin/drafts.ts).
 */

import { AdminApiError } from './api';
import { canPublishFootprints, type FootprintsPending } from './footprints-publish';
import {
  canPublishGenet,
  publishesOnlyForShape as genetOnlyForShape,
  type GenetPendingResponse,
} from './genet-publish';
import {
  canPublishMilestones,
  publishesOnlyForShape as milestonesOnlyForShape,
  type MilestonesPending,
} from './subscriber-milestones-publish';

/** The words the owner chose for the message, its button and what comes after it (#285). */
export const REPUBLISH_TEXT = {
  behind: '本番に反映されていない変更があります',
  shapeOnly: '本番のデータを新しい形式に更新できます',
  button: '本番に反映',
  done: '本番に反映しました',
  nothing: '反映する変更はありません',
  failed: '本番への反映に失敗しました',
  unreachable: 'サーバーに接続できませんでした',
} as const;

/** Where each list's 「本番に反映」 is sent. */
export const REPUBLISH_PATH = {
  footprints: '/footprints/publish',
  genet: '/genet/publish',
  milestones: '/subscribers/publish',
} as const;

/** What the message above the あしあと list says, or null when it is not shown - the pending list unknown included. */
export function footprintsBandText(state: FootprintsPending | null): string | null {
  return state !== null && canPublishFootprints(state) ? REPUBLISH_TEXT.behind : null;
}

/** The same, above the ジェネット楽曲一覧 list. A JSON only in an older shape says so: its content does not change. */
export function genetBandText(state: GenetPendingResponse | null): string | null {
  if (state === null || !canPublishGenet(state)) return null;

  return genetOnlyForShape(state) ? REPUBLISH_TEXT.shapeOnly : REPUBLISH_TEXT.behind;
}

/** The same, above the 登録者数の節目 list. */
export function milestonesBandText(state: MilestonesPending | null): string | null {
  if (state === null || !canPublishMilestones(state)) return null;

  return milestonesOnlyForShape(state) ? REPUBLISH_TEXT.shapeOnly : REPUBLISH_TEXT.behind;
}

/**
 * Whether the message is shown. A press that went through reads the list's
 * pending state again at once, and hides the message through that read: the
 * worker may still call the JSON behind, since a write another request has
 * not finished is kept for a while (publishing.ts's
 * `ABANDONED_WRITE_MINUTES`). A later read shows it again if it still says
 * so. `held` is the generation of the read `text` comes from, and
 * `hiddenThrough` the generation of the read the press started, or null.
 */
export function bandShown(text: string | null, hiddenThrough: number | null, held: number): boolean {
  return text !== null && (hiddenThrough === null || held > hiddenThrough);
}

/** The toast after a press that went through: whether the worker wrote anything. */
export function republishedToast(published: boolean): string {
  return published ? REPUBLISH_TEXT.done : REPUBLISH_TEXT.nothing;
}

/** The toast after a press that failed. The worker's own words are for the log, not for the person. */
export function republishFailedToast(error: unknown): string {
  return error instanceof AdminApiError && error.status === 0 ? REPUBLISH_TEXT.unreachable : REPUBLISH_TEXT.failed;
}
