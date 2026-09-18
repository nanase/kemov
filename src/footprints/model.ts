import type { VideoTableRow } from '@/lib/ranking';
import type { Channel, EventKind, FootprintEvent, VideoType } from '@/type/api';

/**
 * What the footprints page works out for itself, with nothing here touching
 * the DOM.
 *
 * The page reads as one road: the things that happened and the streams that
 * filled the days between them, in one column, with today marked in it. That
 * shape is built here - which row follows which, where a month begins, where
 * a run of streams is cut - so that it can be checked without rendering it.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Japan has no daylight saving, so this offset is exact and unconditional. */
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** What each kind of thing is called on screen (#140). */
export const KIND_LABELS: Readonly<Record<EventKind, string>> = {
  project: 'プロジェクト',
  reveal: '公開・発表',
  debut: 'デビュー',
  '3d': '3D',
  outfit: '新衣装',
  'live-event': 'リアルイベント',
  goods: 'グッズ',
  music: '音楽',
  collab: 'コラボ',
  media: 'メディア',
  milestone: '節目',
  graduation: '卒業・活動終了',
  anniversary: '周年',
  other: 'その他',
};

/** What each kind of video is called where one is named. */
export const VIDEO_LABELS: Readonly<Record<VideoType, string>> = {
  streaming: '配信',
  video: '動画',
  shorts: 'ショート',
};

/** How the streams are shown, which is one of the five filters (#140). */
export const STREAM_MODES = [
  { id: 'all', label: '表示する' },
  { id: 'key', label: '重要な配信だけ' },
  { id: 'none', label: '出さない' },
] as const;

export type StreamModeId = (typeof STREAM_MODES)[number]['id'];

/**
 * The words that mark a stream out as one worth naming in a folded run.
 *
 * A run of forty streams cannot show forty titles, and picking by view count
 * would rank them - which this page does not do. What it picks instead is the
 * occasions: a debut, an anniversary, a farewell.
 */
const KEY_TITLE = /記念|周年|初配信|3D|３D|新衣装|お披露目|卒業|最終|お別れ|達成|凸待ち/;

export function isKeyStream(title: string): boolean {
  return KEY_TITLE.test(title);
}

/** The JST calendar day an instant falls on, as `YYYY-MM-DD`. */
export function jstDay(ms: number): string {
  return new Date(ms + JST_OFFSET_MS).toISOString().slice(0, 10);
}

/** The JST month an instant falls in, as `YYYY-MM`. */
export function jstMonth(ms: number): string {
  return jstDay(ms).slice(0, 7);
}

/** The parts of a JST date and time, read without a timezone library. */
export function jstParts(ms: number) {
  const shifted = new Date(ms + JST_OFFSET_MS);

  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    weekday: shifted.getUTCDay(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  };
}

/** Midnight JST on a `YYYY-MM-DD`, as an instant. */
export function dayStart(date: string): number {
  return Date.parse(`${date}T00:00:00+09:00`);
}

/** How many whole days apart two instants are, counted by JST calendar day. */
export function daysBetween(from: number, to: number): number {
  return Math.floor((to + JST_OFFSET_MS) / DAY_MS) - Math.floor((from + JST_OFFSET_MS) / DAY_MS);
}

/** One thing that happened, placed on the timeline. */
export interface EventItem {
  kind: 'event';
  key: string;
  event: FootprintEvent;
  /** When it goes in the order: its start, to the minute where that is known. */
  at: number;
  /** The end of something that ran over several days, or null. */
  endAt: number | null;
  /** How many days it ran, counting both ends. Zero when it was one day. */
  days: number;
  /** True while it is still to come. */
  future: boolean;
  /** True where the time of day is known, so it can be written. */
  timed: boolean;
  /** The stream this event is, where the archive has it. */
  row: VideoTableRow | null;
}

/** A run of streams and videos, shown as one row until it is opened. */
export interface BundleItem {
  kind: 'bundle';
  key: string;
  rows: VideoTableRow[];
  at: number;
  endAt: number;
}

/** Today, which is where the walked road stops. */
export interface NowItem {
  kind: 'now';
  key: 'now';
  at: number;
}

export type TimelineItem = EventItem | BundleItem | NowItem;

export interface MonthGroup {
  /** `YYYY-MM`. */
  month: string;
  year: number;
  monthOfYear: number;
  items: TimelineItem[];
  events: number;
  streams: number;
}

export interface YearGroup {
  year: number;
  months: MonthGroup[];
  events: number;
  streams: number;
}

export interface Timeline {
  years: YearGroup[];
  /** Every item in order, for stepping from one to the next. */
  order: TimelineItem[];
  events: number;
  streams: number;
}

/** What the page is filtered to. */
export interface Filters {
  /** Channel ids. Empty means everybody rather than nobody. */
  members: ReadonlySet<string>;
  /** A kind, or `all`, `emphasized`, `none`. */
  kind: EventKind | 'all' | 'emphasized' | 'none';
  streams: StreamModeId;
  order: 'asc' | 'desc';
}

export const DEFAULT_FILTERS: Filters = { members: new Set(), kind: 'all', streams: 'all', order: 'asc' };

/**
 * When an event goes in the order.
 *
 * A date known only to the month sits at the start of it, which is where a
 * reader looking for that month will be. The stream an event is takes that
 * stream's own start, so that "the 3D reveal" and the stream it happened in
 * are not two rows a minute apart.
 */
export function eventAt(event: FootprintEvent, row: VideoTableRow | null): number {
  if (event.startsAt !== null) return new Date(event.startsAt).getTime();

  if (event.datePrecision === 'day') {
    const start = dayStart(event.startDate);

    if (row?.actualStartTime != null && jstDay(new Date(row.actualStartTime).getTime()) === event.startDate) {
      return new Date(row.actualStartTime).getTime();
    }

    return start;
  }

  return dayStart(event.datePrecision === 'month' ? `${event.startDate}-01` : `${event.startDate}-01-01`);
}

/** Every event as the timeline sees it, oldest first. */
export function eventItems(
  events: readonly FootprintEvent[],
  rows: ReadonlyMap<string, VideoTableRow>,
  now: number,
): EventItem[] {
  return events
    .map<EventItem>((event) => {
      const row = event.videoId === null ? null : (rows.get(event.videoId) ?? null);
      const at = eventAt(event, row);
      const endAt = event.endDate === null ? null : dayStart(event.endDate) + DAY_MS - 60_000;

      return {
        kind: 'event',
        key: `e:${event.eventId}`,
        event,
        at,
        endAt,
        days: endAt === null ? 0 : daysBetween(dayStart(event.startDate), endAt) + 1,
        future: at > now,
        timed:
          event.startsAt !== null || (row !== null && row.actualStartTime !== null && at !== dayStart(event.startDate)),
        row,
      };
    })
    .sort((a, b) => a.at - b.at || a.event.eventId - b.event.eventId);
}

/** Whether an event passes the filters. */
export function eventPasses(item: EventItem, filters: Filters): boolean {
  const { kind, members } = filters;

  if (kind === 'none') return false;
  if (kind === 'emphasized' && !item.event.emphasized) return false;
  if (kind !== 'all' && kind !== 'emphasized' && item.event.kind !== kind) return false;

  // An event with nobody named is けもV as a whole, and belongs to everyone.
  return members.size === 0 || item.event.channelIds.length === 0
    ? true
    : item.event.channelIds.some((id) => members.has(id));
}

/** Whether a stream passes the filters, given the events that claimed some. */
export function streamPasses(row: VideoTableRow, filters: Filters, claimed: ReadonlySet<string>): boolean {
  if (filters.streams === 'none' || claimed.has(row.videoId)) return false;
  if (filters.streams === 'key' && !isKeyStream(row.title)) return false;

  return filters.members.size === 0 || filters.members.has(row.channelId);
}

/** When a stream or video belongs on the timeline. */
export function rowAt(row: VideoTableRow): number {
  return new Date(row.actualStartTime ?? row.publishedAt).getTime();
}

/**
 * The whole road: years, months, and the rows inside them.
 *
 * A run of streams is cut at a month's edge, at anything that happened, and
 * at today - the three places where a reader is looking for something else.
 * Everything is built oldest first here; showing it the other way round is
 * the page's business, not this function's.
 */
export function buildTimeline(
  events: readonly EventItem[],
  rows: readonly VideoTableRow[],
  filters: Filters,
  now: number,
): Timeline {
  const claimed = new Set(events.flatMap((item) => (item.row === null ? [] : [item.row.videoId])));
  const passing = events.filter((item) => eventPasses(item, filters));
  const streams = rows.filter((row) => streamPasses(row, filters, claimed)).sort((a, b) => rowAt(a) - rowAt(b));

  const months = new Map<string, MonthGroup>();
  const order: TimelineItem[] = [];
  let open: BundleItem | null = null;
  let eventCount = 0;
  let streamCount = 0;

  const monthOf = (at: number): MonthGroup => {
    const month = jstMonth(at);
    const found = months.get(month);

    if (found !== undefined) return found;

    const parts = jstParts(at);
    const group: MonthGroup = {
      month,
      year: parts.year,
      monthOfYear: parts.month,
      items: [],
      events: 0,
      streams: 0,
    };

    months.set(month, group);

    return group;
  };

  const pushStream = (row: VideoTableRow) => {
    const at = rowAt(row);
    const group = monthOf(at);

    if (open === null || jstMonth(open.at) !== group.month) {
      open = { kind: 'bundle', key: `b:${row.videoId}`, rows: [], at, endAt: at };
      group.items.push(open);
    }

    open.rows.push(row);
    open.endAt = at;
    group.streams += 1;
    streamCount += 1;
    order.push(open);
  };

  const pushItem = (item: EventItem | NowItem) => {
    const group = monthOf(item.at);

    open = null;
    group.items.push(item);
    order.push(item);

    if (item.kind === 'event') {
      group.events += 1;
      eventCount += 1;
    }
  };

  let eventIndex = 0;
  let streamIndex = 0;
  let nowDone = false;

  for (;;) {
    const nextEvent = eventIndex < passing.length ? passing[eventIndex]!.at : Infinity;
    const nextStream = streamIndex < streams.length ? rowAt(streams[streamIndex]!) : Infinity;
    const nextNow = nowDone ? Infinity : now;

    if (nextEvent === Infinity && nextStream === Infinity && nextNow === Infinity) break;

    if (nextEvent <= nextStream && nextEvent <= nextNow) {
      pushItem(passing[eventIndex]!);
      eventIndex += 1;
    } else if (nextNow < nextStream) {
      pushItem({ kind: 'now', key: 'now', at: now });
      nowDone = true;
    } else {
      pushStream(streams[streamIndex]!);
      streamIndex += 1;
    }
  }

  const years: YearGroup[] = [];

  months.forEach((group) => {
    let year = years[years.length - 1];

    if (year === undefined || year.year !== group.year) {
      year = { year: group.year, months: [], events: 0, streams: 0 };
      years.push(year);
    }

    year.months.push(group);
    year.events += group.events;
    year.streams += group.streams;
  });

  // One row per bundle, however many streams it holds.
  const seen = new Set<TimelineItem>();

  return {
    years,
    order: order.filter((item) => (seen.has(item) ? false : (seen.add(item), true))),
    events: eventCount,
    streams: streamCount,
  };
}

/**
 * Which members were active in a year, in the order the API sends them.
 *
 * A member who finished during the year still belongs to it: the line ends
 * where it ends, and leaving them out of the year they were part of would be
 * the fading-out this page refuses (#140).
 */
export function yearFaces(channels: readonly Channel[], year: number, now: number): Channel[] {
  const from = dayStart(`${year}-01-01`);
  const to = dayStart(`${year + 1}-01-01`) - 1;

  return channels.filter((channel) => {
    const start = dayStart(channel.activityStartDate);
    const end = channel.activityEndDate === null ? null : dayStart(channel.activityEndDate) + DAY_MS - 1;

    return start <= to && start <= now && (end === null || end >= from);
  });
}
