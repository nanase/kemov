import type { Env } from '../lib/env';
import { formatTimestamp, toSchemaTimestamp } from '../lib/time';
import {
  determineAvailability,
  determineLiveBroadcastContent,
  determineVideoType,
  needsShortsProbe,
  parseDurationSeconds,
  readShortsProbe,
  toCount,
  type LiveStreamingDetails,
} from '../lib/video';
import { callYouTubeApi, chunkIds, uploadsPlaylistId, YOUTUBE_MAX_RESULTS } from '../lib/youtube';

/**
 * The two video jobs (#63, #64). They live in one file because they are one
 * pipeline read from two ends: discover finds ids a channel has published and
 * update revisits ids already stored, and both then take the same
 * Videos.list call and write the same row through the same function.
 *
 * No judgement is made here. What a video is - its kind, its live state, its
 * availability - is decided by the pure rules in ../lib/video.ts, so that #66
 * can compare those rules with the ones they replace without a worker.
 */

interface PlaylistItemsResponse {
  items?: { contentDetails?: { videoId?: string } }[];
  nextPageToken?: string;
}

interface VideosListItem {
  id: string;
  snippet?: {
    channelId?: string;
    title?: string;
    publishedAt?: string;
  };
  contentDetails?: { duration?: string };
  status?: { privacyStatus?: string };
  statistics?: {
    viewCount?: string;
    likeCount?: string;
    commentCount?: string;
  };
  liveStreamingDetails?: LiveStreamingDetails;
}

interface VideosListResponse {
  items?: VideosListItem[];
}

/**
 * How many stored videos one update tick refreshes: one Videos.list call.
 *
 * The quota in #58 leaves Videos.list 288 units a day against 144 ticks, which
 * is two calls a tick for both jobs together - one for the ids discover just
 * found, one for this.
 */
const UPDATE_BATCH = YOUTUBE_MAX_RESULTS;

/**
 * The most of one update tick that live and upcoming streams may take.
 *
 * They are refetched every tick because #64 asks for a stream starting or
 * ending to show within ten minutes, and they are few - the schema indexes
 * them separately for that reason. The cap is what stops them from being able
 * to fill a tick: whatever they leave, the sweep below gets, so the sweep
 * cannot be starved into never reaching the oldest rows.
 */
const LIVE_PRIORITY_MAX = 20;

/**
 * Minutes before a failed target is offered again. Matches the ten-minute
 * cron this job runs on, because the next tick will try it anyway.
 */
const RETRY_AFTER_MINUTES = 10;

type TaskKind = 'video_discover' | 'video_update';
type TaskState = 'failed' | 'unavailable';

function nextAttemptAfter(fetchedAt: string): string {
  const next = new Date(fetchedAt);

  next.setUTCMinutes(next.getUTCMinutes() + RETRY_AFTER_MINUTES);

  return formatTimestamp(next);
}

/**
 * Records that one target did not come out of this tick with a fresh row.
 *
 * Every way a video can end a tick without one goes through here, so the
 * invariant is checkable rather than hoped for: a video whose `fetched_at` did
 * not move has a `collect_task` row saying why. The ways are more numerous
 * than they first look - the whole call failing, the video not being in the
 * response, and the D1 write for that one video failing - and the third is the
 * one that is easy to leave out.
 *
 * 'failed' keeps the target in the queue with its deadline pushed out.
 * 'unavailable' is settled: the API answered, and the answer was that this
 * video is not there. Only a response that named the other videos justifies
 * it, which is why a failed call never sets it.
 */
function missedStatement(
  db: D1Database,
  kind: TaskKind,
  targetId: string,
  state: TaskState,
  at: string,
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO collect_task (kind, target_id, state, attempts, next_attempt_at, updated_at)
       VALUES (?1, ?2, ?3, 1, ?4, ?5)
       ON CONFLICT (kind, target_id) DO UPDATE SET
         state = excluded.state,
         attempts = attempts + 1,
         next_attempt_at = excluded.next_attempt_at,
         updated_at = excluded.updated_at`,
    )
    .bind(kind, targetId, state, state === 'unavailable' ? null : nextAttemptAfter(at), at);
}

async function recordTask(
  db: D1Database,
  kind: TaskKind,
  targetId: string,
  state: TaskState,
  at: string,
): Promise<void> {
  await missedStatement(db, kind, targetId, state, at).run();
}

/**
 * Settles a target's task row once it has been collected.
 *
 * The reason this job always had one is 'unavailable', which is a verdict
 * rather than a complaint: a video that came back after being absent has to
 * stop saying it is absent, or the column stops meaning "this video is not
 * there" and starts meaning "was not there once". #90 found the same is true
 * of 'failed' and gave #62 one of these too, so the argument now covers every
 * row this table holds.
 */
function collectedStatement(db: D1Database, kind: TaskKind, targetId: string, at: string): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO collect_task (kind, target_id, state, attempts, next_attempt_at, updated_at)
       VALUES (?1, ?2, 'done', 0, NULL, ?3)
       ON CONFLICT (kind, target_id) DO UPDATE SET
         state = 'done',
         attempts = 0,
         next_attempt_at = NULL,
         updated_at = excluded.updated_at`,
    )
    .bind(kind, targetId, at);
}

