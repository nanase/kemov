import dayjs, { type Dayjs } from '@nanase/alnilam/dayjs';

import {
  field,
  readArray,
  readBoolean,
  readCount,
  readDate,
  readEach,
  readInstant,
  readNumber,
  readObject,
  readOneOf,
  readOrNull,
  readString,
  ShapeError,
} from '@/lib/read';
import { relayChannelIconURL } from '@/lib/relay';

/**
 * What the API answers with, and the readers that turn a body into it.
 *
 * The shape is defined here and not shared with `worker/src`. Sharing it would
 * mean the browser bundle importing modules written against workerd's types,
 * and it would not buy what it looks like it buys: the worker builds these
 * bodies, so a type it shared would describe what it meant to send rather than
 * what arrived. A reader that refuses is the only thing that can tell those
 * apart, and it has to live on this side.
 *
 * Timestamps become Dayjs here rather than in the components, so that
 * `2026-09-07T12:00:00Z` is checked once, where the field name is still known.
 */

/** The three counts a channel reports, and the names the API uses for them. */
export const COUNT_NAMES = ['subscriberCount', 'viewCount', 'videoCount'] as const;

export type CountName = (typeof COUNT_NAMES)[number];

/**
 * Why a change could not be worked out.
 *
 * Four reasons and not one absence, because they do not mean the same thing to
 * a reader. Two of them say collection is broken and two say there is nothing
 * to show yet, and a site that draws them all as a blank tells nobody which.
 */
export const DELTA_MISSING = ['nothing collected', 'history too short', 'gap too wide', 'count not collected'] as const;

export type DeltaMissing = (typeof DELTA_MISSING)[number];

/**
 * A change over a period, or the reason there is none.
 *
 * `worker/src/lib/delta.ts` has a type of the same name with the same
 * branches, and they are not interchangeable: the instants there are the
 * strings D1 stores, and here they have been parsed. Searching the repository
 * for `Delta` finds both, so the difference is worth saying out loud.
 */
export type Delta =
  { value: number; over: { from: Dayjs; to: Dayjs; seconds: number } } | { value: null; reason: DeltaMissing };

function readDelta(value: unknown, path: string): Delta {
  const count = readOrNull(field(value, 'value', path), `${path}.value`, readNumber);

  if (count === null) {
    return { value: null, reason: readOneOf(field(value, 'reason', path), `${path}.reason`, DELTA_MISSING) };
  }

  const over = field(value, 'over', path);

  return {
    value: count,
    over: {
      from: dayjs(readInstant(field(over, 'from', `${path}.over`), `${path}.over.from`)),
      to: dayjs(readInstant(field(over, 'to', `${path}.over`), `${path}.over.to`)),
      seconds: readNumber(field(over, 'seconds', `${path}.over`), `${path}.over.seconds`),
    },
  };
}

function readDeltas(value: unknown, path: string): Record<CountName, Delta> {
  readObject(value, path);

  return Object.fromEntries(
    COUNT_NAMES.map((name) => [name, readDelta(field(value, name, path), `${path}.${name}`)]),
  ) as Record<CountName, Delta>;
}

export interface Channel {
  channelId: string;
  name: string;
  fullname: string;
  globalname: string | null;
  twitter: string | null;
  color: { key: string; sub: string; light: string; back: string };
  activityStartDate: string;
  /** Null while the streamer is active. */
  activityEndDate: string | null;
  /** Both null until the collector has read the channel once. */
  customUrl: string | null;
  /**
   * Where to draw the channel's icon from: the image relay's address for it,
   * not YouTube's. Null is "the collector has not read an icon for this
   * channel", which is a different thing from an icon that fails to load.
   */
  thumbnailUrl: string | null;
  /** When this channel's numbers were read. Null when they never have been. */
  fetchedAt: Dayjs | null;
  /** Null is "the channel hides this count", never zero. */
  latest: Record<CountName, number | null>;
  perHour: Record<CountName, Delta>;
  perDay: Record<CountName, Delta>;
  per30Days: Record<CountName, Delta>;
}

