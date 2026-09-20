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
  announcement: '公開・発表',
  debut: 'デビュー',
  '3d': '3D',
  new_outfit: '新衣装',
  real_event: 'リアルイベント',
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

/**
 * How far ahead the upcoming list looks, and how much of it is shown at rest.
 *
 * A year is the window because the things that come round - an anniversary, a
 * round number of days - come round once in one. `SOON_DAYS` is what counts as
 * near enough to be worth the space at rest; `SOON_SHOW` caps the list so that
 * a quiet stretch does not push the map below the screen.
 */
export const SOON_WINDOW_DAYS = 365;
export const SOON_DAYS = 45;
export const SOON_SHOW = 6;

/** Days between the round numbers that are marked (500, 1,000, 1,500 …). */
export const DAY_STEP = 500;

/** How far either side of today counts as "this week" in an earlier year. */
export const AGO_SPREAD_DAYS = 3;

/** How many rows the list that looks back holds. */
export const AGO_SHOW = 4;

/** One row of either list beside the timeline. */
export interface AsideItem {
  /** What opening the row opens, or null where there is nothing behind it. */
  key: string | null;
  at: number;
  /** Whether a time of day is known, so it can be written after the date. */
  timed: boolean;
  label: string;
  /** Still to come, which the row marks with an outline rather than a fill. */
  planned: boolean;
  channelIds: string[];
  title: string;
  /** The stream this row is, where it is one. */
  row: VideoTableRow | null;
  /** How many years ago it was, for the list that looks back. */
  yearsAgo?: number;
}

/** The JST calendar day number an instant falls on. */
function dayNumber(ms: number): number {
  return Math.floor((ms + JST_OFFSET_MS) / DAY_MS);
}

/** Midnight JST on a year, month and day, as an instant. */
function dayAt(year: number, month: number, day: number): number {
  const pad = (value: number) => String(value).padStart(2, '0');

  return dayStart(`${year}-${pad(month)}-${pad(day)}`);
}

/** Whether a set of members passes the filter. Nobody named means everybody. */
function membersPass(channelIds: readonly string[], filters: Filters): boolean {
  return filters.members.size === 0 || channelIds.length === 0
    ? true
    : channelIds.some((id) => filters.members.has(id));
}

/**
 * The days a member or the project started on, which round numbers count from.
 *
 * Taken from the record rather than from `channels`: #140 puts a debut on the
 * timeline as an event, and counting from a second date would put "5 周年" on
 * one row and the debut it counts from on another. Only the first thing of
 * each kind counts - a project is announced once, and a member debuts once -
 * so a later announcement does not start a second count of its own.
 *
 * The row is named after whoever it belongs to rather than after the event's
 * own title, because the title is a sentence ("ケープとフンボルトが初配信")
 * and this row is a count.
 */
function origins(
  events: readonly EventItem[],
  channels: readonly Channel[],
): { item: EventItem; name: string; what: string }[] {
  const names = new Map(channels.map((channel) => [channel.channelId, channel.name]));
  const found: { item: EventItem; name: string; what: string }[] = [];
  const taken = new Set<string>();

  for (const item of events) {
    const { kind, channelIds } = item.event;

    if (item.event.datePrecision !== 'day') continue;
    if (kind !== 'debut' && kind !== 'project') continue;

    const who =
      kind === 'project'
        ? 'けもV'
        : channelIds
            .map((id) => names.get(id) ?? '')
            .filter(Boolean)
            .join('・');
    const name = who === '' ? item.event.title : who;

    if (taken.has(name)) continue;

    taken.add(name);
    found.push({ item, name, what: kind === 'debut' ? 'デビュー' : '発表' });
  }

  return found;
}

/**
 * The days that are coming, nearest first.
 *
 * Five things land here: the anniversaries of a start, the round numbers of
 * days since one, the days a member keeps every year, the events already
 * recorded with a date still ahead, and the streams that have been scheduled.
 * The first three are worked out rather than recorded, so they open the day
 * they are counted from.
 */
