/**
 * Reading YouTube's live chat replay.
 *
 * This is not the Data API and does not go through lib/youtube.ts: it is the
 * internal endpoint the watch page itself calls, on a different host, with no
 * key of ours and no quota. What it returns has no specification, so
 * everything here is shaped by what the responses actually contain (#65) and
 * every field is treated as absent until proven otherwise.
 *
 * The watch page used to be read first, for the key and the first
 * continuation. It is not read any more: from a Cloudflare address it answers
 * `playabilityStatus: LOGIN_REQUIRED` for every video, which stopped the job
 * dead in production (#92). The continuation turns out to be constructible
 * from the two ids the `video` table already holds, so the page it came from
 * is no longer in the way.
 *
 * Nothing here touches D1 or the network. The collector does both; these
 * functions only turn ids into a request and text into numbers, which is the
 * part worth testing against a recorded shape.
 */

const REPLAY_URL = 'https://www.youtube.com/youtubei/v1/live_chat/get_live_chat_replay';

/**
 * The web client version the requests claim to be.
 *
 * Pinned rather than read from a page, because the page is what #92 removed.
 * The endpoint is lenient about how old this is - a version twenty months out
 * of date was measured to work - but not about whether it is one at all: an
 * invented version, and an empty one, are both answered 404. If that day
 * comes, every video fails at once with the message readReplayError builds,
 * which names this constant so the log says where to look.
 *
 * It is the only part of the request the endpoint insists on. The key that
 * used to sit beside it is gone: see replayRequest.
 *
 * This is the only place the version appears. Updating it is a one-line
 * change here.
 */
const CLIENT_VERSION = '2.20260904.01.00';

/** One page of replay, reduced to the three things the count needs. */
export interface ReplayPage {
  /**
   * The author of every item on this page, duplicates included. Deduplication
   * belongs to `chat_author`, whose primary key does it across pages too.
   */
  authorIds: readonly string[];
  /** How many items this page held. Equal to authorIds.length, by definition. */
  messageCount: number;
  /** Where the next page starts, or null when this was the last one. */
  continuation: string | null;
}

interface LiveChatItem {
  /**
   * Present on anything a viewer posted and absent on anything YouTube
   * posted, which is what "message" is defined as here - see runChatReplay.
   */
  authorExternalChannelId?: string;
}

interface ReplayResponse {
  continuationContents?: {
    liveChatContinuation?: {
      actions?: {
        replayChatItemAction?: {
          actions?: { addChatItemAction?: { item?: Record<string, LiveChatItem> } }[];
        };
      }[];
      continuations?: { liveChatReplayContinuationData?: { continuation?: string } }[];
    };
  };
}

/* Protobuf, by hand.
 *
 * These are general enough to belong somewhere general, and they are here
 * anyway: a continuation is the only protobuf this worker will ever write, and
 * moving five one-line helpers into a lib of their own would make a module
 * with one caller. They stay private, so a second caller is what would move
 * them.
 *
 * Only the two wire types a continuation uses are written - varint and
 * length-delimited - which is why this is smaller than a dependency. */

function varint(value: number): number[] {
  const out: number[] = [];
  let rest = value;

  do {
    const byte = rest % 128;

    rest = Math.floor(rest / 128);
    out.push(rest > 0 ? byte | 0x80 : byte);
  } while (rest > 0);

  return out;
}

const tag = (field: number, wire: number): number[] => varint(field * 8 + wire);
const lengthDelimited = (field: number, payload: number[]): number[] => [
  ...tag(field, 2),
  ...varint(payload.length),
  ...payload,
];
const text = (field: number, value: string): number[] => lengthDelimited(field, [...new TextEncoder().encode(value)]);
const varintField = (field: number, value: number): number[] => [...tag(field, 0), ...varint(value)];

function base64(bytes: number[]): string {
  return btoa(String.fromCharCode(...bytes));
}

/**
 * Where a video's chat replay starts, built rather than scraped.
 *
 * A continuation YouTube hands out was taken apart to get this shape: it
 * carries the channel id, the video id and a handful of constants, and
 * nothing else - no signature, no timestamp, no nonce. So one can be written
 * from the two ids, which is what lets the collector skip the watch page
 * entirely.
 *
 * The two large field numbers, 156074452 outside and 48687757 inside, are
 * copied rather than understood. YouTube publishes no schema, and a
 * continuation missing either of them is refused. Nothing here can explain
 * what they mean; the test that compares the whole string against one YouTube
 * itself handed out is what says they are still right.
 *
 * The inner message is base64 and then URL-escaped before going into the
 * outer one, which is how YouTube's own continuations carry it: the padding
 * arrives as %3D rather than =. A continuation built without that escaping is
 * refused, which was measured.
 */
