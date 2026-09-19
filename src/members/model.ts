import { spanOf, WEEK_MINUTES } from '@/lib/heatmap';
import type { VideoTableRow } from '@/lib/ranking';
import { VIDEO_PROPERTIES, type VideoProperty } from '@/type/video';
import { VIDEO_TYPES, type Channel, type ChannelMonths, type VideoType } from '@/type/api';

/**
 * What the member page works out for itself, with nothing here touching the
 * DOM.
 *
 * Every number on the page comes from one member's own rows of
 * `GET /api/videos/table`, which is also why none of this takes a second
 * member: #136 forbids putting one member's figures beside another's, and a
 * function that cannot see anybody else cannot be asked to.
 */

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Japan has no daylight saving, so this offset is exact and unconditional. */
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** The window the gauges read, and the one they compare it against. */
export const WINDOW_DAYS = 90;

/** How the list's ranking is narrowed. The ranking itself is @/lib/ranking.ts. */
export const LIST_PERIODS = [
  { id: 'all', label: '全期間' },
  { id: '1y', label: '直近 1 年' },
  { id: '90d', label: '直近 90 日' },
] as const;

export type ListPeriodId = (typeof LIST_PERIODS)[number]['id'];

/** How the lower band's four panels are narrowed. */
export const BEHAVIOR_PERIODS = [
  { id: 'all', label: '全期間' },
  { id: '1y', label: '直近 1 年' },
  { id: 'year', label: '年を選ぶ' },
] as const;

export type BehaviorPeriodId = (typeof BEHAVIOR_PERIODS)[number]['id'];

/** The five series the monthly panel can draw, and what each one is called. */
export const MONTHLY_SERIES = [
  { id: 'streams', label: '本数', unit: '本' },
  { id: 'hours', label: '配信時間', unit: '' },
  { id: 'chat', label: 'チャット数', unit: '' },
  { id: 'chatUsers', label: 'チャットユーザ数', unit: '' },
  { id: 'views', label: '再生数', unit: '' },
] as const;

export type MonthlySeriesId = (typeof MONTHLY_SERIES)[number]['id'];

/** The kinds the list can show, one at a time. */
export const KINDS = [
  { id: 'streaming', label: '配信' },
  { id: 'video', label: '動画' },
  { id: 'shorts', label: 'ショート' },
] as const;

/**
 * What the reader chose, and what the URL carries (#137).
 *
 * All of it lives in the query string so that a narrowed screen can be shared
 * or reloaded and come back the same. `year` is only read when
 * `behaviorPeriod` is `year`; keeping it separate means picking a year and
 * then going back to 全期間 does not lose which year it was.
 */
export interface PageState {
  listPeriod: ListPeriodId;
  behaviorPeriod: BehaviorPeriodId;
  year: number | null;
  monthly: MonthlySeriesId;
  type: VideoType;
  q: string;
  metric: VideoProperty;
  order: 'desc' | 'asc';
}

export const DEFAULT_STATE: PageState = {
  listPeriod: 'all',
  behaviorPeriod: 'all',
  year: null,
  monthly: 'streams',
  type: 'streaming',
  q: '',
  metric: 'viewCount',
  order: 'desc',
};