export function readChannel(value: unknown, path: string): Channel {
  const color = field(value, 'color', path);
  const latest = field(value, 'latest', path);

  readObject(latest, `${path}.latest`);

  const channelId = readString(field(value, 'channelId', path), `${path}.channelId`);
  const storedIcon = readOrNull(field(value, 'thumbnailUrl', path), `${path}.thumbnailUrl`, readString);

  return {
    channelId,
    name: readString(field(value, 'name', path), `${path}.name`),
    fullname: readString(field(value, 'fullname', path), `${path}.fullname`),
    globalname: readOrNull(field(value, 'globalname', path), `${path}.globalname`, readString),
    twitter: readOrNull(field(value, 'twitter', path), `${path}.twitter`, readString),
    color: {
      key: readString(field(color, 'key', `${path}.color`), `${path}.color.key`),
      sub: readString(field(color, 'sub', `${path}.color`), `${path}.color.sub`),
      light: readString(field(color, 'light', `${path}.color`), `${path}.color.light`),
      back: readString(field(color, 'back', `${path}.color`), `${path}.color.back`),
    },
    activityStartDate: readDate(field(value, 'activityStartDate', path), `${path}.activityStartDate`),
    activityEndDate: readOrNull(field(value, 'activityEndDate', path), `${path}.activityEndDate`, readDate),
    customUrl: readOrNull(field(value, 'customUrl', path), `${path}.customUrl`, readString),
    // Only a channel the collector has an icon for gets an address: null stays
    // null, so a page draws its stand-in without asking the relay for a 404.
    thumbnailUrl: storedIcon === null ? null : relayChannelIconURL(channelId),
    fetchedAt: readOrNull(field(value, 'fetchedAt', path), `${path}.fetchedAt`, (v, p) => dayjs(readInstant(v, p))),
    latest: Object.fromEntries(
      COUNT_NAMES.map((name) => [
        name,
        readOrNull(field(latest, name, `${path}.latest`), `${path}.latest.${name}`, readNumber),
      ]),
    ) as Record<CountName, number | null>,
    perHour: readDeltas(field(value, 'perHour', path), `${path}.perHour`),
    perDay: readDeltas(field(value, 'perDay', path), `${path}.perDay`),
    per30Days: readDeltas(field(value, 'per30Days', path), `${path}.per30Days`),
  };
}

export interface ChannelList {
  /** The newest reading anywhere, so the age of the set can be judged at once. */
  fetchedAt: Dayjs | null;
  channels: Channel[];
}

export function readChannelList(body: unknown): ChannelList {
  return {
    fetchedAt: readOrNull(field(body, 'fetchedAt', 'body'), 'body.fetchedAt', (v, p) => dayjs(readInstant(v, p))),
    channels: readEach(field(body, 'channels', 'body'), 'body.channels', readChannel),
  };
}

export const VIDEO_TYPES = ['video', 'streaming', 'shorts'] as const;
export const AVAILABILITIES = ['public', 'membership', 'private', 'unavailable'] as const;
export const LIVE_BROADCAST_CONTENTS = ['none', 'upcoming', 'live'] as const;

export type VideoType = (typeof VIDEO_TYPES)[number];
export type VideoAvailability = (typeof AVAILABILITIES)[number];
export type LiveBroadcastContentType = (typeof LIVE_BROADCAST_CONTENTS)[number];

export interface Video {
  videoId: string;
  channelId: string;
  title: string;
  publishedAt: Dayjs;
  availability: VideoAvailability;
  liveBroadcastContent: LiveBroadcastContentType;
  /**
   * Null until video-update has worked out what this video is.
   *
   * Every row #67's migration wrote starts that way, and the sweep fills them
   * in oldest first. A list that treated null as a type would put an archive
   * of thousands into whichever bucket it guessed.
   */
  type: VideoType | null;
  durationSeconds: number | null;
  viewCount: number | null;
  likeCount: number | null;
  commentCount: number | null;
  chatMessageCount: number | null;
  chatUniqueUserCount: number | null;
  /**
   * The three instants that describe a stream.
   *
   * All null for a video that was never one. A scheduled stream has only the
   * first; a finished one has all three.
   */
  scheduledStartTime: Dayjs | null;
  actualStartTime: Dayjs | null;
  actualEndTime: Dayjs | null;
  fetchedAt: Dayjs;
}

