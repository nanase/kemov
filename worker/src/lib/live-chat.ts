/**
 * Reading YouTube's live chat replay.
 *
 * This is not the Data API and does not go through lib/youtube.ts: it is the
 * internal endpoint the watch page itself calls, on a different host, with no
 * key of ours and no quota. What it returns has no specification, so
 * everything here is shaped by what the responses actually contain (#65) and
 * every field is treated as absent until proven otherwise.
 *
 * Nothing in this file touches D1 or the network. The collector does both;
 * these functions only turn text into numbers, which is the part worth
 * testing against a recorded shape.
 */

const WATCH_URL = 'https://www.youtube.com/watch';
const REPLAY_URL = 'https://www.youtube.com/youtubei/v1/live_chat/get_live_chat_replay';

/** The three values the watch page carries that the replay call needs. */
export interface ChatSession {
  apiKey: string;
  clientVersion: string;
  continuation: string;
}

/**
 * What a watch page says about its chat replay.
 *
 * The three cases are kept apart because they settle a task differently: only
 * `absent` is a confirmed absence, and only a confirmed absence may end a task
 * as 'unavailable'. See runChatReplay.
 */
export type WatchPage =
  | ({ kind: 'replay' } & ChatSession)
  /** The video plays, and has no chat replay to read. */
  | { kind: 'absent' }
  /** The page did not yield what a replay needs; `why` says what was missing. */
  | { kind: 'unusable'; why: string };

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

/** The watch page URL for one video. */
export function watchUrl(videoId: string): string {
  return `${WATCH_URL}?v=${encodeURIComponent(videoId)}`;
}

/**
 * The replay request for one continuation.
 *
 * clientVersion is echoed back from the watch page rather than pinned here.
 * It changes every few days, and a stale one is the kind of thing that starts
 * being refused without warning.
 */
export function replayRequest(session: ChatSession): Request {
  return new Request(`${REPLAY_URL}?key=${encodeURIComponent(session.apiKey)}&prettyPrint=false`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      context: { client: { clientName: 'WEB', clientVersion: session.clientVersion } },
      continuation: session.continuation,
    }),
  });
}

/**
 * What one watch page offers.
 *
 * The order of the checks is the point. A video that does not play tells us
 * nothing about whether it had a chat, so playability is settled first; only a
 * page that plays and still has no chat is a confirmed absence.
 *
 * `conversationBar` is the panel the chat lives in. A regular upload has no
 * such key at all, and neither does a stream whose chat was disabled - both
 * were measured. It is checked before the continuation so that a page missing
 * the panel is reported as an absent chat rather than as an unreadable page.
 */
export function parseWatchPage(html: string): WatchPage {
  const playability = /"playabilityStatus":\{"status":"([A-Z_]+)"/.exec(html)?.[1];

  if (playability !== 'OK') {
    // Deleted, private, members-only, geo-blocked and a transient error all
    // arrive as one of these, and nothing here can tell them apart. Retrying
    // costs one page fetch; giving up on a video that came back would repeat
    // the mistake this whole job exists to undo.
    return { kind: 'unusable', why: `playabilityStatus is ${playability ?? 'missing'}` };
  }

  if (!html.includes('"conversationBar"')) {
    return { kind: 'absent' };
  }

  const apiKey = /"INNERTUBE_API_KEY":"([^"]+)"/.exec(html)?.[1];
  const clientVersion = /"INNERTUBE_CLIENT_VERSION":"([^"]+)"/.exec(html)?.[1];
  // Scoped by its own key rather than by position: the page holds one other
  // kind of continuation (the player's seek), which uses a different key.
  const continuation = /"reloadContinuationData":\{"continuation":"([^"]+)"/.exec(html)?.[1];

  if (!apiKey || !clientVersion || !continuation) {
    // The panel is there, so a chat exists, but the page has changed shape
    // enough that we cannot open it. That is a reason to look again later,
    // not to record the chat as absent.
    const missing = [
      apiKey ? null : 'INNERTUBE_API_KEY',
      clientVersion ? null : 'INNERTUBE_CLIENT_VERSION',
      continuation ? null : 'the chat continuation',
    ].filter((name) => name !== null);

    return { kind: 'unusable', why: `the watch page has a chat panel but no ${missing.join(', no ')}` };
  }

  return { kind: 'replay', apiKey, clientVersion, continuation };
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
 * Returns null when the response is not a replay page at all, which is a
 * failure rather than an end: a replay that has run out says so by dropping
 * its continuation, not by dropping its envelope.
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