function oneOf<T extends string>(allowed: readonly T[], value: string | null, fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

/**
 * The state a query string asks for, with anything unreadable left at its
 * default.
 *
 * A hand-written or outdated query is the same case as a hand-edited stored
 * setting: what it names may not be something this page can draw, and the
 * answer is the default rather than a blank screen.
 */
export function readQuery(search: string): PageState {
  const query = new URLSearchParams(search);
  const year = Number(query.get('year'));

  return {
    listPeriod: oneOf(
      LIST_PERIODS.map((period) => period.id),
      query.get('listPeriod'),
      DEFAULT_STATE.listPeriod,
    ),
    behaviorPeriod: oneOf(
      BEHAVIOR_PERIODS.map((period) => period.id),
      query.get('behaviorPeriod'),
      DEFAULT_STATE.behaviorPeriod,
    ),
    year: Number.isInteger(year) && year >= 2000 && year <= 2999 ? year : null,
    monthly: oneOf(
      MONTHLY_SERIES.map((series) => series.id),
      query.get('monthly'),
      DEFAULT_STATE.monthly,
    ),
    type: oneOf(VIDEO_TYPES, query.get('type'), DEFAULT_STATE.type),
    q: query.get('q') ?? '',
    metric: oneOf(VIDEO_PROPERTIES, query.get('metric'), DEFAULT_STATE.metric),
    order: oneOf(['desc', 'asc'] as const, query.get('order'), DEFAULT_STATE.order),
  };
}

/**
 * The query string for a state, carrying only what differs from the default.
 *
 * A URL that spelled out every choice would be six parameters long before the
 * reader had chosen anything, and the one thing worth sharing - what they did
 * change - would be buried in it.
 */
export function writeQuery(state: PageState): string {
  const query = new URLSearchParams();

  if (state.listPeriod !== DEFAULT_STATE.listPeriod) query.set('listPeriod', state.listPeriod);
  if (state.behaviorPeriod !== DEFAULT_STATE.behaviorPeriod) query.set('behaviorPeriod', state.behaviorPeriod);
  if (state.behaviorPeriod === 'year' && state.year !== null) query.set('year', String(state.year));
  if (state.monthly !== DEFAULT_STATE.monthly) query.set('monthly', state.monthly);
  if (state.type !== DEFAULT_STATE.type) query.set('type', state.type);
  if (state.q !== '') query.set('q', state.q);
  if (state.metric !== DEFAULT_STATE.metric) query.set('metric', state.metric);
  if (state.order !== DEFAULT_STATE.order) query.set('order', state.order);

  const written = query.toString();

  return written === '' ? '' : `?${written}`;
}

/**
 * The instant a member's windows are measured back from.
 *
 * Today for somebody still streaming, and the day after their last for
 * somebody who has finished (#136): anchoring both to today would make every
 * window of the four who have finished empty, and an empty board reads as "we
 * have nothing on them" rather than "this window is after their time".
 */
export function anchorOf(channel: Channel, now: number): number {
  if (channel.activityEndDate === null) return now;

  return Date.parse(`${channel.activityEndDate}T00:00:00+09:00`) + DAY_MS;
}

/** The JST calendar day an instant falls on, as `YYYY-MM-DD`. */
export function jstDay(ms: number): string {
  return new Date(ms + JST_OFFSET_MS).toISOString().slice(0, 10);
}

/** The JST year an instant falls in. */
export function jstYear(ms: number): number {
  return new Date(ms + JST_OFFSET_MS).getUTCFullYear();
}

/** One of this member's streams, placed in the week and on the calendar. */
export interface MemberStream {
  row: VideoTableRow;
  startMs: number;
  /** The JST day it began on. */
  day: string;
  /** Minutes from its start, at least one. */
  minutes: number;
  /** Minutes from Sunday 00:00 JST, as `@/lib/heatmap` counts them. */
  weekMinute: number;
  /** The hour and minute of the day it began at, in JST. */
  startMinuteOfDay: number;
}

/**
 * Every stream of this member's, oldest first.
 *
 * A stream with no end recorded still counts: its length comes from the
 * duration the collector stored, and where that is missing too it is drawn as
 * the one minute it is known to have run for. Leaving it out instead would
 * take the stream off the heatmap entirely, which says it never happened.
 */
export function memberStreams(rows: readonly VideoTableRow[]): MemberStream[] {
  return rows
    .flatMap<MemberStream>((row) => {
      if (row.type !== 'streaming' || row.actualStartTime === null) return [];

      const startMs = Math.floor(new Date(row.actualStartTime).getTime() / MINUTE_MS) * MINUTE_MS;
      const endMs =
        row.actualEndTime !== null && row.actualEndTime > row.actualStartTime
          ? new Date(row.actualEndTime).getTime()
          : startMs + (row.durationSeconds ?? 0) * 1000;
      const [weekMinute, minutes] = spanOf(row.actualStartTime, new Date(Math.max(endMs, startMs)).toISOString());
      const shifted = new Date(startMs + JST_OFFSET_MS);

      return [
        {
          row,
          startMs,
          day: jstDay(startMs),
          minutes,
          weekMinute,
          startMinuteOfDay: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
        },
      ];
    })
    .sort((a, b) => a.startMs - b.startMs);
}

/** The streams the lower band covers, and the range it resolved to. */
export interface BehaviorWindow {
  streams: MemberStream[];
  /** The years the member streamed in, newest first, for the year picker. */
  years: number[];
}

/**
 * The streams a behaviour period admits.
 *
 * `1y` runs back from the member's own last stream rather than from today,
 * for the same reason the gauges use an anchor: a member who finished two
 * years ago has nothing in the last year of the calendar, and the panels would
 * all be empty for a reason that has nothing to do with how they streamed.
 */
export function behaviorWindow(all: readonly MemberStream[], period: BehaviorPeriodId, year: number | null) {
  const years = [...new Set(all.map((stream) => jstYear(stream.startMs)))].sort((a, b) => b - a);

  if (period === 'year' && year !== null) {
    return { streams: all.filter((stream) => jstYear(stream.startMs) === year), years };
  }

  if (period === '1y' && all.length > 0) {
    const last = all[all.length - 1]!.startMs;

    return { streams: all.filter((stream) => stream.startMs >= last - 365 * DAY_MS), years };
  }

  return { streams: [...all], years };
}

/** What the six cumulative figures say. */
export interface Cumulative {
  subscriberCount: number | null;
  viewCount: number | null;
  activityDays: number;
  likeCount: number;
  likeRated: number;
  commentCount: number;
  commentRated: number;
  videoCount: number;
  byKind: Record<VideoType, number>;
}

/**
 * The figures that only ever grow, from the channel's own record and its rows.
 *
 * Subscribers and total views are the channel's own readings; the rest are the
 * public rows added up. How many of them carried a value is kept beside each
 * sum, because "12,000 likes over 780 videos" and "12,000 likes over the 200
 * we could read" are different statements.
 */
export function cumulativeOf(channel: Channel, rows: readonly VideoTableRow[], now: number): Cumulative {
  const byKind: Record<VideoType, number> = { streaming: 0, video: 0, shorts: 0 };
  let likeCount = 0;
  let likeRated = 0;
  let commentCount = 0;
  let commentRated = 0;

  rows.forEach((row) => {
    if (row.likeCount !== null) {
      likeCount += row.likeCount;
      likeRated += 1;
    }

    if (row.commentCount !== null) {
      commentCount += row.commentCount;
      commentRated += 1;
    }

    if (row.type !== null) byKind[row.type] += 1;
  });

  const startMs = Date.parse(`${channel.activityStartDate}T00:00:00+09:00`);
  const endMs =
    channel.activityEndDate === null ? now : Date.parse(`${channel.activityEndDate}T00:00:00+09:00`) + DAY_MS - 1;

  return {
    subscriberCount: channel.latest.subscriberCount,
    viewCount: channel.latest.viewCount,
    activityDays: Math.max(1, Math.floor((endMs - startMs) / DAY_MS) + 1),
    likeCount,
    likeRated,
    commentCount,
    commentRated,
    videoCount: rows.length,
    byKind,
  };
}

/** What one 90-day window holds, before it is read as six gauges. */
export interface WindowTotals {
  /** Everything published in the window, whatever kind it is. */
  count: number;
  /** How many of those were streams, which is what the length is about. */
  streamCount: number;
  /** Seconds streamed. Videos and shorts are not streaming time. */
  durationSeconds: number;
  durationRated: number;
  chatMessages: number;
  chatRated: number;
  chatUsers: number;
}

/** Everything published in `[from, to)`, summed. */
export function windowTotals(rows: readonly VideoTableRow[], from: number, to: number): WindowTotals {
  const totals: WindowTotals = {
    count: 0,
    streamCount: 0,
    durationSeconds: 0,
    durationRated: 0,
    chatMessages: 0,
    chatRated: 0,
    chatUsers: 0,
  };

  rows.forEach((row) => {
    const at = new Date(row.publishedAt).getTime();

    if (at < from || at >= to) return;

    totals.count += 1;

    // Only streams. The gauge is called 配信時間 and the line under it reads
    // `months.streamSeconds`, so counting a short's nine seconds here would
    // make the number and its own line disagree.
    if (row.type === 'streaming') {
      totals.streamCount += 1;

      if (row.durationSeconds !== null) {
        totals.durationSeconds += row.durationSeconds;
        totals.durationRated += 1;
      }
    }

    if (row.type === 'streaming' && row.chatMessageCount !== null) {
      totals.chatMessages += row.chatMessageCount;
      totals.chatRated += 1;
      totals.chatUsers += row.chatUniqueUserCount ?? 0;
    }
  });

  return totals;
}

/** The six measures the gauges show, in the order they are drawn. */
export const GAUGES = [
  { id: 'count', label: '本数', unit: '本', kind: 'count' },
  { id: 'duration', label: '配信時間', unit: '', kind: 'duration' },
  { id: 'perVideo', label: '1 本あたりの配信時間', unit: '', kind: 'duration' },
  { id: 'chat', label: 'チャット数', unit: '', kind: 'count' },
  { id: 'chatUsers', label: 'チャットユーザ数', unit: '延べ', kind: 'count' },
  { id: 'chatPerStream', label: '1 配信あたりチャット数', unit: '', kind: 'rate' },
] as const;

export type GaugeId = (typeof GAUGES)[number]['id'];

/**
 * One gauge's reading of a window.
 *
 * A window with nothing in it reports zero streamed seconds rather than "not
 * measured": the month-by-month line draws that month as a zero, and a gauge
 * that said "—" for the same stretch would contradict the line right beside
 * it. Everything that needs a stream to exist before it means anything - a
 * length per video, chat per stream - stays null.
 */
export function gaugeValue(id: GaugeId, totals: WindowTotals): number | null {
  switch (id) {
    case 'count':
      return totals.count;
    case 'duration':
      return totals.streamCount === 0 ? 0 : totals.durationRated > 0 ? totals.durationSeconds : null;
    case 'perVideo':
      // Divided by everything published, which is what the line under it does
      // (`streamSeconds` over `streams + videos + shorts`). The two have to
      // measure the same thing or the reading contradicts its own history.
      return totals.count > 0 && totals.durationRated > 0 ? totals.durationSeconds / totals.count : null;
    case 'chat':
      return totals.chatRated > 0 ? totals.chatMessages : null;
    case 'chatUsers':
      return totals.chatRated > 0 ? totals.chatUsers : null;
    case 'chatPerStream':
      return totals.chatRated > 0 ? totals.chatMessages / totals.chatRated : null;
  }
}

/**
 * How much was published each month: streams, videos and shorts together.
 *
 * A month is only a total where all three are known. One of them missing
 * makes the sum a lower bound rather than a count, and a lower bound drawn as
 * a bar reads as a quiet month rather than as a gap in the record. Null is
 * the honest answer, and the line and the bars both leave a hole for it.
 */
function publishedByMonth(months: ChannelMonths): (number | null)[] {
  return months.streams.map((streams, index) => {
    const videos = months.videos[index];
    const shorts = months.shorts[index];

    if (streams === null || videos === null || videos === undefined || shorts === null || shorts === undefined) {
      return null;
    }

    return streams + videos + shorts;
  });
}

/**
 * A gauge's month-by-month line, from `GET /api/months`.
 *
 * The thin line under each gauge is the whole history of that measure, so a
 * 90-day figure can be read against how the member usually is rather than
 * against anybody else (#136). A month with nothing to divide by is a hole in
 * the line, not a zero.
 */
export function gaugeSeries(months: ChannelMonths, id: GaugeId): (number | null)[] {
  const published = publishedByMonth(months);
  const per = (top: (number | null)[], bottom: (number | null)[]) =>
    top.map((value, index) => {
      const divisor = bottom[index];

      return value === null || divisor === null || divisor === undefined || divisor === 0 ? null : value / divisor;
    });

  switch (id) {
    case 'count':
      return published;
    case 'duration':
      return months.streamSeconds;
    case 'perVideo':
      return per(months.streamSeconds, published);
    case 'chat':
      return months.chatMessages;
    case 'chatUsers':
      return months.chatUniqueUsers;
    case 'chatPerStream':
      return per(months.chatMessages, months.streams);
  }
}

/** The monthly panel's bars, in the unit that panel writes them in. */
export function monthlySeries(months: ChannelMonths, id: MonthlySeriesId): (number | null)[] {
  switch (id) {
    case 'streams':
      return publishedByMonth(months);
    case 'hours':
      return months.streamSeconds.map((seconds) => (seconds === null ? null : seconds / 3600));
    case 'chat':
      return months.chatMessages;
    case 'chatUsers':
      return months.chatUniqueUsers;
    case 'views':
      return months.views;
  }
}

/**
 * How this window compares with the one before it, in percent.
 *
 * Null wherever the comparison would be meaningless rather than zero: nothing
 * to compare against, or a previous window of zero, which every change would
 * be an infinite rise from.
 */
export function gaugeChange(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null;

  return Math.round(((current - previous) / previous) * 100);
}

/** Which entries of a count array share the highest value. */
export interface Top {
  /** Every index holding the maximum, in order. Empty when nothing was counted. */
  list: number[];
  max: number;
}

/**
 * The busiest entries of a tally.
 *
 * Several can share the lead and the page has to say so (#136): picking one
 * would invent a winner, and the data has real ties - three weekdays at 32
 * streams apiece in one member's 2022.
 */
export function topsOf(counts: readonly number[]): Top {
  const max = Math.max(0, ...counts);

  if (max === 0) return { list: [], max: 0 };

  return { list: counts.flatMap((value, index) => (value === max ? [index] : [])), max };
}

/** The nine cells of the shape panel, as numbers rather than as words. */
export interface Shape {
  streams: number;
  /** The hour of the day most streams begin in, and how many did. */
  startHour: Top;
  /** The six-hour stretch holding the most starts, and how many are in it. */
  bandFrom: number;
  bandCount: number;
  /** The hour most streams end in, and how many ran past midnight. */
  endHour: Top;
  overnight: number;
  /** The middle length in minutes, and how many ran between one and two hours. */
  medianMinutes: number;
  oneToTwoHours: number;
  /** How many ran three hours or longer. */
  longStreams: number;
  /** Days between streams, and the same rate written by the week. */
  daysPerStream: number | null;
  perWeek: number | null;
  /** The weekday most streams begin on. */
  weekday: Top;
  /** Days streamed, out of the days the window spans. */
  daysStreamed: number;
  spanDays: number;
  /** Weeks streamed, out of the weeks the window spans. */
  weeksStreamed: number;
  spanWeeks: number;
  /** Every stream's length in minutes, for the distribution panel. */
  minutes: number[];
  /** The days streamed on, oldest first, for the streak panel. */
  days: string[];
}

/** The Monday of the week a JST day falls in, as `YYYY-MM-DD`. */
export function weekStart(day: string): string {
  const at = new Date(`${day}T00:00:00Z`);

  at.setUTCDate(at.getUTCDate() - ((at.getUTCDay() + 6) % 7));

  return at.toISOString().slice(0, 10);
}

/**
 * What the shape panel reads, from the streams of one window.
 *
 * The rate by the day and the rate by the week come from the same division so
 * that seven divided by one is the other: worked out apart, "2.5 days apart"
 * and "2.8 a week" drift and the panel contradicts itself.
 */
export function shapeOf(streams: readonly MemberStream[]): Shape | null {
  if (streams.length === 0) return null;

  const startHours = new Array<number>(24).fill(0);
  const endHours = new Array<number>(24).fill(0);
  const weekdays = new Array<number>(7).fill(0);
  const days = new Set<string>();
  const weeks = new Set<string>();
  const minutes: number[] = [];
  let overnight = 0;

  streams.forEach((stream) => {
    const startHour = Math.floor(stream.startMinuteOfDay / 60);
    const end = new Date(stream.startMs + stream.minutes * MINUTE_MS + JST_OFFSET_MS);
    const shifted = new Date(stream.startMs + JST_OFFSET_MS);

    startHours[startHour] += 1;
    endHours[end.getUTCHours()] += 1;
    weekdays[shifted.getUTCDay()] += 1;
    days.add(stream.day);
    weeks.add(weekStart(stream.day));
    minutes.push(stream.minutes);

    if (end.getUTCDate() !== shifted.getUTCDate()) overnight += 1;
  });

  // The six hours holding the most starts. Rolled around midnight, because an
  // evening that runs past it is one stretch to a reader and two to an array.
  let bandFrom = 0;
  let bandCount = 0;

  for (let hour = 0; hour < 24; hour += 1) {
    let sum = 0;

    for (let step = 0; step < 6; step += 1) sum += startHours[(hour + step) % 24]!;

    if (sum > bandCount) {
      bandCount = sum;
      bandFrom = hour;
    }
  }

  const ordered = [...days].sort();
  const first = ordered[0]!;
  const last = ordered[ordered.length - 1]!;
  const spanDays = Math.round((Date.parse(`${last}T00:00:00Z`) - Date.parse(`${first}T00:00:00Z`)) / DAY_MS) + 1;
  // Weeks are counted as the weeks crossed, not as days divided by seven:
  // the division reports 53 of 52 weeks, which prints as 101.9 %.
  const spanWeeks =
    Math.round(
      (Date.parse(`${weekStart(last)}T00:00:00Z`) - Date.parse(`${weekStart(first)}T00:00:00Z`)) / (7 * DAY_MS),
    ) + 1;
  const sorted = [...minutes].sort((a, b) => a - b);

  return {
    streams: streams.length,
    startHour: topsOf(startHours),
    bandFrom,
    bandCount,
    endHour: topsOf(endHours),
    overnight,
    medianMinutes: sorted[Math.floor(sorted.length / 2)]!,
    oneToTwoHours: minutes.filter((value) => value >= 60 && value < 120).length,
    longStreams: minutes.filter((value) => value >= 180).length,
    daysPerStream: spanDays / streams.length,
    perWeek: (streams.length * 7) / spanDays,
    weekday: topsOf(weekdays),
    daysStreamed: days.size,
    spanDays,
    weeksStreamed: weeks.size,
    spanWeeks,
    minutes,
    days: ordered,
  };
}

/**
 * A title as it is compared against what somebody typed.
 *
 * Width and case are folded away, and katakana is read as hiragana, so that
 * searching for ｶﾗｵｹ, カラオケ and からおけ all find the same streams. Titles on
 * this site mix all three within a single word.
 */
export function normalizeSearch(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (character) => String.fromCharCode(character.charCodeAt(0) - 0x60));
}