export function readVideo(value: unknown, path: string): Video {
  const count = (name: string) => readOrNull(field(value, name, path), `${path}.${name}`, readNumber);
  const instant = (name: string) =>
    readOrNull(field(value, name, path), `${path}.${name}`, (v, p) => dayjs(readInstant(v, p)));

  return {
    videoId: readString(field(value, 'videoId', path), `${path}.videoId`),
    channelId: readString(field(value, 'channelId', path), `${path}.channelId`),
    title: readString(field(value, 'title', path), `${path}.title`),
    publishedAt: dayjs(readInstant(field(value, 'publishedAt', path), `${path}.publishedAt`)),
    availability: readOneOf(field(value, 'availability', path), `${path}.availability`, AVAILABILITIES),
    liveBroadcastContent: readOneOf(
      field(value, 'liveBroadcastContent', path),
      `${path}.liveBroadcastContent`,
      LIVE_BROADCAST_CONTENTS,
    ),
    type: readOrNull(field(value, 'type', path), `${path}.type`, (v, p) => readOneOf(v, p, VIDEO_TYPES)),
    durationSeconds: count('durationSeconds'),
    viewCount: count('viewCount'),
    likeCount: count('likeCount'),
    commentCount: count('commentCount'),
    chatMessageCount: count('chatMessageCount'),
    chatUniqueUserCount: count('chatUniqueUserCount'),
    scheduledStartTime: instant('scheduledStartTime'),
    actualStartTime: instant('actualStartTime'),
    actualEndTime: instant('actualEndTime'),
    fetchedAt: dayjs(readInstant(field(value, 'fetchedAt', path), `${path}.fetchedAt`)),
  };
}

export interface VideoPage {
  channelId: string;
  videos: Video[];
  /** Null on the last page. Hand it back to ask for the next one. */
  nextCursor: string | null;
}

export function readVideoPage(body: unknown): VideoPage {
  return {
    channelId: readString(field(body, 'channelId', 'body'), 'body.channelId'),
    videos: readEach(field(body, 'videos', 'body'), 'body.videos', readVideo),
    nextCursor: readOrNull(field(body, 'nextCursor', 'body'), 'body.nextCursor', readString),
  };
}

/** One video in a ranking, with the value it was ordered by. */
export interface RankedVideo extends Video {
  metricValue: number;
}

export interface VideoRanking {
  /** The measure this was ordered by, as the API echoed it back. */
  metric: string;
  /** The kind it was narrowed to, or null for every kind. */
  kind: VideoType | null;
  videos: RankedVideo[];
}

/**
 * Reads a ranking, and checks it answers the question that was asked.
 *
 * The metric and the kind are compared against what was requested rather than
 * merely validated. Every ranking is a different URL and the API caches by
 * URL, so an answer carrying someone else's metric would be a caching fault -
 * and it would look exactly like a correct ranking of the wrong thing, which
 * is not a failure anybody would notice from the numbers.
 */
export function readVideoRanking(metric: string, kind: VideoType | null) {
  return (body: unknown): VideoRanking => {
    const answered = readString(field(body, 'metric', 'body'), 'body.metric');
    const narrowed = readOrNull(field(body, 'kind', 'body'), 'body.kind', (v, p) => readOneOf(v, p, VIDEO_TYPES));

    if (answered !== metric) throw new ShapeError('body.metric', `the requested ${metric}`, answered);
    if (narrowed !== kind) throw new ShapeError('body.kind', `the requested ${kind ?? 'every kind'}`, narrowed);

    return {
      metric: answered,
      kind: narrowed,
      videos: readEach(field(body, 'videos', 'body'), 'body.videos', (value, path) => ({
        ...readVideo(value, path),
        metricValue: readNumber(field(value, 'metricValue', path), `${path}.metricValue`),
      })),
    };
  };
}

export interface LiveStream {
  videoId: string;
  channelId: string;
  title: string;
  /** Never 'none': the endpoint filters those out. */
  state: 'upcoming' | 'live';
  /** An upcoming stream has only the first; a live one is described by the second. */
  scheduledStartTime: Dayjs | null;
  actualStartTime: Dayjs | null;
  fetchedAt: Dayjs;
}

function readLiveStream(value: unknown, path: string): LiveStream {
  const instant = (name: string) =>
    readOrNull(field(value, name, path), `${path}.${name}`, (v, p) => dayjs(readInstant(v, p)));

  return {
    videoId: readString(field(value, 'videoId', path), `${path}.videoId`),
    channelId: readString(field(value, 'channelId', path), `${path}.channelId`),
    title: readString(field(value, 'title', path), `${path}.title`),
    state: readOneOf(field(value, 'state', path), `${path}.state`, ['upcoming', 'live'] as const),
    scheduledStartTime: instant('scheduledStartTime'),
    actualStartTime: instant('actualStartTime'),
    fetchedAt: dayjs(readInstant(field(value, 'fetchedAt', path), `${path}.fetchedAt`)),
  };
}

