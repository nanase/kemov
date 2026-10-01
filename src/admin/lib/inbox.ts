/**
 * Pure logic for the やること screens (#141): 確認待ち, 出典の確認待ち and
 * 公開待ち - the rows `worker/src/admin/inbox.ts` answers with, turned into
 * one table, and how the selection moves through it. Kept apart from the
 * pages so it can be tested without touching the DOM.
 */

import type { FootprintsEvent } from './footprints';
import type { GenetStream } from './genet-streams';
import type { PublishMark } from './publish-mark';

/** `GET /admin/api/inbox`. */
export interface InboxCounts {
  review: number;
  source: number;
  publish: number;
}

/** `GET /admin/api/inbox/review`. */
export interface ReviewInbox {
  events: FootprintsEvent[];
  streams: GenetStream[];
  /** Every tune the streams perform, by id - the titles are Markdown. */
  tuneTitles: Record<string, string>;
}

export type ReviewRow =
  | { key: string; kind: 'event'; date: string; status: string; event: FootprintsEvent }
  | { key: string; kind: 'stream'; date: string; status: string; stream: GenetStream };

/** A UTC instant as the Japan-time date it falls on. */
export function jstDate(instant: string): string {
  return new Date(new Date(instant).getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * あしあと and ジェネット楽曲一覧 in one list: the rows nobody has looked at
 * first, then the ones put off with 「あとで」 (`review`), each part by date.
 * A month-only date sorts before the days of that month.
 */
export function reviewRows(inbox: ReviewInbox): ReviewRow[] {
  const rows: ReviewRow[] = [
    ...inbox.events.map((event) => ({
      key: `event:${event.eventId}`,
      kind: 'event' as const,
      date: event.startDate,
      status: event.status,
      event,
    })),
    ...inbox.streams.map((stream) => ({
      key: `stream:${stream.videoId}`,
      kind: 'stream' as const,
      date: jstDate(stream.publishedAt),
      status: stream.status,
      stream,
    })),
  ];

  const deferred = (row: ReviewRow) => (row.status === 'review' ? 1 : 0);

  return rows.sort((a, b) => deferred(a) - deferred(b) || (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** The key `step` rows away from `current`, kept inside the list - the first row when `current` is not in it. */
export function moveSelection(keys: readonly string[], current: string | null, step: number): string | null {
  if (keys.length === 0) return null;

  const at = current === null ? -1 : keys.indexOf(current);

  if (at === -1) return keys[0]!;

  return keys[Math.min(keys.length - 1, Math.max(0, at + step))]!;
}

/**
 * What to select once the list is read again after a row was settled: the
 * same row if it is still there (「あとで」 keeps it), otherwise the row that
 * now sits where it was, so the next one comes up without a click.
 */
export function selectionAfterReload(
  before: readonly string[],
  after: readonly string[],
  current: string | null,
): string | null {
  if (after.length === 0) return null;
  if (current !== null && after.includes(current)) return current;

  const at = current === null ? -1 : before.indexOf(current);

  if (at === -1) return after[0]!;

  // The rows that came before it and are still there - settling one row can
  // take more than that row out (a bulk run), so its old index alone can skip one.
  const kept = before.slice(0, at).filter((key) => after.includes(key)).length;

  return after[Math.min(kept, after.length - 1)]!;
}

/** One row a bulk run could not settle, and the worker's reason. */
export interface BulkFailure {
  key: string;
  title: string;
  message: string;
}

/**
 * Runs `act` over `items` one at a time, the same path a single press takes,
 * carrying on past a failure - #237's way for doing many rows at once.
 */
export async function runEach<T>(
  items: readonly T[],
  act: (item: T) => Promise<void>,
  describe: (item: T) => { key: string; title: string },
  onProgress: (done: number) => void,
): Promise<BulkFailure[]> {
  const failures: BulkFailure[] = [];

  for (const [index, item] of items.entries()) {
    try {
      await act(item);
    } catch (error) {
      failures.push({ ...describe(item), message: error instanceof Error ? error.message : String(error) });
    }

    onProgress(index + 1);
  }

  return failures;
}

/** Where a stream's first scene starts, in seconds - null when no scene has a moment to point at. */
export function firstStart(performance: GenetStream['performances'][number]): number | null {
  return performance.scenes.find((scene) => scene.startSeconds !== null)?.startSeconds ?? null;
}

/** `GET /admin/api/inbox/publish`. */
export interface PublishInbox {
  items: PublishItem[];
  canPublish: { footprints: boolean; genet: boolean; milestones: boolean };
}

export interface PublishItem {
  target: 'footprints' | 'genet_music' | 'subscriber_milestones';
  entity: 'footprints_event' | 'genet_stream' | 'genet_tune' | 'genet_person' | 'subscriber_milestone';
  key: string;
  title: string | null;
  date: string | null;
  latestAction: string;
}

const ENTITY_LABEL: Record<PublishItem['entity'], string> = {
  footprints_event: 'あしあと',
  genet_stream: '楽曲一覧の配信',
  genet_tune: '楽曲一覧の曲',
  genet_person: '楽曲一覧の人',
  subscriber_milestone: '登録者数の節目',
};

export function publishItemPage(item: PublishItem): string {
  return ENTITY_LABEL[item.entity];
}

/**
 * What the next 「いま公開する」 does to the row: puts it on the site, or takes
 * it off. A withdrawn row waits too, and must not read as going public.
 */
export function publishItemMark(item: PublishItem): PublishMark {
  return item.latestAction === 'withdraw' || item.latestAction === 'delete'
    ? { label: '取り下げ待ち', tone: 'draft' }
    : { label: '公開待ち', tone: 'waiting' };
}

/** The screen the row is edited on. A tune or a person is edited from inside the streams that perform it. */
export function publishItemLink(item: PublishItem): { path: string; query?: Record<string, string> } {
  if (item.entity === 'footprints_event') return { path: '/footprints', query: { event: item.key } };
  if (item.entity === 'genet_stream') return { path: '/sets', query: { video: item.key } };
  if (item.entity === 'subscriber_milestone') return { path: '/subscribers', query: { milestone: item.key } };

  return { path: '/sets' };
}

/**
 * A Markdown title as the text it reads as - each `[label](target)` link down
 * to its label. A target can carry one level of parentheses of its own, the
 * way a Wikipedia article name does (`wiki:猫_(DISH//の曲)`).
 */
export function plainTitle(markdown: string): string {
  return markdown.replace(/\[([^\]]*)\]\((?:[^()]|\([^()]*\))*\)/g, '$1');
}

/** Whether 「いま公開する」 here does anything - the same rule as the 公開 screen's buttons. */
export function canPublishAny(inbox: PublishInbox): boolean {
  return inbox.canPublish.footprints || inbox.canPublish.genet || inbox.canPublish.milestones;
}

export const APPROVED_TOAST = '承認しました。「公開待ち」で「いま公開する」を押すと本番に反映されます';
export const DEFERRED_TOAST = 'あとでに回しました';
export const REJECTED_TOAST = '却下して削除しました';