/**
 * The words a search box asks for.
 *
 * Split after the folding above, which has already turned a full-width space
 * into an ordinary one - so one rule covers a query typed in either width.
 */
export function searchTerms(query: string): string[] {
  return normalizeSearch(query)
    .split(/\s+/)
    .filter((term) => term !== '');
}

/** Whether a title carries every word asked for. */
export function matchesSearch(title: string, terms: readonly string[]): boolean {
  const normalized = normalizeSearch(title);

  return terms.every((term) => normalized.includes(term));
}

/** One run of a title, and whether the search matched it. */
export interface TitlePart {
  text: string;
  hit: boolean;
}

/**
 * A title split into what the search found and what it did not.
 *
 * Folding can change a string's length - ﾊﾟ is one character and パ is two -
 * and the marks are placed by index, so a title that changes length is left
 * unmarked rather than marked in the wrong place.
 */
export function highlightParts(title: string, terms: readonly string[]): TitlePart[] {
  const normalized = normalizeSearch(title);

  if (terms.length === 0 || normalized.length !== title.length) return [{ text: title, hit: false }];

  const marks = new Array<boolean>(title.length).fill(false);

  terms.forEach((term) => {
    let at = normalized.indexOf(term);

    while (at >= 0) {
      for (let index = at; index < at + term.length; index += 1) marks[index] = true;
      at = normalized.indexOf(term, at + term.length);
    }
  });

  const parts: TitlePart[] = [];

  // `marks` is indexed the way `indexOf` counts, which is in UTF-16 units,
  // while this walks whole characters. An emoji is two units and one
  // character, so the offset is carried along rather than taken from the
  // character's position - otherwise everything after the first emoji is
  // highlighted one place out.
  let at = 0;

  for (const character of title) {
    const hit = marks[at] ?? false;
    const last = parts[parts.length - 1];

    if (last !== undefined && last.hit === hit) last.text += character;
    else parts.push({ text: character, hit });

    at += character.length;
  }

  return parts;
}