export function chatContinuation(channelId: string, videoId: string): string {
  const inner = [
    ...lengthDelimited(1, lengthDelimited(5, [...text(1, channelId), ...text(2, videoId)])),
    ...lengthDelimited(3, lengthDelimited(48687757, text(1, videoId))),
    ...varintField(4, 1),
    ...varintField(6, 0),
  ];

  const outer = lengthDelimited(156074452, [
    ...text(3, encodeURIComponent(base64(inner))),
    ...varintField(8, 1),
    ...lengthDelimited(14, [
      ...varintField(1, 4),
      ...varintField(3, 2),
      ...varintField(4, 0),
      ...varintField(5, 0),
      ...varintField(6, 0),
      ...varintField(7, 0),
    ]),
    ...varintField(15, 1),
  ]);

  return base64(outer).replace(/\+/g, '-').replace(/\//g, '_');
}

/**
 * The replay request for one continuation.
 *
 * No `key` parameter, which is not an oversight. This endpoint does not check
 * one: a correct key, a wrong key, an empty key and no key parameter at all
 * were each measured to be answered identically, down to the same page of the
 * same replay. The client version in the same request is checked, and an empty
 * one is refused, so the two are not alike and should not be reasoned about
 * together. lib/youtube.ts sends a key because the Data API does want one.
 *
 * A key did sit here until GitHub reported it as a leaked credential (#92).
 * It was not one, but nothing reading a repository can tell a value in that
 * shape from a key that is real, and treating a report as noise is how the
 * next one gets treated too. Sending nothing settles that better than keeping
 * a secret nobody needs: there is no value to register, to rotate, or to
 * explain.
 *
 * The signal is handed in for the same reason the key used to be: how long to
 * wait is the collector's decision, not this file's. It goes inside the
 * Request rather than beside it at the call, because fetch ignores a signal
 * passed alongside a Request it has already been given - silently, with the
 * right types and no error. #68 measured that.
 */
export function replayRequest(continuation: string, signal?: AbortSignal): Request {
  return new Request(`${REPLAY_URL}?prettyPrint=false`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      context: { client: { clientName: 'WEB', clientVersion: CLIENT_VERSION } },
      continuation,
    }),
    signal,
  });
}

/**
 * What to say when the endpoint refuses a request.
 *
 * Two refusals get a sentence of their own, because each names one half of the
 * request and they are not the same half. A client version the endpoint will
 * not take, and an empty one, were both measured to be answered 404; a
 * continuation it will not take, and an empty one, 400.
 *
 * 404 is the one worth a warning. The version is pinned, so it is the only
 * part of this that goes stale while nobody is touching it, and the day it
 * does, every video fails at once. A job failing that way is one nobody
 * notices until somebody reads a log, which is what #92 cost; the log had
 * better say where to look.
 *
 * This pair was written the wrong way round at first. A 400 seen while the
 * continuation was still being built wrong was read as the version being
 * refused, and the message named the version. The two failures look alike
 * from the outside - every video, all at once, a status and nothing else - so
 * a message that guesses between them is worse than one that says only the
 * status. Each is named by what it actually is.
 *
 * The 404 keeps the version in it and no longer blames it. It said the
 * version "may no longer be accepted", and #100 measured a 404 that was a
 * video which had been taken down while every other video went on working.
 * A reader of that line went to edit a constant that was not the problem. It
 * now names both causes and how to tell them apart, which is the count: the
 * version failing takes every video with it, a missing video takes only its
 * own.
 *
 * A function rather than a message written where it is thrown, which is how
 * the rest of the worker does it, because the 404 has to name CLIENT_VERSION
 * and that constant does not leave this file. The wording is the alarm, so it
 * is worth a test of its own.
 */
export function readReplayError(status: number): string {
  if (status === 404) {
    return (
      `the replay endpoint answered 404. Either this video is gone, or the pinned client version ` +
      `${CLIENT_VERSION} is no longer accepted. The second fails every video at once; the first only this one`
    );
  }

  if (status === 400) {
    return 'the replay endpoint refused the continuation (400)';
  }

  return `the replay endpoint responded ${status}`;
}

/**
 * One replay response, reduced to authors and a next continuation.
 *
 * An item counts when it carries an author. Listing the renderer types
 * instead would undercount in silence: seven were measured across a handful
 * of streams - text, super chat, super sticker, membership, two kinds of gift
 * announcement, and YouTube's own welcome message - and only the last of
 * those has no author. A renderer type that appears next year is counted by
 * this rule without anybody editing a list, and the same rule gives
 * chat_message_count and chat_unique_user_count one population, so the two
 * numbers cannot be read as measuring different things.
 *
 * Returns null when the response carries no liveChatContinuation at all.
 * That is not the end of a replay - a replay that has run out keeps the
 * envelope and drops only its continuation - it is a video that has no replay
 * to read. The caller decides which that means: on the first page it is a
 * confirmed absence, and after pages have already landed it is a broken
 * answer.
 */
export function parseReplayPage(body: unknown): ReplayPage | null {
  const chat = (body as ReplayResponse)?.continuationContents?.liveChatContinuation;

  if (!chat) {
    return null;
  }

  const authorIds: string[] = [];

  for (const action of chat.actions ?? []) {
    for (const replayed of action.replayChatItemAction?.actions ?? []) {
      const item = replayed.addChatItemAction?.item;

      if (!item) {
        continue;
      }

      // One renderer per item, under a key naming its type. Which type it is
      // does not matter here; whether it has an author does.
      for (const renderer of Object.values(item)) {
        if (renderer?.authorExternalChannelId) {
          authorIds.push(renderer.authorExternalChannelId);
        }
      }
    }
  }

  // The last page carries no replay continuation, only the player's seek one.
  const continuation = chat.continuations?.find((entry) => entry.liveChatReplayContinuationData)
    ?.liveChatReplayContinuationData?.continuation;

  return { authorIds, messageCount: authorIds.length, continuation: continuation ?? null };
}