export interface LiveList {
  streams: LiveStream[];
  /**
   * How many free chats were left out.
   *
   * Counted rather than merely absent: a channel whose only upcoming stream is
   * a free chat looks identical to a channel with nothing scheduled, and the
   * scraper being replaced never told them apart.
   */
  excludedFreeChats: number;
}

export function readLiveList(body: unknown): LiveList {
  return {
    streams: readEach(field(body, 'streams', 'body'), 'body.streams', readLiveStream),
    excludedFreeChats: readNumber(field(body, 'excludedFreeChats', 'body'), 'body.excludedFreeChats'),
  };
}

/**
 * The series `GET /api/months` carries for each member and for the sum.
 *
 * Every array has one entry per month in `months`, in the same order. A null
 * is not a zero: in a member's own series it means the month is before their
 * debut, and in `subscribers` it means no count was read that month.
 */
export const MONTH_SERIES = [
  'streams',
  'videos',
  'shorts',
  'streamSeconds',
  'chatMessages',
  'chatUniqueUsers',
  'views',
] as const;

export type MonthSeriesName = (typeof MONTH_SERIES)[number];

export type ChannelMonths = { channelId: string } & Record<MonthSeriesName, (number | null)[]> & {
    /**
     * What this member's subscriber count was read as that month.
     *
     * Null where no snapshot covers the month, which is every month before
     * collection started (#125). `total.subscribers` is not this summed - see
     * below.
     */
    subscribers: (number | null)[];
  };

/**
 * The same series for every member at once.
 *
 * `subscribers` carries an ended member's last known count forward rather
 * than dropping it, which is what #134 asks of the total and what a member's
 * own series deliberately does not do.
 */
export type MonthTotals = Record<MonthSeriesName, number[]> & { subscribers: (number | null)[] };

export interface MonthsSeries {
  /** The newest reading behind these numbers, or null when there is none yet. */
  fetchedAt: Dayjs | null;
  /** Every month from the earliest debut to the current one, as 'YYYY-MM'. */
  months: string[];
  channels: ChannelMonths[];
  total: MonthTotals;
}

/**
 * A month-by-month series, every entry a tally or a hole.
 *
 * Read as counts rather than as plain numbers: every one of these is a number
 * of things - streams, seconds, chat lines, subscribers - and the page adds
 * them up. A negative or fractional entry would be carried into a total that
 * nobody could explain.
 */
function readCounts(value: unknown, path: string, name: string): (number | null)[] {
  return readEach(field(value, name, path), `${path}.${name}`, (v, p) => readOrNull(v, p, readCount));
}

function readChannelMonths(value: unknown, path: string): ChannelMonths {
  return {
    channelId: readString(field(value, 'channelId', path), `${path}.channelId`),
    ...(Object.fromEntries(MONTH_SERIES.map((name) => [name, readCounts(value, path, name)])) as Record<
      MonthSeriesName,
      (number | null)[]
    >),
    subscribers: readCounts(value, path, 'subscribers'),
  };
}

function readMonthTotals(value: unknown, path: string): MonthTotals {
  return {
    ...(Object.fromEntries(
      MONTH_SERIES.map((name) => [name, readEach(field(value, name, path), `${path}.${name}`, readCount)]),
    ) as Record<MonthSeriesName, number[]>),
    subscribers: readCounts(value, path, 'subscribers'),
  };
}

export function readMonthsSeries(body: unknown): MonthsSeries {
  return {
    fetchedAt: readOrNull(field(body, 'fetchedAt', 'body'), 'body.fetchedAt', (v, p) => dayjs(readInstant(v, p))),
    months: readEach(field(body, 'months', 'body'), 'body.months', readString),
    channels: readEach(field(body, 'channels', 'body'), 'body.channels', readChannelMonths),
    total: readMonthTotals(field(body, 'total', 'body'), 'body.total'),
  };
}

/** One finished stream, as `GET /api/streams` reports the recent ones. */
export interface RecentStream {
  videoId: string;
  title: string;
  actualStartTime: Dayjs;
  actualEndTime: Dayjs;
  durationSeconds: number | null;
  viewCount: number | null;
  chatMessageCount: number | null;
}

function readRecentStream(value: unknown, path: string): RecentStream {
  const count = (name: string) => readOrNull(field(value, name, path), `${path}.${name}`, readNumber);

  return {
    videoId: readString(field(value, 'videoId', path), `${path}.videoId`),
    title: readString(field(value, 'title', path), `${path}.title`),
    actualStartTime: dayjs(readInstant(field(value, 'actualStartTime', path), `${path}.actualStartTime`)),
    actualEndTime: dayjs(readInstant(field(value, 'actualEndTime', path), `${path}.actualEndTime`)),
    durationSeconds: count('durationSeconds'),
    viewCount: count('viewCount'),
    chatMessageCount: count('chatMessageCount'),
  };
}