/**
 * Writes one video the API returned.
 *
 * Every column is written on every pass, including the ones that were already
 * right. That is the point: the old collector left fields alone when it had
 * nothing new to say, which is how a stream that ended stayed 'live'. The two
 * chat columns are the only ones left out, because #65 owns them and this job
 * knows nothing about them.
 */
function videoStatement(
  db: D1Database,
  item: VideosListItem,
  fetchedAt: string,
  isShort: boolean | null,
): D1PreparedStatement {
  const channelId = item.snippet?.channelId;
  const title = item.snippet?.title;
  const publishedAt = toSchemaTimestamp(item.snippet?.publishedAt);

  if (channelId === undefined || title === undefined || publishedAt === null) {
    // The three NOT NULL columns the API supplies. Without them there is no
    // row to write, so this is a miss like any other rather than a partial
    // write that would leave the schema deciding.
    throw new Error(`video ${item.id} is missing channelId, title or publishedAt`);
  }

  const details = item.liveStreamingDetails;
  const liveBroadcastContent = determineLiveBroadcastContent(details);
  const durationSeconds = parseDurationSeconds(item.contentDetails?.duration);

  return db
    .prepare(
      `INSERT INTO video (
         video_id, channel_id, title, published_at, availability, live_broadcast_content,
         type, duration_seconds, view_count, like_count, comment_count,
         scheduled_start_time, actual_start_time, actual_end_time, fetched_at
       )
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)
       ON CONFLICT (video_id) DO UPDATE SET
         channel_id = excluded.channel_id,
         title = excluded.title,
         published_at = excluded.published_at,
         availability = excluded.availability,
         live_broadcast_content = excluded.live_broadcast_content,
         type = excluded.type,
         duration_seconds = excluded.duration_seconds,
         view_count = excluded.view_count,
         like_count = excluded.like_count,
         comment_count = excluded.comment_count,
         scheduled_start_time = excluded.scheduled_start_time,
         actual_start_time = excluded.actual_start_time,
         actual_end_time = excluded.actual_end_time,
         fetched_at = excluded.fetched_at`,
    )
    .bind(
      item.id,
      channelId,
      title,
      publishedAt,
      determineAvailability({ returned: true, privacyStatus: item.status?.privacyStatus }),
      liveBroadcastContent,
      determineVideoType(durationSeconds, liveBroadcastContent, details, isShort),
      // A stream that has not finished reports 'P0D', a real 0 that would
      // claim the stream was instantaneous. The kind rule already ignores it;
      // the column stores nothing rather than a zero nobody measured.
      liveBroadcastContent === 'none' ? durationSeconds : null,
      toCount(item.statistics?.viewCount),
      toCount(item.statistics?.likeCount),
      toCount(item.statistics?.commentCount),
      toSchemaTimestamp(details?.scheduledStartTime),
      toSchemaTimestamp(details?.actualStartTime),
      toSchemaTimestamp(details?.actualEndTime),
      fetchedAt,
    );
}

/**
 * Writes a video the API did not return.
 *
 * This is the fix for the worst of what #63 lists: 15 of 16 deleted or private
 * videos were still showing as live or upcoming because the old collector had
 * nothing to write and so wrote nothing. A video that cannot be fetched is not
 * live, whatever it was last time, so the live state is cleared here and not
 * merely left behind.
 *
 * Only a row that already exists is touched. A video that was never stored and
 * cannot be fetched has nothing to say and gets a task row instead.
 */
function unavailableStatement(db: D1Database, videoId: string, fetchedAt: string): D1PreparedStatement {
  return db
    .prepare(
      `UPDATE video
          SET availability = 'unavailable',
              live_broadcast_content = 'none',
              fetched_at = ?2
        WHERE video_id = ?1`,
    )
    .bind(videoId, fetchedAt);
}