/** Days streamed back to back, and how they are written. */
export interface Streak {
  from: string;
  to: string;
  days: number;
}

/**
 * Every run of two or more days in a row, longest first.
 *
 * A single day is not a run of anything, so it is left out rather than listed
 * as a run of one - which would make the panel a list of every day streamed.
 */
export function streaksOf(days: readonly string[]): Streak[] {
  const runs: Streak[] = [];
  let from = days[0];
  let length = 0;

  days.forEach((day, index) => {
    const previous = days[index - 1];

    if (previous !== undefined && Date.parse(`${day}T00:00:00Z`) - Date.parse(`${previous}T00:00:00Z`) === DAY_MS) {
      length += 1;
    } else {
      if (from !== undefined && length >= 2) runs.push({ from, to: previous!, days: length });
      from = day;
      length = 1;
    }
  });

  if (from !== undefined && length >= 2) runs.push({ from, to: days[days.length - 1]!, days: length });

  return runs.sort((a, b) => b.days - a.days || (a.from < b.from ? 1 : -1));
}

/** One distribution, as the bars and the class widths that drew it. */
export interface Distribution {
  bins: number[];
  /** The width of one class, in the unit of the values. */
  step: number;
  /** The class the middle value falls in, which is drawn darker. */
  medianBin: number;
  /** True when the last class is everything from its lower bound upward. */
  openEnd: boolean;
}