export interface ChannelStreams {
  channelId: string;
  /**
   * Every finished stream as a `[week minute, minutes]` pair, flattened.
   *
   * Two numbers per stream rather than an object each, which is how the
   * endpoint sends it: this array carries thousands of streams and the pairs
   * are read by position, never by name.
   */
  spans: number[];
  /** The most recent streams, newest first. */
  recent: RecentStream[];
}

export interface StreamList {
  fetchedAt: Dayjs | null;
  channels: ChannelStreams[];
}

export function readStreamList(body: unknown): StreamList {
  return {
    fetchedAt: readOrNull(field(body, 'fetchedAt', 'body'), 'body.fetchedAt', (v, p) => dayjs(readInstant(v, p))),
    channels: readEach(field(body, 'channels', 'body'), 'body.channels', (value, path) => ({
      channelId: readString(field(value, 'channelId', path), `${path}.channelId`),
      spans: readEach(field(value, 'spans', path), `${path}.spans`, readNumber),
      recent: readEach(field(value, 'recent', path), `${path}.recent`, readRecentStream),
    })),
  };
}

/**
 * `GET /api/videos/table`'s body, one array per field rather than one object
 * per video.
 *
 * #144 chose this shape so #135 and #136 can sort, search and window the
 * whole archive in the browser: at 6,450 rows the columnar body is smaller
 * than the equivalent list, and every array here is the same length as every
 * other. `@/lib/ranking.ts` reads this into one `VideoTableRow` per video.
 */
export interface VideoTable {
  /** The newest fetch among the rows returned, or null when there are none. */
  fetchedAt: Dayjs | null;
  columns: {
    videoId: string[];
    channelId: string[];
    title: string[];
    type: (VideoType | null)[];
    publishedAt: string[];
    durationSeconds: (number | null)[];
    viewCount: (number | null)[];
    likeCount: (number | null)[];
    commentCount: (number | null)[];
    chatMessageCount: (number | null)[];
    chatUniqueUserCount: (number | null)[];
    actualStartTime: (string | null)[];
    actualEndTime: (string | null)[];
  };
}

type TableColumnName = keyof VideoTable['columns'];

export function readVideoTable(body: unknown): VideoTable {
  const columns = field(body, 'columns', 'body');
  const length = readArray(field(columns, 'videoId', 'body.columns'), 'body.columns.videoId').length;

  /**
   * One column, checked to have the same length as every other.
   *
   * A column short by one would otherwise misalign every field after it in
   * `@/lib/ranking.ts`'s `VideoTableRow`, and do so silently: JavaScript reads
   * past the end of a short array as `undefined`, not as a thrown error.
   */
  function column<T>(name: TableColumnName, read: (value: unknown, path: string) => T): T[] {
    const path = `body.columns.${name}`;
    const values = readEach(field(columns, name, 'body.columns'), path, read);

    if (values.length !== length) {
      throw new ShapeError(path, `an array of ${length}, the length of body.columns.videoId`, values);
    }

    return values;
  }

  const nullable =
    <T>(read: (value: unknown, path: string) => T) =>
    (value: unknown, path: string): T | null =>
      readOrNull(value, path, read);
  const type = (value: unknown, path: string): VideoType | null =>
    readOrNull(value, path, (v, p) => readOneOf(v, p, VIDEO_TYPES));

  return {
    fetchedAt: readOrNull(field(body, 'fetchedAt', 'body'), 'body.fetchedAt', (v, p) => dayjs(readInstant(v, p))),
    columns: {
      videoId: column('videoId', readString),
      channelId: column('channelId', readString),
      title: column('title', readString),
      type: column('type', type),
      publishedAt: column('publishedAt', (v, p) => readInstant(v, p)),
      durationSeconds: column('durationSeconds', nullable(readCount)),
      viewCount: column('viewCount', nullable(readCount)),
      likeCount: column('likeCount', nullable(readCount)),
      commentCount: column('commentCount', nullable(readCount)),
      chatMessageCount: column('chatMessageCount', nullable(readCount)),
      chatUniqueUserCount: column('chatUniqueUserCount', nullable(readCount)),
      actualStartTime: column('actualStartTime', nullable(readInstant)),
      actualEndTime: column('actualEndTime', nullable(readInstant)),
    },
  };
}