/**
 * Where YouTube serves a short, and redirects everything else away.
 *
 * The one thing Data API v3 will not say is whether a video is a short, so
 * this is asked of the watch path instead. #66 measured what the answer is
 * worth: across 22 videos the page agreed with the system being replaced
 * every time, while deciding it from the duration alone was wrong for 17 of
 * the archive's rows.
 */
const SHORTS_URL_BASE = 'https://www.youtube.com/shorts/';

/**
 * Asks YouTube which of these videos are shorts.
 *
 * Only the ones whose answer is not already settled are asked - a stream is
 * never a short and neither is anything over the length limit - which is
 * about two videos in a batch of fifty, so this adds roughly 250 requests a
 * day beside the 2,000 units the jobs already spend.
 *
 * `redirect: 'manual'` because the redirect is the answer. Followed, a
 * non-short would arrive as the 200 of its own watch page and read as a
 * short, which is the one mistake this call exists to avoid.
 *
 * A video whose probe fails is absent from the map rather than false in it.
 * The caller passes that through as null, and null keeps the kind unset for
 * another sweep instead of settling it wrongly.
 */
async function probeShorts(
  items: readonly VideosListItem[],
  fetchImpl: typeof fetch,
): Promise<Map<string, boolean | null>> {
  const answers = new Map<string, boolean | null>();

  const asked = items.filter((item) => {
    const details = item.liveStreamingDetails;

    return needsShortsProbe(
      parseDurationSeconds(item.contentDetails?.duration),
      determineLiveBroadcastContent(details),
      details,
    );
  });

  await Promise.all(
    asked.map(async (item) => {
      try {
        const response = await fetchImpl(`${SHORTS_URL_BASE}${item.id}`, { redirect: 'manual' });

        answers.set(item.id, readShortsProbe(response.status));
      } catch (error) {
        // Nothing was learned, which is what null says. Left out of the map
        // it would read the same, but saying it here keeps the count of
        // failures visible to anyone reading a log beside the tick.
        console.warn(`video-update: /shorts/ probe failed for one video`, error);
        answers.set(item.id, null);
      }
    }),
  );

  return answers;
}

/**
 * Fetches the given ids and writes every one of them, present or absent.
 *
 * Returns nothing: what happened to each id is in `video` and `collect_task`
 * by the time this resolves, which is where the next tick reads it from.
 */
