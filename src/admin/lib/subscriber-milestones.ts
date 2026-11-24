/**
 * Pure logic for the 登録者数の節目 screen (#225) - the table's own query, the
 * body a save sends, and which field a failed save's message is about. Kept
 * apart from SubscribersPage.vue/SubscriberMilestoneInspector.vue so it can be
 * tested without touching the DOM, the same split lib/footprints.ts uses.
 */

import type { FootprintsEvent, FootprintsSource } from './footprints';

/** What the table can filter by: the `status` column, in the three steps #277's decision 3 gives each data (#283). */
export const STATUS_OPTIONS: readonly { value: string; label: string }[] = [
  { value: 'all', label: 'すべて' },
  { value: 'draft', label: '下書き' },
  { value: 'published', label: '公開中' },
];

/** `worker/src/admin/subscriber-milestones.ts`'s own `ANNOUNCERS`, in the same order. */
export const ANNOUNCERS: readonly { value: string; label: string }[] = [
  { value: 'member', label: '本人' },
  { value: 'official', label: '公式' },
  { value: 'listener', label: 'リスナー' },
];

export function announcerLabel(announcedBy: string): string {
  return ANNOUNCERS.find((a) => a.value === announcedBy)?.label ?? announcedBy;
}

/** `present()`'s own shape in `worker/src/admin/subscriber-milestones.ts`. */
export interface SubscriberMilestone {
  milestoneId: number;
  channelId: string;
  datePrecision: string;
  reachedDate: string;
  subscriberCount: number;
  announcedBy: string;
  eventId: number | null;
  status: string;
  memo: string | null;
  createdAt: string;
  updatedAt: string;
  sources: FootprintsSource[];
}

/**
 * What the edit panel edits. `subscriberCount` is the text in the field, not
 * a number: `toRequestBody` decides what reaches the worker, so that text a
 * number cannot be read from is refused by the worker with its own reason
 * rather than turned into some other number here.
 */
export interface MilestoneFormFields {
  channelId: string;
  datePrecision: string;
  reachedDate: string;
  subscriberCount: string;
  announcedBy: string;
  eventId: number | null;
  memo: string | null;
  sources: FootprintsSource[];
}

/** `GET /admin/api/subscribers/milestones`'s own query string - '' when neither narrows anything. */
export function milestonesQuery(channelId: string, status: string): string {
  const params = new URLSearchParams();

  if (channelId !== 'all') params.set('channelId', channelId);
  if (status !== 'all') params.set('status', status);

  const query = params.toString();

  return query === '' ? '' : `?${query}`;
}

/** `milestone`'s own fields, as the edit panel edits them - a deep copy, so editing it never touches the row the table still shows. */
export function toFormFields(milestone: SubscriberMilestone): MilestoneFormFields {
  return {
    channelId: milestone.channelId,
    datePrecision: milestone.datePrecision,
    reachedDate: milestone.reachedDate,
    subscriberCount: String(milestone.subscriberCount),
    announcedBy: milestone.announcedBy,
    eventId: milestone.eventId,
    memo: milestone.memo,
    sources: milestone.sources.map((s) => ({ ...s })),
  };
}

/**
 * A new milestone's starting fields. The date and the count start empty
 * rather than as today and some number: either would be a plausible value
 * that a save could keep by mistake, and neither comes from anywhere but the
 * person entering it (#222).
 */
export function emptyFormFields(channelId: string): MilestoneFormFields {
  return {
    channelId,
    datePrecision: 'day',
    reachedDate: '',
    subscriberCount: '',
    announcedBy: 'member',
    eventId: null,
    memo: null,
    sources: [],
  };
}

/**
 * The POST or PUT body for `fields`. The count's thousands separators are
 * dropped, since 20,000 is how the number is usually written; anything else
 * that is not digits is sent as it is, for the worker to refuse. An empty
 * memo is sent as null, which is what the column holds for "none".
 */
export function toRequestBody(fields: MilestoneFormFields): Record<string, unknown> {
  const count = fields.subscriberCount.trim().replace(/,/g, '');

  return {
    channelId: fields.channelId,
    datePrecision: fields.datePrecision,
    reachedDate: fields.reachedDate.trim(),
    subscriberCount: /^\d+$/.test(count) ? Number(count) : fields.subscriberCount,
    announcedBy: fields.announcedBy,
    eventId: fields.eventId,
    memo: fields.memo === null || fields.memo.trim() === '' ? null : fields.memo,
    sources: fields.sources.map((s) => ({ url: s.url.trim(), title: s.title === '' ? null : s.title })),
  };
}

/** The count as the screen writes it, with thousands separators. */
export function formatCount(count: number): string {
  return count.toLocaleString('ja-JP');
}

/** How a milestone is named where it has no row of its own to stand in: 「シマハイイロギツネ 20,000 人（2024-01-30）」. */
export function milestoneTitle(milestone: SubscriberMilestone, memberName: string): string {
  return `${memberName} ${formatCount(milestone.subscriberCount)} 人（${milestone.reachedDate}）`;
}

/** The events a milestone may be linked to: the worker accepts only kind `milestone`. */
export function linkableEvents(events: readonly FootprintsEvent[]): FootprintsEvent[] {
  return events.filter((e) => e.kind === 'milestone');
}

export type MilestoneFieldKey =
  'channelId' | 'datePrecision' | 'reachedDate' | 'subscriberCount' | 'announcedBy' | 'eventId' | 'sources';

// "footprints event 3 is not a milestone" names no field, and the pattern
// for eventId reads it too. A refused publish names its field itself
// (lib/publishing.ts), so nothing here reads the publish check's words.
const FIELD_MARKERS: readonly [RegExp, MilestoneFieldKey][] = [
  [/\bchannelId\b/, 'channelId'],
  [/\bdatePrecision\b/, 'datePrecision'],
  [/\breachedDate\b/, 'reachedDate'],
  [/\bsubscriberCount\b/, 'subscriberCount'],
  [/\bannouncedBy\b/, 'announcedBy'],
  [/\beventId\b|\bfootprints event\b/, 'eventId'],
  [/\bsources?\b/, 'sources'],
];

/**
 * Which field a save's 400 message is about, or null when it names none this
 * form has. Reads the worker's own text rather than repeating its checks
 * here, as lib/footprints.ts's `fieldForSaveError` does.
 *
 * Unlike that one, the field marked is the one named first in the message,
 * not the first in `FIELD_MARKERS`: a message naming two fields is about the
 * one it names first.
 */
export function fieldForSaveError(message: string): MilestoneFieldKey | null {
  let first: { at: number; field: MilestoneFieldKey } | null = null;

  for (const [pattern, field] of FIELD_MARKERS) {
    const at = message.search(pattern);

    if (at !== -1 && (first === null || at < first.at)) first = { at, field };
  }

  return first?.field ?? null;
}
