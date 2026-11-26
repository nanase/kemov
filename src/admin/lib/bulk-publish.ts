/**
 * まとめて公開 on the 登録者数の節目, あしあと and ジェネット楽曲一覧 lists
 * (#237, #283, #285): the drafts ticked in the list's select column. There is
 * no bulk endpoint: each row goes through the same `POST .../publish` as the
 * edit panel's own 「公開」, with the fields it was saved with, so every row
 * gets the worker's check, its own `publish` revision and the public JSON
 * written, exactly as if it had been pressed by hand.
 */

import { AdminApiError } from './api';

/** What a list row needs for the select column: only a draft can be ticked. */
export interface BulkRow {
  status: string;
}

export interface BulkPublishSkip<T> {
  row: T;
  /** The worker's own message for the refused check. */
  reason: string;
}

export interface BulkPublishOutcome<T> {
  total: number;
  /** Rows this run published. */
  published: number;
  /**
   * Rows already published by the time the run reached them, which it sent
   * nothing for. Not counted as published: another request may have
   * recorded the publish and then failed to write the public JSON.
   */
  alreadyPublished: number;
  skipped: BulkPublishSkip<T>[];
  /** The row whose failure stopped the run, or null when every row was tried. Rows after it were not. */
  stopped: BulkPublishSkip<T> | null;
}

/**
 * Whether a row can be ticked: a draft. A row already published is left
 * alone even though publishing it again is allowed - that is how a changed
 * row gets a new revision, and doing it in bulk would do it to rows nobody
 * looked at.
 */
export function isTickable(row: BulkRow): boolean {
  return row.status === 'draft';
}

/** The keys of the rows `shown` lets be ticked, in the order the list shows them. */
export function tickableKeys<T extends BulkRow, K>(shown: readonly T[], keyOf: (row: T) => K): K[] {
  return shown.filter(isTickable).map(keyOf);
}

/**
 * The ticks that are still good once the list is read again: a row the
 * filters left out, or one published or deleted elsewhere, is no longer
 * there to act on.
 */
export function ticksAfterReload<T extends BulkRow, K>(
  ticked: ReadonlySet<K>,
  shown: readonly T[],
  keyOf: (row: T) => K,
): Set<K> {
  const tickable = new Set(tickableKeys(shown, keyOf));

  return new Set([...ticked].filter((key) => tickable.has(key)));
}

/** Whether the header's checkbox is on: every row that can be ticked is, and there is at least one. */
export function allTicked<T extends BulkRow, K>(
  ticked: ReadonlySet<K>,
  shown: readonly T[],
  keyOf: (row: T) => K,
): boolean {
  const keys = tickableKeys(shown, keyOf);

  return keys.length > 0 && keys.every((key) => ticked.has(key));
}

/** The header's checkbox pressed: every row that can be ticked, or none when they all were. */
export function toggleAll<T extends BulkRow, K>(
  ticked: ReadonlySet<K>,
  shown: readonly T[],
  keyOf: (row: T) => K,
): Set<K> {
  return allTicked(ticked, shown, keyOf) ? new Set() : new Set(tickableKeys(shown, keyOf));
}

/** One row's checkbox pressed. */
export function toggleTick<K>(ticked: ReadonlySet<K>, key: K): Set<K> {
  const next = new Set(ticked);

  if (next.has(key)) next.delete(key);
  else next.add(key);

  return next;
}

/** The ticked rows, in the order the list shows them. */
export function tickedRows<T extends BulkRow, K>(
  ticked: ReadonlySet<K>,
  shown: readonly T[],
  keyOf: (row: T) => K,
): T[] {
  return shown.filter((row) => isTickable(row) && ticked.has(keyOf(row)));
}

/** Whether `error` is the worker refusing a publish for its own conditions (lib/publishing.ts's `problems`). */
function isRefusal(error: unknown): error is AdminApiError {
  return (
    error instanceof AdminApiError &&
    error.status === 400 &&
    typeof error.body === 'object' &&
    error.body !== null &&
    'problems' in error.body &&
    Array.isArray(error.body.problems)
  );
}

/** What `publishInTurn`'s `publish` answers for a row it found published already, and sent nothing for. */
export const ALREADY_PUBLISHED = 'already_published';