async function collectVideos(
  env: Env,
  kind: TaskKind,
  videoIds: readonly string[],
  fetchedAt: string,
  fetchImpl: typeof fetch,
): Promise<void> {
  // maxResults is not accepted alongside id on Videos.list - the API
  // documents it as usable with myRating only - so the batch size is enforced
  // by chunking the id list rather than by a parameter. 50 is the API's
  // ceiling on an id list.
  for (const chunk of chunkIds(videoIds)) {
    let items: VideosListItem[];

    try {
      const response = await callYouTubeApi<VideosListResponse>(
        'videos',
        env.YOUTUBE_API_KEY,
        {
          part: 'snippet,contentDetails,status,statistics,liveStreamingDetails',
          id: chunk.join(','),
        },
        fetchImpl,
      );

      items = response.items ?? [];
    } catch (error) {
      // The call failed, so nothing is known about any id in it. None of them
      // is 'unavailable': that would be reading a verdict into a call that
      // never answered.
      console.error(`${kind}: Videos.list failed for ${chunk.length} ids`, error);
      await Promise.all(chunk.map((videoId) => recordTask(env.DB, kind, videoId, 'failed', fetchedAt)));
      continue;
    }

    const returned = new Map(items.map((item) => [item.id, item]));
    // Asked before any statement is built, so that one round of questions
    // covers the whole chunk rather than one per video inside the loop.
    const shorts = await probeShorts(items, fetchImpl);

    // Each video's row and its task row, paired so the two can never disagree
    // about how that video's tick ended.
    //
    // Building a pair can throw: videoStatement refuses an item that came back
    // without a channelId, a title or a publishedAt, because those are the
    // NOT NULL columns the API supplies and there is no row without them. That
    // is one video's problem, so it is caught per video. Left to escape it
    // would reject the whole chunk, and the other forty-nine would go
    // unwritten with nothing in collect_task to say why.
    const pairs: { videoId: string; statements: D1PreparedStatement[] }[] = [];
    const unbuildable: string[] = [];

    for (const videoId of chunk) {
      const item = returned.get(videoId);

      try {
        pairs.push({
          videoId,
          statements:
            item === undefined
              ? [
                  unavailableStatement(env.DB, videoId, fetchedAt),
                  missedStatement(env.DB, kind, videoId, 'unavailable', fetchedAt),
                ]
              : [
                  videoStatement(env.DB, item, fetchedAt, shorts.get(videoId) ?? null),
                  collectedStatement(env.DB, kind, videoId, fetchedAt),
                ],
        });
      } catch (error) {
        console.error(`${kind}: ${videoId} came back without the columns a row needs`, error);
        unbuildable.push(videoId);
      }
    }

    await Promise.all(unbuildable.map((videoId) => recordTask(env.DB, kind, videoId, 'failed', fetchedAt)));

    if (pairs.length === 0) continue;

    try {
      // One batch for the whole chunk rather than one per video. D1 allows six
      // concurrent connections, and this worker can have three jobs in flight
      // at once (see runScheduled), so fifty batches racing each other is a
      // good way to be told the database is overloaded.
      await env.DB.batch(pairs.flatMap(({ statements }) => statements));
      continue;
    } catch (error) {
      // One video's statements failed, and a batch is one transaction, so all
      // fifty rolled back. Which video it was is not in the error, so the
      // retry below finds out by isolating them.
      console.warn(`${kind}: batch of ${pairs.length} failed, retrying one video at a time`, error);
    }

    await Promise.all(
      pairs.map(async ({ videoId, statements }) => {
        try {
          await env.DB.batch(statements);
        } catch (error) {
          // The third way to miss, and the one that is easy to leave out of
          // the list: the call answered and the video was in it, but writing
          // this one row failed. Without this the video would keep its old
          // fetched_at and no trace of why.
          console.error(`${kind}: writing ${videoId} failed`, error);
          await recordTask(env.DB, kind, videoId, 'failed', fetchedAt);
        }
      }),
    );
  }
}

/**
 * The video-discover job (#63): what each channel has published that D1 has
 * not seen.
 *
 * One PlaylistItems.list call per channel against its uploads playlist, which
 * is 1 unit against Search.list' 100. That is the whole reason the old
 * system's "one channel an hour" limit is gone and a new video is found inside
 * ten minutes rather than eleven hours.
 */
export async function runVideoDiscover(env: Env, fetchImpl: typeof fetch = fetch): Promise<void> {
  const fetchedAt = formatTimestamp(new Date());

  const { results: channels } = await env.DB.prepare('SELECT channel_id FROM channel').all<{ channel_id: string }>();

  if (channels.length === 0) {
    console.warn('video-discover: no channels in D1 to collect');
    return;
  }

  // Every id, rather than only the ones the playlists are about to name. The
  // narrower query would need the playlist responses first and then an IN list
  // per chunk, and what it would save is one column of 6,424 rows - the whole
  // table as the audit found it, and growing by 11 channels' uploads. If that
  // stops being small the narrower query is the fix; it is not one yet.
  const { results: stored } = await env.DB.prepare('SELECT video_id FROM video').all<{ video_id: string }>();
  const known = new Set(stored.map((row) => row.video_id));
  const found: string[] = [];

  await Promise.all(
    channels.map(async ({ channel_id: channelId }) => {
      try {
        const response = await callYouTubeApi<PlaylistItemsResponse>(
          'playlistItems',
          env.YOUTUBE_API_KEY,
          {
            part: 'contentDetails',
            playlistId: uploadsPlaylistId(channelId),
            // Without this the API returns its default of 5 however many the
            // playlist holds, and a channel that published six videos between
            // two ticks would lose one silently. The regression test names
            // more than five for that reason.
            maxResults: String(YOUTUBE_MAX_RESULTS),
          },
          fetchImpl,
        );

        const page = (response.items ?? [])
          .map((item) => item.contentDetails?.videoId)
          .filter((videoId): videoId is string => videoId !== undefined);
        const fresh = page.filter((videoId) => !known.has(videoId));

        found.push(...fresh);

        // Only the newest page is read, so this job finds what a channel has
        // just published and not what it published years ago. The archive is
        // #67's to import; following nextPageToken here would either cost a
        // call per page of every channel's whole history on the first tick, or
        // stop as soon as a page is entirely known and so never reach the
        // pages behind it.
        //
        // That division only holds while the newest page overlaps what is
        // already stored. A page with nothing known on it and more pages
        // behind it means the overlap is gone - #67 has not run, or the worker
        // has been down for more than fifty uploads - and videos are sitting
        // where nothing will look. Saying so is cheap; guessing which of the
        // two it is, is not.
        if (fresh.length === page.length && page.length > 0 && response.nextPageToken !== undefined) {
          console.warn(
            `video-discover: every video on ${channelId}'s newest page is new and more pages follow; ` +
              'older videos are not being reached (see #67)',
          );
        }

        // The playlist was read, so a row still blaming this channel is out
        // of date. Only the channel-targeted row is settled here; the videos
        // this page found get theirs from collectVideos below, under the same
        // kind but their own ids.
        //
        // Its own catch, because the one below names PlaylistItems.list and
        // this is a D1 write - the same split collectVideos keeps between a
        // call that failed and a write that did. Nothing this tick reads the
        // row back, and the next successful tick settles it, so saying so is
        // all there is to do.
        try {
          await collectedStatement(env.DB, 'video_discover', channelId, fetchedAt).run();
        } catch (error) {
          console.error(`video-discover: settling ${channelId} failed`, error);
        }
      } catch (error) {
        // One channel's playlist, not the others'. The target is the channel
        // because no video id was learned to blame.
        console.error(`video-discover: PlaylistItems.list failed for ${channelId}`, error);
        await recordTask(env.DB, 'video_discover', channelId, 'failed', fetchedAt);
      }
    }),
  );

  if (found.length === 0) return;

  // One call's worth a tick. Anything past it is not lost: it is still absent
  // from `video`, so the next tick finds it again.
  const batch = found.slice(0, YOUTUBE_MAX_RESULTS);

  if (found.length > batch.length) {
    console.warn(`video-discover: ${found.length} new videos found, taking ${batch.length} this tick`);
  }

  await collectVideos(env, 'video_discover', batch, fetchedAt, fetchImpl);
}