export function upcoming(
  events: readonly EventItem[],
  rows: readonly VideoTableRow[],
  channels: readonly Channel[],
  filters: Filters,
  now: number,
): AsideItem[] {
  const today = dayNumber(now);
  const end = today + SOON_WINDOW_DAYS;
  const claimed = new Set(events.flatMap((item) => (item.row === null ? [] : [item.row.videoId])));
  const out: AsideItem[] = [];

  for (const { item, name, what } of origins(events, channels)) {
    const { channelIds } = item.event;
    const [year, month, day] = item.event.startDate.split('-').map(Number) as [number, number, number];

    for (let round = year + 1; dayNumber(dayAt(round, month, day)) <= end; round += 1) {
      const at = dayAt(round, month, day);

      // 29 February in a year that has none rolls into March, which is not the
      // anniversary of anything.
      if (dayNumber(at) < today || new Date(at + JST_OFFSET_MS).getUTCMonth() + 1 !== month) continue;

      out.push({
        key: item.key,
        at,
        timed: false,
        label: '周年',
        planned: false,
        channelIds,
        title: `${name}の${what} ${round - year} 周年`,
        row: null,
      });
    }

    const gone = today - dayNumber(item.at);

    for (
      let days = Math.max(DAY_STEP, Math.ceil(gone / DAY_STEP) * DAY_STEP);
      dayNumber(item.at) + days <= end;
      days += DAY_STEP
    ) {
      if (dayNumber(item.at) + days < today) continue;

      out.push({
        key: item.key,
        at: item.at + days * DAY_MS,
        timed: false,
        label: '日数',
        planned: false,
        channelIds,
        title: `${name}の${what}から ${days.toLocaleString('ja-JP')} 日`,
        row: null,
      });
    }
  }

  // A day a member keeps every year. There is no separate field saying so:
  // the kind `anniversary` is what says it, and holding the same fact in two
  // places would let the two disagree. A date known only to the month is left
  // out, because there is no day to keep.
  for (const item of events) {
    if (item.event.kind !== 'anniversary' || item.event.datePrecision !== 'day') continue;

    const [year, month, day] = item.event.startDate.split('-').map(Number) as [number, number, number];

    for (let round = year + 1; dayNumber(dayAt(round, month, day)) <= end; round += 1) {
      const at = dayAt(round, month, day);

      if (dayNumber(at) < today || new Date(at + JST_OFFSET_MS).getUTCMonth() + 1 !== month) continue;

      out.push({
        key: item.key,
        at,
        timed: false,
        label: '記念日',
        planned: false,
        channelIds: item.event.channelIds,
        title: item.event.title,
        row: null,
      });
    }
  }

  for (const item of events) {
    // A date known only to the month cannot be counted down to.
    if (!item.future || item.event.datePrecision !== 'day') continue;

    out.push({
      key: item.key,
      at: item.at,
      timed: item.timed,
      label: KIND_LABELS[item.event.kind],
      planned: true,
      channelIds: item.event.channelIds,
      title: item.event.title,
      row: item.row,
    });
  }

  for (const row of rows) {
    if (claimed.has(row.videoId) || rowAt(row) <= now) continue;

    out.push({
      key: `v:${row.videoId}`,
      at: rowAt(row),
      timed: true,
      label: row.type === null ? '配信' : VIDEO_LABELS[row.type],
      planned: true,
      channelIds: [row.channelId],
      title: row.title,
      row,
    });
  }

  return out
    .filter((entry) => dayNumber(entry.at) <= end && membersPass(entry.channelIds, filters))
    .sort(
      (a, b) =>
        dayNumber(a.at) - dayNumber(b.at) ||
        Number(a.timed) - Number(b.timed) ||
        a.at - b.at ||
        a.title.localeCompare(b.title),
    );
}

/**
 * The same week, in the years before this one.
 *
 * Three days either side of today rather than the calendar week: somebody
 * opening the page on a Tuesday is looking for what happened around now, not
 * for what happened on a Monday four years ago.
 */
export function thisWeekInPast(
  events: readonly EventItem[],
  rows: readonly VideoTableRow[],
  filters: Filters,
  now: number,
): AsideItem[] {
  const today = dayNumber(now);
  const thisYear = new Date(now + JST_OFFSET_MS).getUTCFullYear();
  const claimed = new Set(events.flatMap((item) => (item.row === null ? [] : [item.row.videoId])));

  /** How many years ago this fell, and how far off today it was, or null. */
  function near(at: number): { yearsAgo: number; offset: number } | null {
    const date = new Date(at + JST_OFFSET_MS);
    const year = date.getUTCFullYear();

    if (year >= thisYear) return null;

    const offset = dayNumber(dayAt(thisYear, date.getUTCMonth() + 1, date.getUTCDate())) - today;

    return Math.abs(offset) <= AGO_SPREAD_DAYS ? { yearsAgo: thisYear - year, offset } : null;
  }

  const found: { entry: AsideItem; offset: number; rank: number }[] = [];

  for (const item of events) {
    if (item.event.datePrecision !== 'day' || !membersPass(item.event.channelIds, filters)) continue;

    const when = near(item.at);

    if (when === null) continue;

    found.push({
      offset: when.offset,
      rank: item.event.emphasized ? 0 : 1,
      entry: {
        key: item.key,
        at: item.at,
        timed: item.timed,
        label: KIND_LABELS[item.event.kind],
        planned: false,
        channelIds: item.event.channelIds,
        title: item.event.title,
        row: item.row,
        yearsAgo: when.yearsAgo,
      },
    });
  }

  // Streams only fill a gap: a week with enough recorded days does not need
  // them, and a week with none would otherwise show nothing at all.
  if (found.length < 3) {
    for (const row of rows) {
      if (claimed.has(row.videoId) || !isKeyStream(row.title)) continue;
      if (filters.members.size !== 0 && !filters.members.has(row.channelId)) continue;

      const when = near(rowAt(row));

      if (when === null) continue;

      found.push({
        offset: when.offset,
        rank: 2,
        entry: {
          key: `v:${row.videoId}`,
          at: rowAt(row),
          timed: true,
          label: row.type === null ? '配信' : VIDEO_LABELS[row.type],
          planned: false,
          channelIds: [row.channelId],
          title: row.title,
          row,
          yearsAgo: when.yearsAgo,
        },
      });
    }
  }

  return found
    .sort((a, b) => a.rank - b.rank || a.offset - b.offset || b.entry.at - a.entry.at)
    .slice(0, AGO_SHOW)
    .sort((a, b) => a.offset - b.offset || b.entry.at - a.entry.at)
    .map((entry) => entry.entry);
}
