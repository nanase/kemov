import dayjs, { type Dayjs } from '@nanase/alnilam/dayjs';

import {
  field,
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
  thumbnailUrl: string | null;
  /** When this channel's numbers were read. Null when they never have been. */
  fetchedAt: Dayjs | null;
  /** Null is "the channel hides this count", never zero. */
  latest: Record<CountName, number | null>;
  perHour: Record<CountName, Delta>;
  perDay: Record<CountName, Delta>;
}

export function readChannel(value: unknown, path: string): Channel {
  const color = field(value, 'color', path);
  const latest = field(value, 'latest', path);

  readObject(latest, `${path}.latest`);

  return {
    channelId: readString(field(value, 'channelId', path), `${path}.channelId`),
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
    thumbnailUrl: readOrNull(field(value, 'thumbnailUrl', path), `${path}.thumbnailUrl`, readString),
    fetchedAt: readOrNull(field(value, 'fetchedAt', path), `${path}.fetchedAt`, (v, p) => dayjs(readInstant(v, p))),
    latest: Object.fromEntries(
      COUNT_NAMES.map((name) => [
        name,
        readOrNull(field(latest, name, `${path}.latest`), `${path}.latest.${name}`, readNumber),
      ]),
    ) as Record<CountName, number | null>,
    perHour: readDeltas(field(value, 'perHour', path), `${path}.perHour`),
    perDay: readDeltas(field(value, 'perDay', path), `${path}.perDay`),
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