/**
 * The video-update job (#63): refreshes videos already stored.
 *
 * The selection is the part #63 asks for by name. The old system chose with
 * three conditions that between them left a hole, and five videos fell in it -
 * last fetched between 2023-11-30 and 2025-03-26 and never again. The fix is
 * not a fourth condition but a selection that cannot have a hole:
 *
 *   * The sweep orders the whole table by fetched_at and takes the oldest. It
 *     has no WHERE clause, so no video can fail to match it. Every pass moves
 *     the ones it takes to the back, so a video not taken this tick is nearer
 *     the front on the next one and is eventually taken.
 *   * Live and upcoming streams are taken first, because #64 wants a stream
 *     starting or ending to show within ten minutes and the sweep alone would
 *     take a day to come round. They are capped at LIVE_PRIORITY_MAX so they
 *     cannot fill a tick and starve the sweep.
 *
 * The cap is what turns "eventually" into a number. With at least
 * UPDATE_BATCH - LIVE_PRIORITY_MAX videos swept per tick and 144 ticks a day,
 * the 6,424 videos in the audit come round inside a day and a half at worst.
 */
export async function runVideoUpdate(env: Env, fetchImpl: typeof fetch = fetch): Promise<void> {
  const fetchedAt = formatTimestamp(new Date());

  const { results: live } = await env.DB.prepare(
    `SELECT video_id FROM video
      WHERE live_broadcast_content <> 'none'
      ORDER BY fetched_at ASC
      LIMIT ?1`,
  )
    .bind(LIVE_PRIORITY_MAX)
    .all<{ video_id: string }>();

  const selected = live.map((row) => row.video_id);

  // Asking for more than the tick can hold, because the live rows above are
  // usually among the oldest too: without the margin the overlap would come
  // out of the sweep's share rather than out of the surplus.
  const { results: oldest } = await env.DB.prepare('SELECT video_id FROM video ORDER BY fetched_at ASC LIMIT ?1')
    .bind(UPDATE_BATCH + LIVE_PRIORITY_MAX)
    .all<{ video_id: string }>();

  const taken = new Set(selected);

  for (const { video_id: videoId } of oldest) {
    if (selected.length >= UPDATE_BATCH) break;
    if (taken.has(videoId)) continue;

    taken.add(videoId);
    selected.push(videoId);
  }

  if (selected.length === 0) {
    console.warn('video-update: no videos in D1 to refresh');
    return;
  }

  await collectVideos(env, 'video_update', selected, fetchedAt, fetchImpl);
}
