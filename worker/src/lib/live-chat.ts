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
 * The key every watch page hands out.
 *
 * Not a credential: it is the same string for every visitor, is served in the
 * HTML of any YouTube page, and identifies the web client rather than anyone
 * using it. It has been this value for years.
 */
const INNERTUBE_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';

/**
 * The web client version the requests claim to be.
 *
 * Pinned rather than read from a page, because the page is what #92 removed.
 * The endpoint is lenient about how old this is - a version twenty months out
 * of date was measured to work - but not about whether it is a real one: an
 * invented version is refused with HTTP 400. If that day comes, every video
 * fails at once with the message readReplayError builds, which names this
 * constant so the log says where to look.
 *
 * This is the only place it appears. Updating it is a one-line change here.
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

/* Protobuf, by hand. The continuation is a protobuf message in base64, and
 * writing the four field types it uses is smaller than a dependency. */

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
 * entirely. Field 48687757 has no name anybody has published; it is copied
 * because a continuation without it is refused.
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

/** The replay request for one continuation. */
export function replayRequest(continuation: string): Request {
  return new Request(`${REPLAY_URL}?key=${INNERTUBE_KEY}&prettyPrint=false`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      context: { client: { clientName: 'WEB', clientVersion: CLIENT_VERSION } },
      continuation,
    }),
  });
}

/**
 * What to say when the endpoint refuses a request.
 *
 * 400 gets its own sentence. It is what an invented client version earns, and
 * a pinned version is the one thing here that goes stale on its own - so if
 * every video starts failing at once, the log should say where to look rather
 * than leaving somebody to find out from production a second time (#92).
 */
export function readReplayError(status: number): string {
  return status === 400
    ? `the replay endpoint refused the request (400). The pinned client version ${CLIENT_VERSION} may no longer be accepted`
    : `the replay endpoint responded ${status}`;
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
