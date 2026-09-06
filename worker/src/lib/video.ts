/**
 * The rules that decide what a video is, from what the YouTube Data API says
 * about it.
 *
 * Every function here is pure: no D1, no fetch, no clock of its own. That is
 * what lets #66 line these rules up against the ones they replace without
 * standing up a worker, and it is why the collector in ../collector/video.ts
 * holds no judgement of its own.
 *
 * The rules the old system got wrong are named in #63 and #64. Two shapes are
 * deliberately avoided here:
 *
 *   * Nothing looks at the value already stored. `getVideoType` in the old
 *     system returned early when a type was already set, so a video classified
 *     before its length was known kept that answer forever - 12 of 197 videos
 *     of 60 seconds or less were still not shorts. Every function here decides
 *     from the current response alone.
 *   * Nothing leaves a field untouched when the answer is "no longer there".
 *     The old collector skipped the live fields for a video it could not
 *     fetch, which left 15 deleted or private streams showing as live or
 *     upcoming forever.
 */

/** What the schema's `video.availability` column accepts. */
export type Availability = 'public' | 'membership' | 'private' | 'unavailable';

/** What the schema's `video.live_broadcast_content` column accepts. */
export type LiveBroadcastContent = 'none' | 'upcoming' | 'live';

/** What the schema's `video.type` column accepts. NULL there is null here. */
export type VideoType = 'video' | 'streaming' | 'shorts';

/** The `liveStreamingDetails` part, as far as these rules read it. */
export interface LiveStreamingDetails {
  scheduledStartTime?: string;
  actualStartTime?: string;
  actualEndTime?: string;
}

/**
 * A video of this length or less is a short.
 *
 * YouTube's own limit was 60 seconds when the 6,424 videos this replaces were
 * published, and the audit in #58 counted 197 videos at or under it. Raising
 * it to the 3 minutes YouTube now allows would reclassify videos that were
 * never shorts, so the number stays where the data is.
 */
export const SHORTS_MAX_SECONDS = 60;

/**
 * How far ahead a scheduled start has to be before it is a free chat
 * placeholder rather than an announced stream.
 *
 * Measured against the live feed the site publishes today
 * (`liveUri` in src/config.ts, read 2026-09-06T21:38:54Z): the two genuine
 * upcoming streams were 0.01 and 0.64 days out, and the one free chat
 * - 【フリーチャットスペース】～ご自由にどうぞの場所～ - was 725.62 days
 * out, scheduled for 2028-09-01. Three orders of magnitude separate them, so
 * the exact figure matters far less than being inside that gap.
 *
 * 30 days is chosen rather than something tighter because the cost is not
 * symmetric. Too low and an anniversary stream announced a month ahead stops
 * being the next stream until it comes closer; too high and a free chat still
 * has to reach two years before it slips through. A month is longer than any
 * announcement lead time in the data and shorter than any placeholder in it.
 */
export const FREE_CHAT_MIN_DAYS_AHEAD = 30;

const DURATION_PATTERN = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/;

/**
 * `contentDetails.duration` in seconds, or null when it is absent or is not a
 * shape this understands.
 *
 * Returns null rather than 0 for an unparseable value: 0 is a real duration
 * that the shorts rule would act on, and guessing it for a value nobody has
 * read is how a video ends up misclassified with no trace.
 */
export function parseDurationSeconds(duration: string | undefined): number | null {
  if (duration === undefined) return null;

  const match = DURATION_PATTERN.exec(duration);

  if (!match) return null;

  const [, days, hours, minutes, seconds] = match;

  return Number(days ?? 0) * 86400 + Number(hours ?? 0) * 3600 + Number(minutes ?? 0) * 60 + Number(seconds ?? 0);
}

/**
 * A count the API reports as a string, or null when it does not report one.
 *
 * Null covers both a hidden count and a value that is not a count at all. The
 * schema draws no distinction - it says a NULL is "not collected yet, or
 * hidden by the uploader" - and its CHECK refuses a negative, so a number that
 * would be refused becomes the absence it amounts to rather than a row the
 * database rejects.
 */
export function toCount(value: string | undefined): number | null {
  // Number('') is 0, and so is Number(' '). Reading either as a count would
  // put a figure nobody measured into a column whose NULL already says the
  // figure is missing.
  if (value === undefined || value.trim() === '') return null;

  const count = Number(value);

  return Number.isInteger(count) && count >= 0 ? count : null;
}

/**
 * Whether a video is finished, running or still to come.
 *
 * Read from `liveStreamingDetails` rather than from
 * `snippet.liveBroadcastContent`, because the timestamps say what has actually
 * happened while that field says what the API last decided. A stream that has
 * ended carries an actualEndTime the moment it ends, which is what #64's
 * ten-minute reflection of a stream ending rests on.
 *
 * `snippet.liveBroadcastContent` is still the answer for a video that has no
 * liveStreamingDetails at all, where it is 'none'.
 */
