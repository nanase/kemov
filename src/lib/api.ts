import axios from '@/lib/axios';
import { apiBase } from '@/config';
import { ShapeError } from '@/lib/read';
import {
  readChannelList,
  readLiveList,
  readVideoPage,
  type ChannelList,
  type LiveList,
  type Video,
  type VideoPage,
} from '@/type/api';

/**
 * Talking to the API this site now reads from.
 *
 * One place, so that every call answers the same three questions: did it
 * arrive, was it the shape this code reads, and how old is it. The site being
 * replaced answered none of them - it fetched two static files, waited for
 * both, and put whatever came back on screen.
 */

/** Where an answer came from, as the API reports it. */
export type CacheState = 'fresh' | 'miss' | 'stale' | 'none' | 'unknown';

export interface Freshness {
  state: CacheState;
  /** How old the body is, in seconds. Zero when it was built for this request. */
  staleSeconds: number;
}

export interface ApiResult<T> {
  data: T;
  freshness: Freshness;
}

/** The request did not arrive, or did not answer with success. */
export class ApiError extends Error {
  constructor(
    readonly path: string,
    readonly status: number | null,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** It answered, and the body was not what this code reads. */
export class ApiShapeError extends ApiError {
  constructor(
    path: string,
    readonly shape: ShapeError,
  ) {
    super(path, 200, `${path}: ${shape.message}`);
    this.name = 'ApiShapeError';
  }
}

const CACHE_STATES: readonly CacheState[] = ['fresh', 'miss', 'stale', 'none'];

/**
 * What the response says about its own age.
 *
 * 'unknown' when the headers are not there. They are set on every answer the
 * API gives, including its errors, so their absence means something else
 * answered - a proxy, an offline page, a captive portal - and that is worth
 * being able to say rather than reporting a confident 'fresh'.
 */
function readFreshness(headers: unknown): Freshness {
  const read = (name: string): string | null => {
    const value = (headers as Record<string, unknown> | null | undefined)?.[name];

    return typeof value === 'string' ? value : null;
  };

  const state = read('x-kemov-cache');
  const seconds = Number(read('x-kemov-stale-seconds'));

  return {
    state: CACHE_STATES.includes(state as CacheState) ? (state as CacheState) : 'unknown',
    staleSeconds: Number.isFinite(seconds) ? seconds : 0,
  };
}

/**
 * One GET, checked on the way back.
 *
 * `read` is handed the parsed body and either returns the shape this code uses
 * or throws. Nothing else in the site is allowed to assume a response's shape,
 * which is the whole point: `axios.get<T>()` promises the compiler a T and
 * asks the response nothing.
 */
async function get<T>(path: string, read: (body: unknown) => T): Promise<ApiResult<T>> {
  let response;

  try {
    response = await axios.get<unknown>(`${apiBase}${path}`);
  } catch (error) {
    const status =
      typeof error === 'object' && error !== null && 'response' in error
        ? ((error as { response?: { status?: number } }).response?.status ?? null)
        : null;

    throw new ApiError(path, status, `${path} could not be read: ${String(error)}`);
  }

  try {
    return { data: read(response.data), freshness: readFreshness(response.headers) };
  } catch (error) {
    if (error instanceof ShapeError) throw new ApiShapeError(path, error);

    throw error;
  }
}

/** Every channel with its newest reading and its changes. */
export function getChannels(): Promise<ApiResult<ChannelList>> {
  return get('/channels', readChannelList);
}

/** What is on air and what is announced. */
export function getLive(): Promise<ApiResult<LiveList>> {
  return get('/live', readLiveList);
}

/**
 * How many pages one channel's archive may take before this gives up.
 *
 * The largest channel holds 1,204 videos, which is seven pages of 200. The
 * ceiling is well above that and exists only so that a cursor that never
 * returns null cannot spin here forever.
 */
export const MAX_VIDEO_PAGES = 20;

/** One channel's archive, and whether all of it arrived. */
export interface VideoArchive {
  videos: Video[];
  /**
   * True when every page arrived.
   *
   * The whole archive is read because the detail page adds up view counts and
   * comment counts across it. A page that failed silently would take those
   * totals down with it and show a smaller number, which reads as a fact
   * rather than as a failure - the same shape as the -1 the old system wrote
   * for two years without anyone noticing.
   */
  complete: boolean;
  /** The failure that stopped it, when one did. */
  error?: ApiError;
  freshness: Freshness;
}

/**
 * One channel's videos, paging until there are no more.
 *
 * Keyset paging, so the collector writing to the table while this runs cannot
 * make a page skip or repeat rows. What arrived before a failure is kept and
 * returned with `complete: false`, because a partial archive is worth showing
 * as long as it is labelled as one.
 */
export async function getAllVideos(channelId: string, limit = 200): Promise<VideoArchive> {
  const videos: Video[] = [];
  let cursor: string | null = null;
  let freshness: Freshness = { state: 'unknown', staleSeconds: 0 };

  for (let page = 0; page < MAX_VIDEO_PAGES; page++) {
    const query = `?limit=${limit}${cursor === null ? '' : `&cursor=${encodeURIComponent(cursor)}`}`;

    let result: ApiResult<VideoPage>;

    try {
      result = await get(`/channels/${encodeURIComponent(channelId)}/videos${query}`, readVideoPage);
    } catch (error) {
      if (error instanceof ApiError) return { videos, complete: false, error, freshness };

      throw error;
    }

    videos.push(...result.data.videos);
    // The oldest page's freshness, which is the age of the whole set: the
    // archive is only as current as the last request that built it.
    freshness = result.freshness;
    cursor = result.data.nextCursor;

    if (cursor === null) return { videos, complete: true, freshness };
  }

  return {
    videos,
    complete: false,
    error: new ApiError(
      `/channels/${channelId}/videos`,
      null,
      `stopped after ${MAX_VIDEO_PAGES} pages without reaching the end of the archive`,
    ),
    freshness,
  };
}
