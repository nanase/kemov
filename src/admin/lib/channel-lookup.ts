import { AdminApiError } from './api';

/**
 * Checking a channel_id before a member is added (#276) - when to ask YouTube
 * about it, and what the screen says for each answer. The decision lives in
 * the 決まった形 comment on #277 (論点 5); the wording below is that table's,
 * and is kept apart from MembersPage.vue so it can be tested without the DOM.
 */

/** `GET /admin/api/channel-lookup/:channelId`'s 200 body (`worker/src/admin/channel-lookup.ts`). */
export interface ChannelLookupBody {
  channelId: string;
  title: string;
  /** The icon as a data: URL; null when the channel exists but its picture could not be fetched. */
  iconDataUrl: string | null;
}

/**
 * What one lookup came back with, and the id it was asked for. A lookup in
 * flight is `loading`; the other three are its answers.
 */
export type ChannelLookup =
  | { status: 'loading'; channelId: string }
  | { status: 'found'; channelId: string; title: string; iconDataUrl: string | null }
  | { status: 'notFound'; channelId: string }
  | { status: 'failed'; channelId: string };

/** The five states the table names, in the order it lists them. */
export type LookupView = 'waiting' | 'loading' | 'found' | 'notFound' | 'failed';

/** What a channel id looks like: `UC` and 22 characters of base64url. It only decides when to ask; the answer is YouTube's. */
const CHANNEL_ID_SHAPE = /^UC[\w-]{22}$/;

/** Whether `value` is the 24-character form YouTube is asked about. Anything shorter or longer is still being typed. */
export function isChannelIdShape(value: string): boolean {
  return CHANNEL_ID_SHAPE.test(value);
}

/**
 * Which of the five states to draw for what is typed in the box now.
 *
 * `lookup` only counts when it was asked for this very id, so an answer that
 * arrives after the box has changed - or a state left from an earlier id -
 * never draws over what is typed now. A well-formed id with no matching
 * lookup is `loading`: the question is about to go out, or already has.
 */
export function lookupView(channelId: string, lookup: ChannelLookup | null): LookupView {
  const id = channelId.trim();

  if (!isChannelIdShape(id)) return 'waiting';

  return lookup !== null && lookup.channelId === id ? lookup.status : 'loading';
}

/** The `code` the worker puts on its 404 for "YouTube has no such channel". It is the same string as `NOT_FOUND_CODE` in `worker/src/admin/channel-lookup.ts`. */
const NOT_FOUND_CODE = 'channel_not_found';

/**
 * What a failed call means. Only the worker's own "YouTube has no such
 * channel" answer is `notFound`, because that is what stops 一覧に追加. A 404
 * without the code - a route the worker lacks, a gateway in front of it -
 * says nothing about the id, and so is `failed` like every other failure.
 */
export function lookupFailure(error: unknown, channelId: string): ChannelLookup {
  const notFound =
    error instanceof AdminApiError &&
    error.status === 404 &&
    typeof error.body === 'object' &&
    error.body !== null &&
    'code' in error.body &&
    error.body.code === NOT_FOUND_CODE;

  return { status: notFound ? 'notFound' : 'failed', channelId };
}

export function lookupFound(body: ChannelLookupBody): ChannelLookup {
  return { status: 'found', channelId: body.channelId, title: body.title, iconDataUrl: body.iconDataUrl };
}

/** Whether 一覧に追加 is refused. Only a channel YouTube does not know: a failed check says nothing, so adding stays possible. */
export function blocksAdding(view: LookupView): boolean {
  return view === 'notFound';
}

/**
 * Hands out a number per request and says whether one is still the latest, so
 * a slow answer cannot overwrite a newer one. Starting nothing new (`cancel`)
 * also makes every request in flight stale.
 */
export function createRequestGate(): {
  start: () => number;
  cancel: () => void;
  isCurrent: (ticket: number) => boolean;
} {
  let latest = 0;

  return {
    start: () => ++latest,
    cancel: () => {
      latest += 1;
    },
    isCurrent: (ticket) => ticket === latest,
  };
}

export const LOOKUP_TEXT = {
  loading: 'チャンネルを確認中…',
  notFoundHeading: 'チャンネルが見つかりません',
  failedHeading: 'チャンネルの確認に失敗しました',
  retry: '再試行',
} as const;