/** How many classes a distribution is cut into, the last one open-ended. */
export const DISTRIBUTION_BINS = 13;

/**
 * A class width that reads as a round number.
 *
 * 1, 2 or 5 times a power of ten: an axis labelled in steps of 5,000 can be
 * read at a glance, and one labelled in steps of 4,700 cannot.
 */
export function niceStep(rough: number): number {
  if (!(rough > 0)) return 1;

  const magnitude = Math.pow(10, Math.floor(Math.log10(rough)));
  const scaled = rough / magnitude;
  const rounded = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10;

  return Math.max(1, Math.round(rounded * magnitude));
}

/**
 * Values sorted into classes of a fixed width.
 *
 * A width fixed in advance cannot work for the counts: measured on the real
 * archive, a linear twenty classes put 42 % of one member's videos and 61 %
 * of another's into a single bar. The width instead comes from the data - the
 * 95th percentile cut into twelve - so that the shape of the middle is
 * visible and the long tail is one class at the end.
 */
export function distributionOf(values: readonly number[], step?: number): Distribution | null {
  if (values.length === 0) return null;

  const sorted = [...values].sort((a, b) => a - b);
  const percentile95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]!;
  const width = step ?? niceStep(percentile95 / 12);
  const bins = new Array<number>(DISTRIBUTION_BINS).fill(0);

  values.forEach((value) => {
    bins[Math.min(DISTRIBUTION_BINS - 1, Math.floor(value / width))]! += 1;
  });

  return {
    bins,
    step: width,
    medianBin: Math.min(DISTRIBUTION_BINS - 1, Math.floor(sorted[Math.floor(sorted.length / 2)]! / width)),
    openEnd: true,
  };
}