/**
 * The kinds a thing that happened can be, as the published JSON names them.
 *
 * The words a reader sees are not here: this file says what the API may send,
 * and how the page says it belongs with the page (#140).
 */
export const EVENT_KINDS = [
  'project',
  'reveal',
  'debut',
  '3d',
  'outfit',
  'live-event',
  'goods',
  'music',
  'collab',
  'media',
  'milestone',
  'graduation',
  'anniversary',
  'other',
] as const;

export type EventKind = (typeof EVENT_KINDS)[number];

/** How exactly a date is known: to the day, to the month, or to the year. */
export const DATE_PRECISIONS = ['day', 'month', 'year'] as const;

export type DatePrecision = (typeof DATE_PRECISIONS)[number];

/** One thing that happened, as `GET /api/footprints/events` publishes it. */
export interface FootprintEvent {
  eventId: number;
  datePrecision: DatePrecision;
  /** As much of `YYYY-MM-DD` as the precision says is known. */
  startDate: string;
  /** The instant it began, where the time of day is known. */
  startsAt: string | null;
  /** The last day of something that ran over several, or null. */
  endDate: string | null;
  kind: EventKind;
  /** Whether this is one of the days the page draws large (#140). */
  emphasized: boolean;
  title: string;
  place: string | null;
  supplement: string | null;
  /** The stream or video this is, where it is one. */
  videoId: string | null;
  /** True while no allowed source has confirmed it (#140). */
  sourcePending: boolean;
  /** Who it involved. An empty list means けもV as a whole, not nobody. */
  channelIds: string[];
  sources: { url: string; title: string | null }[];
}

export interface FootprintEvents {
  publishedAt: Dayjs | null;
  events: FootprintEvent[];
}

const DATE_SHAPES: Readonly<Record<DatePrecision, RegExp>> = {
  day: /^\d{4}-\d{2}-\d{2}$/,
  month: /^\d{4}-\d{2}$/,
  year: /^\d{4}$/,
};

function readFootprintEvent(value: unknown, path: string): FootprintEvent {
  const datePrecision = readOneOf(field(value, 'date_precision', path), `${path}.date_precision`, DATE_PRECISIONS);
  const startDate = readString(field(value, 'start_date', path), `${path}.start_date`);

  // Read to the precision the row claims and no further: a month with no day
  // is `2026-04`, and checking that against a full date would refuse a body
  // the API is entitled to send.
  if (!DATE_SHAPES[datePrecision].test(startDate)) {
    throw new ShapeError(`${path}.start_date`, `a date as exact as its ${datePrecision} precision`, startDate);
  }

  return {
    eventId: readNumber(field(value, 'event_id', path), `${path}.event_id`),
    datePrecision,
    startDate,
    startsAt: readOrNull(field(value, 'starts_at', path), `${path}.starts_at`, readInstant),
    endDate: readOrNull(field(value, 'end_date', path), `${path}.end_date`, readDate),
    kind: readOneOf(field(value, 'kind', path), `${path}.kind`, EVENT_KINDS),
    emphasized: readBoolean(field(value, 'emphasized', path), `${path}.emphasized`),
    title: readString(field(value, 'title', path), `${path}.title`),
    place: readOrNull(field(value, 'place', path), `${path}.place`, readString),
    supplement: readOrNull(field(value, 'supplement', path), `${path}.supplement`, readString),
    videoId: readOrNull(field(value, 'video_id', path), `${path}.video_id`, readString),
    sourcePending: readBoolean(field(value, 'source_pending', path), `${path}.source_pending`),
    channelIds: readEach(field(value, 'channel_ids', path), `${path}.channel_ids`, readString),
    sources: readEach(field(value, 'sources', path), `${path}.sources`, (source, at) => ({
      url: readString(field(source, 'url', at), `${at}.url`),
      title: readOrNull(field(source, 'title', at), `${at}.title`, readString),
    })),
  };
}

/**
 * `GET /api/footprints/events`'s body.
 *
 * Nothing has been published yet, so the endpoint answers 404 for now. That is
 * not a failure to report: it means there is nothing recorded, and the page
 * draws its timeline from the streams alone (#140).
 */
export function readFootprintEvents(body: unknown): FootprintEvents {
  return {
    publishedAt: readOrNull(field(body, 'published_at', 'body'), 'body.published_at', (v, p) =>
      dayjs(readInstant(v, p)),
    ),
    events: readEach(field(body, 'events', 'body'), 'body.events', readFootprintEvent),
  };
}