/** What `publishInTurn`'s `publish` answers when it found the page left before sending the row's publish: the run ends there. */
export const ABANDONED = 'abandoned';

/**
 * Publishes `targets` one at a time, each request waiting for the one before.
 * A 400 that lists the publish's own problems is the check refusing that
 * row, so the row is skipped and the run goes on. Anything else - a 400 for a
 * field a save refuses, the network, a 5xx (the public JSON could not be
 * written among them), a 404 for a row deleted since the list was read, a
 * 409 for one published since - stops the run there: the rows after it are
 * not tried. `publish` answers `ALREADY_PUBLISHED` for a row it found
 * published already and sent nothing for, and `ABANDONED` when the page
 * was left while it was reading the row, before it sent the publish: that
 * row and the rows after it count as untried.
 * `onProgress` is told how many rows have been answered, stopped row aside.
 * `abandoned` is asked before each row: once it says so - the page was left
 * - no row after is sent, and they count as untried.
 */
export async function publishInTurn<T>(
  targets: readonly T[],
  publish: (row: T) => Promise<typeof ALREADY_PUBLISHED | typeof ABANDONED | void>,
  onProgress?: (done: number) => void,
  abandoned?: () => boolean,
): Promise<BulkPublishOutcome<T>> {
  const outcome: BulkPublishOutcome<T> = {
    total: targets.length,
    published: 0,
    alreadyPublished: 0,
    skipped: [],
    stopped: null,
  };

  for (const row of targets) {
    if (abandoned?.() === true) break;

    try {
      const answer = await publish(row);

      if (answer === ABANDONED) break;
      if (answer === ALREADY_PUBLISHED) outcome.alreadyPublished++;
      else outcome.published++;
    } catch (error) {
      if (!isRefusal(error)) {
        outcome.stopped = { row, reason: error instanceof Error ? error.message : String(error) };
        break;
      }

      outcome.skipped.push({ row, reason: error.message });
    }

    onProgress?.(outcome.published + outcome.alreadyPublished + outcome.skipped.length);
  }

  return outcome;
}

/** What the panel a run leaves says. */
export interface OutcomeSummary<T> {
  heading: string;
  published: number;
  failed: number;
  alreadyPublished: number;
  /** The rows after the one a run stopped at, which it did not try: 0 for a run that tried every row. */
  untried: number;
  /** The rows that failed, in the order they were tried, the row the run stopped at last. */
  failedRows: BulkPublishSkip<T>[];
}

/**
 * The panel under the list after a run. A row the check refused and the row
 * the run stopped at are both 失敗; the rows after that one were not tried,
 * so they are 未処理 and stay ticked for the next press.
 */
export function outcomeSummary<T>(outcome: BulkPublishOutcome<T>): OutcomeSummary<T> {
  const failedRows = outcome.stopped === null ? outcome.skipped : [...outcome.skipped, outcome.stopped];

  return {
    heading: BULK_TEXT.heading(outcome.total, outcome.published),
    published: outcome.published,
    failed: failedRows.length,
    alreadyPublished: outcome.alreadyPublished,
    untried: outcome.total - outcome.published - outcome.alreadyPublished - failedRows.length,
    failedRows,
  };
}

/** The words the owner chose for the bar under the list, its confirmation and the panel a run leaves (#285). */
export const BULK_TEXT = {
  selectAll: 'すべて選択',
  select: '選択',
  ticked: (count: number) => `${count} 件を選択中`,
  publish: 'まとめて公開',
  clear: '選択を解除',
  progress: (done: number, total: number) => `公開処理中… ${done} / ${total} 件`,
  confirmHead: (count: number) => `${count} 件を公開しますか`,
  confirm: '公開',
  cancel: 'キャンセル',
  heading: (total: number, published: number) => `${total} 件中 ${published} 件を公開しました`,
  published: (count: number) => `公開 ${count} 件`,
  failed: (count: number) => `失敗 ${count} 件`,
  alreadyPublished: (count: number) => `公開済み ${count} 件`,
  untried: (count: number) => `未処理 ${count} 件`,
  failedRows: '公開に失敗した行',
  close: '閉じる',
} as const;
