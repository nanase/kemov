import { byteLength } from '../lib/backup';
import type { Env } from '../lib/env';
import { errorResponse, jsonResponse } from '../lib/json';

/**
 * Reading `video` for the 配信・動画 screen to pick one from (#144's data
 * screens task, added on top of task 9's handoff after review found no read
 * 口 for the mock's own "choose from every collected video" list). Read-only:
 * nothing here logs a `revision`. Saving and deleting an override is still
 * video-overrides.ts's own job - this file only lets the screen find a video
 * to override in the first place.
 */

// D1 refuses a query bound with more than 100 parameters
// (developers.cloudflare.com/d1/platform/limits/) - the IN (...) this file's
// own overriddenVideoIds builds names one placeholder per video_id, so the
// page size itself has to stay under that limit rather than only being
// capped for its own sake.
const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 50;

// Same limit and reasoning as footprints.ts's own D1_LIKE_PATTERN_BYTE_LIMIT:
// D1's LIKE/GLOB pattern length limit is 50 bytes of UTF-8, checked against
// the escaped, `%`-wrapped pattern this function actually sends.
const D1_LIKE_PATTERN_BYTE_LIMIT = 50;

interface VideoRow {
  video_id: string;
  channel_id: string;
  title: string;
  published_at: string;
  type: string | null;
  availability: string;
}

/** Every id in `videoIds` that `video_override` has a row for. */
async function overriddenVideoIds(env: Env, videoIds: readonly string[]): Promise<Set<string>> {
  const ids = [...new Set(videoIds)];

  if (ids.length === 0) return new Set();

  const { results } = await env.DB.prepare(
    `SELECT video_id FROM video_override WHERE video_id IN (${ids.map((_, index) => `?${index + 1}`).join(', ')})`,
  )
    .bind(...ids)
    .all<{ video_id: string }>();

  return new Set(results.map((row) => row.video_id));
}

/**
 * GET /admin/api/videos - `q` (a substring of `title`), `channelId` and
 * `limit` (default 50, refused above 100), all optional.
 */
export async function listVideos(
  env: Env,
  q: string | null,
  channelId: string | null,
  limitParam: string | null,
): Promise<Response> {
  if (channelId !== null) {
    const known = await env.DB.prepare('SELECT 1 FROM channel WHERE channel_id = ?1').bind(channelId).first();

    if (known === null) return errorResponse(400, `unknown channelId: ${channelId}`);
  }

  let limit = DEFAULT_LIMIT;

  if (limitParam !== null) {
    const parsed = Number(limitParam);

    if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > MAX_LIMIT) {
      return errorResponse(400, `limit must be an integer from 1 to ${MAX_LIMIT}`);
    }

    limit = parsed;
  }

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (channelId !== null) {
    params.push(channelId);
    conditions.push(`channel_id = ?${params.length}`);
  }

  if (q !== null) {
    const pattern = `%${q.replace(/[\\%_]/g, '\\$&')}%`;

    if (byteLength(pattern) > D1_LIKE_PATTERN_BYTE_LIMIT) return errorResponse(400, 'q is too long to search by');

    params.push(pattern);
    conditions.push(`title LIKE ?${params.length} ESCAPE '\\'`);
  }

  const where = conditions.length === 0 ? '' : `WHERE ${conditions.join(' AND ')}`;

  params.push(limit);

  const { results } = await env.DB.prepare(
    `SELECT video_id, channel_id, title, published_at, type, availability
       FROM video ${where}
      ORDER BY published_at DESC
      LIMIT ?${params.length}`,
  )
    .bind(...params)
    .all<VideoRow>();

  const overridden = await overriddenVideoIds(
    env,
    results.map((row) => row.video_id),
  );

  return jsonResponse({
    videos: results.map((row) => ({
      videoId: row.video_id,
      channelId: row.channel_id,
      title: row.title,
      publishedAt: row.published_at,
      type: row.type,
      availability: row.availability,
      hasOverride: overridden.has(row.video_id),
    })),
  });
}
