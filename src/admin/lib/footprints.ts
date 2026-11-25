/**
 * Pure logic for the あしあと screen (#144) - the table's own query, which
 * buttons the edit panel shows, and which field a failed save's message is
 * about. Kept apart from FootprintsPage.vue/FootprintsInspector.vue so it can
 * be tested without touching the DOM.
 */

/** `worker/src/admin/footprints.ts`'s own `KINDS`, in the same order, with the label the mock gives each one. */
export const KINDS: readonly { value: string; label: string }[] = [
  { value: 'project', label: 'プロジェクト' },
  { value: 'announcement', label: '公開・発表' },
  { value: 'debut', label: 'デビュー' },
  { value: '3d', label: '3D' },
  { value: 'new_outfit', label: '新衣装' },
  { value: 'real_event', label: 'リアルイベント' },
  { value: 'goods', label: 'グッズ' },
  { value: 'music', label: '音楽' },
  { value: 'collab', label: 'コラボ' },
  { value: 'media', label: 'メディア' },
  { value: 'milestone', label: '節目' },
  { value: 'graduation', label: '卒業・活動終了' },
  { value: 'anniversary', label: '周年' },
  { value: 'memorial_day', label: '記念日' },
  { value: 'other', label: 'その他' },
];

/** What the table can filter by: the `status` column, in the three steps #277's decision 3 gives each data. */
export const STATUS_OPTIONS: readonly { value: string; label: string }[] = [
  { value: 'all', label: 'すべて' },
  { value: 'draft', label: '下書き' },
  { value: 'published', label: '公開中' },
];

export function kindLabel(kind: string): string {
  return KINDS.find((k) => k.value === kind)?.label ?? kind;
}

/** `GET /admin/api/footprints/events`'s own query string for a status/title-substring pair - '' when neither narrows anything. */
export function footprintsQuery(status: string, q: string): string {
  const params = new URLSearchParams();

  if (status !== 'all') params.set('status', status);
  if (q.trim() !== '') params.set('q', q.trim());

  const query = params.toString();

  return query === '' ? '' : `?${query}`;
}

/**
 * Which of `EventFields` (`worker/src/admin/footprints.ts`) a save's 400
 * is about, read from the worker's English detail (`errorDetail`), so the
 * panel can mark that one field - null when the detail does not name a field
 * this form has, which the panel then shows as a plain save-failed line
 * instead.
 *
 * Reads the worker's own detail rather than duplicating its validation:
 * duplicated rules drift apart from what the worker actually enforces, and
 * the worker is what decides validity either way.
 */
export type EventFieldKey =
  | 'datePrecision'
  | 'startDate'
  | 'startsAt'
  | 'endDate'
  | 'kind'
  | 'title'
  | 'videoId'
  | 'sources'
  | 'channelIds'
  | 'leadChannelIds'
  | 'emphasized';

// endDate before startDate: "endDate is before startDate" names both, and
// endDate is the one actually out of range - the detail's own subject.
const FIELD_MARKERS: readonly [RegExp, EventFieldKey][] = [
  [/\bdatePrecision\b/, 'datePrecision'],
  [/\bstartsAt\b/, 'startsAt'],
  [/\bendDate\b/, 'endDate'],
  [/\bstartDate\b/, 'startDate'],
  [/\bkind\b/, 'kind'],
  [/\btitle\b/, 'title'],
  [/\bvideoId\b/, 'videoId'],
  [/\bsources?\b/, 'sources'],
  // Before channelIds: "every leadChannelIds entry must also be in channelIds" names both.
  [/\bleadChannelIds\b/, 'leadChannelIds'],
  [/\bchannelId(s)?\b/, 'channelIds'],
  [/\bemphasized\b/, 'emphasized'],
];

export function fieldForSaveError(detail: string): EventFieldKey | null {
  for (const [pattern, field] of FIELD_MARKERS) {
    if (pattern.test(detail)) return field;
  }

  return null;
}

export interface FootprintsSource {
  url: string;
  title: string | null;
}

/** The columns `present()` in `worker/src/admin/members.ts` carries that this screen's chips and picker actually use. */
export interface FootprintsMember {
  channelId: string;
  name: string;
  colorKey: string;
}

/** `present()`'s own shape in `worker/src/admin/footprints.ts` - one row as the table and the edit panel both read it. */
export interface FootprintsEvent {
  eventId: number;
  datePrecision: string;
  startDate: string;
  startsAt: string | null;
  endDate: string | null;
  kind: string;
  emphasized: boolean;
  title: string;
  place: string | null;
  supplement: string | null;
  videoId: string | null;
  status: string;
  memo: string | null;
  createdAt: string;
  updatedAt: string;
  channelIds: string[];
  /** The members among `channelIds` the event is about: a debut's own member, not its guests. */
  leadChannelIds: string[];
  sources: FootprintsSource[];
}

/** The fields a POST or PUT body carries - `EventFields` in `worker/src/admin/footprints.ts`, minus what only a save answers back (id/status/timestamps). */
export interface EventFormFields {
  datePrecision: string;
  startDate: string;
  startsAt: string | null;
  endDate: string | null;
  kind: string;
  emphasized: boolean;
  title: string;
  place: string | null;
  supplement: string | null;
  videoId: string | null;
  memo: string | null;
  channelIds: string[];
  /** The members among `channelIds` the event is about: a debut's own member, not its guests. */
  leadChannelIds: string[];
  sources: FootprintsSource[];
}

/** `event`'s own fields, in the shape a PUT body sends them - a deep copy, so editing it never touches the row the table still shows. */
export function toFormFields(event: FootprintsEvent): EventFormFields {
  return {
    datePrecision: event.datePrecision,
    startDate: event.startDate,
    startsAt: event.startsAt,
    endDate: event.endDate,
    kind: event.kind,
    emphasized: event.emphasized,
    title: event.title,
    place: event.place,
    supplement: event.supplement,
    videoId: event.videoId,
    memo: event.memo,
    channelIds: [...event.channelIds],
    leadChannelIds: [...event.leadChannelIds],
    sources: event.sources.map((s) => ({ ...s })),
  };
}

/** A new event's starting fields - what `＋ 足す` opens the edit panel with. Nothing is created until it is saved (#277's 6-12). */
export function emptyFormFields(today: string): EventFormFields {
  return {
    datePrecision: 'day',
    startDate: today,
    startsAt: null,
    endDate: null,
    kind: 'other',
    emphasized: false,
    title: '',
    place: null,
    supplement: null,
    videoId: null,
    memo: null,
    channelIds: [],
    leadChannelIds: [],
    sources: [],
  };
}

/**
 * `rows` with `kept` put back at `index` when they no longer hold it. A row
 * just saved, published or withdrawn stays in the table, with its panel open,
 * until another row is selected - even when the filter no longer takes it.
 */
export function withKeptRow(rows: FootprintsEvent[], kept: FootprintsEvent, index: number): FootprintsEvent[] {
  if (rows.some((e) => e.eventId === kept.eventId)) return rows;

  const at = Math.min(Math.max(index, 0), rows.length);

  return [...rows.slice(0, at), kept, ...rows.slice(at)];
}