/** The counted grid a heatmap is drawn from, and its margins. */
export interface HeatCounts {
  /** Seven rows of `columns` cells, row-major. */
  cells: number[];
  columns: number;
  stepMinutes: number;
  max: number;
  /** How many streams touched each weekday, and each time of day. */
  byWeekday: number[];
  byColumn: number[];
  weekdayMax: number;
  columnMax: number;
}

/**
 * How many streams were on air in each cell of the week.
 *
 * Streams, not minutes: `/stats/` counts the minutes streamed in a cell,
 * which answers "how much of this hour is usually filled", and this page
 * counts the streams that covered it, which answers "how many streams are
 * usually running then" (#136). One stream adds one to every cell it covers
 * and one to each weekday and time of day it touches, however long it ran, so
 * changing the resolution never changes what a number means.
 */
export function heatCounts(streams: readonly MemberStream[], stepMinutes: number): HeatCounts {
  const columns = Math.round(24 * (60 / stepMinutes));
  const weekCells = Math.round(WEEK_MINUTES / stepMinutes);
  const cells = new Array<number>(7 * columns).fill(0);
  const byWeekday = new Array<number>(7).fill(0);
  const byColumn = new Array<number>(columns).fill(0);

  streams.forEach((stream) => {
    const firstCell = Math.floor(stream.weekMinute / stepMinutes);
    const lastCell = Math.floor((stream.weekMinute + stream.minutes - 1) / stepMinutes);
    const span = Math.min(lastCell - firstCell, weekCells - 1);
    const seenWeekday = new Set<number>();
    const seenColumn = new Set<number>();

    for (let step = 0; step <= span; step += 1) {
      const cell = (firstCell + step) % weekCells;
      const weekday = Math.floor(cell / columns);
      const column = cell % columns;

      cells[weekday * columns + column]! += 1;

      if (!seenWeekday.has(weekday)) {
        seenWeekday.add(weekday);
        byWeekday[weekday]! += 1;
      }

      if (!seenColumn.has(column)) {
        seenColumn.add(column);
        byColumn[column]! += 1;
      }
    }
  });

  return {
    cells,
    columns,
    stepMinutes,
    max: Math.max(0, ...cells),
    byWeekday,
    byColumn,
    weekdayMax: Math.max(0, ...byWeekday),
    columnMax: Math.max(0, ...byColumn),
  };
}

/** How many shades the heatmap has, the lightest one still a mark. */
export const HEAT_LEVELS = 4;

/**
 * Which shade a cell takes, on a square-root scale.
 *
 * Linear shading loses the quiet cells of a busy member: one stream against a
 * peak of forty would be a twenty-fifth of full strength, which is not a mark
 * anybody sees. The root lifts the bottom without flattening the top.
 */
export function heatLevel(value: number, max: number): number {
  if (value <= 0) return 0;
  if (max <= 1) return HEAT_LEVELS;

  return Math.max(1, Math.min(HEAT_LEVELS, Math.ceil((Math.sqrt(value) / Math.sqrt(max)) * HEAT_LEVELS)));
}

/** The busiest cell, which the readout falls back to. */
export function busiestCell(heat: HeatCounts): { weekday: number; column: number; value: number } | null {
  if (heat.max === 0) return null;

  const index = heat.cells.indexOf(heat.max);

  return { weekday: Math.floor(index / heat.columns), column: index % heat.columns, value: heat.max };
}
