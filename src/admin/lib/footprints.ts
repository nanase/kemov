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
  { value: 'other', label: 'その他' },
];

/**
 * What the table can filter by: the `status` column, which is all the query
 * can see. 公開待ち is not in it - it comes from `GET /footprints/pending`, not
 * from a column - so it is only ever a chip (`footprintsMarkFor`), never an option.
 */
export const STATUS_OPTIONS: readonly { value: string; label: string }[] = [
  { value: 'all', label: 'すべて' },
  { value: 'draft', label: '下書き' },
  { value: 'review', label: '確認中' },
  { value: 'published', label: '公開' },
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
 * message is about, so the panel can mark that one field - null when the
 * message does not name a field this form has, which the panel then shows as
 * a plain save-failed line instead.
 *
 * Reads the worker's own error text rather than duplicating its validation:
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
  | 'emphasized'
  | 'sourcePending';

// endDate before startDate: "endDate is before startDate" names both, and
// endDate is the one actually out of range - the message's own subject.
const FIELD_MARKERS: readonly [RegExp, EventFieldKey][] = [
  [/\bdatePrecision\b/, 'datePrecision'],
  [/\bstartsAt\b/, 'startsAt'],
  [/\bendDate\b/, 'endDate'],
  [/\bstartDate\b/, 'startDate'],
  [/\bkind\b/, 'kind'],
  [/\btitle\b/, 'title'],
  [/\bvideoId\b/, 'videoId'],
  [/\bsource(s|Pending)?\b/, 'sources'],
  [/\bchannelId(s)?\b/, 'channelIds'],
  [/\bemphasized\b/, 'emphasized'],
];

export function fieldForSaveError(message: string): EventFieldKey | null {
  for (const [pattern, field] of FIELD_MARKERS) {
    if (pattern.test(message)) return field;
  }

  return null;
}

/**
 * The edit panel's status buttons and whether 削除 is disabled. A published
 * event can be withdrawn, and can be sent to 公開待ち again - that second one
 * is how a row changed since it was published gets a version matching its
 * current content, since saving never adds one. Deleting one is refused (409)
 * until it is withdrawn.
 */
export interface FootprintsButtons {
  publishLabel: '公開待ちにする' | null;
  withdrawLabel: '下書きに戻す' | null;
  deleteDisabled: boolean;
}

/**
 * `changed` is whether the row differs from what it was published as
 * (`isChangedSincePublish`), or null when that is unknown - a published row is
 * then offered 公開待ちにする rather than left with no way forward.
 */
export function footprintsButtonsFor(status: string, changed: boolean | null): FootprintsButtons {
  if (status !== 'published') {
    return { publishLabel: '公開待ちにする', withdrawLabel: null, deleteDisabled: false };
  }

  return {
    publishLabel: changed === false ? null : '公開待ちにする',
    withdrawLabel: '下書きに戻す',
    deleteDisabled: true,
  };
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
  sourcePending: boolean;
  status: string;
  memo: string | null;
  createdAt: string;
  updatedAt: string;
  channelIds: string[];
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
  sourcePending: boolean;
  memo: string | null;
  channelIds: string[];
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
    sourcePending: event.sourcePending,
    memo: event.memo,
    channelIds: [...event.channelIds],
    sources: event.sources.map((s) => ({ ...s })),
  };
}

/** A new event's starting fields - `＋ 足す` in the table's toolbar creates a draft with these, open for editing right away. */
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
    sourcePending: true,
    memo: null,
    channelIds: [],
    sources: [],
  };
}