export function determineLiveBroadcastContent(details: LiveStreamingDetails | undefined): LiveBroadcastContent {
  if (details === undefined) return 'none';

  // Ended wins over started: a finished stream has both timestamps.
  if (details.actualEndTime !== undefined) return 'none';
  if (details.actualStartTime !== undefined) return 'live';
  if (details.scheduledStartTime !== undefined) return 'upcoming';

  // liveStreamingDetails with no timestamp at all says nothing happened.
  return 'none';
}

/**
 * Which of the three kinds a video is, or null while its length is unknown.
 *
 * The order of the tests is the whole content of this function, so it is
 * spelled out:
 *
 *   1. A stream that is running or still to come is `streaming` whatever its
 *      length says. `contentDetails.duration` is 'P0D' for a stream that has
 *      not finished, which parses to a real 0 seconds; without this test first
 *      every live stream would come out a short.
 *   2. Length unknown is null, not a guess.
 *   3. 60 seconds or less is `shorts`. #63 asks for this without exceptions,
 *      so a stream that ended inside a minute lands here too. That is the one
 *      case where this rule and "a stream is `streaming`" disagree, and #63's
 *      wording decides it. #66 sees both answers and can move it.
 *   4. Anything that was ever a stream is `streaming`.
 *   5. The rest are `video`.
 */
export function determineVideoType(
  durationSeconds: number | null,
  liveBroadcastContent: LiveBroadcastContent,
  details: LiveStreamingDetails | undefined,
): VideoType | null {
  if (liveBroadcastContent !== 'none') return 'streaming';
  if (durationSeconds === null) return null;
  if (durationSeconds <= SHORTS_MAX_SECONDS) return 'shorts';
  if (details !== undefined) return 'streaming';

  return 'video';
}

/** What the caller managed to learn about a video's availability. */
export interface AvailabilitySignals {
  /** Whether Videos.list returned the video at all. */
  returned: boolean;
  /** `status.privacyStatus`, when the video was returned. */
  privacyStatus?: string;
  /**
   * Whether the video is behind a channel membership.
   *
   * Data API v3 has no field for this: `status` carries uploadStatus,
   * privacyStatus, publishAt, license, embeddable, publicStatsViewable,
   * madeForKids, selfDeclaredMadeForKids and containsSyntheticMedia, and
   * privacyStatus is only ever 'private', 'public' or 'unlisted'. A
   * members-only video comes back looking public.
   *
   * So nothing in this repository sets this today, and `membership` is
   * unreachable from the API alone - which is the same reason the old system
   * reached it 0 times in 6,424 videos. It is a parameter rather than a
   * dropped branch because the value does exist outside the API: #67 migrates
   * rows the old scraper wrote with `requiresSubscription`, and #66 decides
   * whether that is the signal to carry forward.
   */
  membersOnly?: boolean;
}

/**
 * Which of the four availabilities a video has.
 *
 * A video Videos.list did not return is `unavailable` and not `private`. The
 * API omits deleted and private videos alike when they are asked for by id
 * with a public key, so absence on its own cannot tell them apart, and saying
 * `private` would be claiming to know which one it was.
 */
export function determineAvailability(signals: AvailabilitySignals): Availability {
  if (!signals.returned) return 'unavailable';
  if (signals.membersOnly === true) return 'membership';
  if (signals.privacyStatus === 'private') return 'private';

  // 'public' and 'unlisted' are both watchable by anyone holding the link,
  // which is the distinction this column draws. An unrecognised value is
  // treated the same way rather than failing the row: the schema has no
  // spelling for "the API said something new".
  return 'public';
}

/**
 * Whether a scheduled start is so far out that it is a free chat placeholder
 * rather than a stream anyone is waiting for.
 *
 * These are permanent rooms with a nominal date years away. The scraper this
 * replaces took the one it found as the channel's next stream and never let go
 * of it, so those channels have read "upcoming" continuously ever since.
 *
 * Only the schedule is read. Matching the title was the alternative and is
 * worse: it is written by hand, in Japanese, and differs per channel, so it
 * would miss the next one that is worded differently.
 *
 * **Nothing in this repository calls this yet, and that is deliberate.** A
 * free chat is a real upcoming stream and its row says so; what it must not be
 * is the stream `GET /api/live` names as a channel's next one. That endpoint
 * is #69's, and worker/src/api/ is #69's to write, so the rule lands here
 * where the collector already keeps its judgement and #69 imports it rather
 * than restating it. The tests are what make it safe to hand over that way.
 */
export function isFreeChatPlaceholder(scheduledStartTime: string | null, now: Date): boolean {
  if (scheduledStartTime === null) return false;

  const scheduled = new Date(scheduledStartTime);

  if (Number.isNaN(scheduled.getTime())) return false;

  return scheduled.getTime() - now.getTime() > FREE_CHAT_MIN_DAYS_AHEAD * 86400 * 1000;
}
