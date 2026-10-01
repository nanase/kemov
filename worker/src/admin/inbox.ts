import { queryInChunks } from '../lib/d1';
import type { Env } from '../lib/env';
import { errorResponse, jsonResponse } from '../lib/json';
import { readSourceWhitelist } from '../lib/source-whitelist';
import { present as presentEvent, readEvent, readEvents } from './footprints';
import { sourcesProblem, waitingFootprints } from './footprints-publish';
import { waitingGenetMusic } from './genet-publish';
import { present as presentStream, readStreams } from './genet-streams';
import { waitingSubscriberMilestones } from './subscriber-milestones-publish';

/**
 * The やること screens (#141): 確認待ち, 出典の確認待ち and 公開待ち. #141's
 * design makes each one a saved filter over rows the data screens already
 * own, not a store of its own, so this file only selects rows and moves
 * them a step; what a row is and how it publishes stays in footprints*.ts
 * and genet-*.ts.
 *
 * 確認待ち is a row nobody has let through yet: a draft that has never been
 * published (no `import` or `publish` revision - one withdrawn after it was
 * live has been through once already), and a row put off with 「あとで」,
 * which is what `status = 'review'` records. Put-off rows sort after the
 * ones not yet looked at.
 */

const NEVER_PUBLISHED_EVENT = `CAST(event_id AS TEXT) NOT IN (
  SELECT entity_key FROM revision WHERE entity = 'footprints_event' AND action IN ('import', 'publish'))`;

const NEVER_PUBLISHED_STREAM = `video_id NOT IN (
  SELECT entity_key FROM revision WHERE entity = 'genet_stream' AND action IN ('import', 'publish'))`;

const REVIEW_EVENTS = `status = 'review' OR (status = 'draft' AND ${NEVER_PUBLISHED_EVENT})`;
const REVIEW_STREAMS = `status = 'review' OR (status = 'draft' AND ${NEVER_PUBLISHED_STREAM})`;

/** GET /admin/api/inbox - how many rows each やること screen holds, for the sidebar. */
export async function inboxCounts(env: Env): Promise<Response> {
  const [events, streams, source, footprints, genet, milestones] = await Promise.all([
    env.DB.prepare(`SELECT count(*) AS n FROM footprints_event WHERE ${REVIEW_EVENTS}`).first<{ n: number }>(),
    env.DB.prepare(`SELECT count(*) AS n FROM genet_stream WHERE ${REVIEW_STREAMS}`).first<{ n: number }>(),
    env.DB.prepare('SELECT count(*) AS n FROM footprints_event WHERE source_pending = 1').first<{ n: number }>(),
    waitingFootprints(env),
    waitingGenetMusic(env),
    waitingSubscriberMilestones(env),
  ]);

  return jsonResponse({
    review: (events?.n ?? 0) + (streams?.n ?? 0),
    source: source?.n ?? 0,
    publish: footprints.length + genet.pending.length + milestones.pending.length + milestones.eventChanged.length,
  });
}

/**
 * GET /admin/api/inbox/review - 確認待ち. `tuneTitles` names every tune the
 * streams perform, so the screen can list a stream's tunes without asking
 * for each one.
 */
export async function listReviewInbox(env: Env): Promise<Response> {
  const [{ results: eventIds }, { results: videoIds }] = await Promise.all([
    env.DB.prepare(
      `SELECT event_id FROM footprints_event WHERE ${REVIEW_EVENTS} ORDER BY status = 'review', start_date, event_id`,
    ).all<{ event_id: number }>(),
    env.DB.prepare(
      `SELECT video_id FROM genet_stream WHERE ${REVIEW_STREAMS} ORDER BY status = 'review', published_at, video_id`,
    ).all<{ video_id: string }>(),
  ]);

  const [eventsById, streamsById] = await Promise.all([
    readEvents(
      env,
      eventIds.map((row) => row.event_id),
    ),
    readStreams(
      env,
      videoIds.map((row) => row.video_id),
    ),
  ]);

  // A row the first query found can be gone by the time the second reads it,
  // if a delete runs in between - left out, the same as listEvents does.
  const events = eventIds.flatMap((row) => {
    const saved = eventsById.get(row.event_id);

    return saved === undefined ? [] : [presentEvent(saved)];
  });
  const streams = videoIds.flatMap((row) => {
    const saved = streamsById.get(row.video_id);

    return saved === undefined ? [] : [presentStream(saved)];
  });

  const tuneIds = [...new Set(streams.flatMap((stream) => stream.performances.map((p) => p.tuneId)))];
  const tuneRows = await queryInChunks(tuneIds, async (chunk) => {
    const placeholders = chunk.map((_, index) => `?${index + 1}`).join(', ');
    const { results } = await env.DB.prepare(`SELECT tune_id, title FROM genet_tune WHERE tune_id IN (${placeholders})`)
      .bind(...chunk)
      .all<{ tune_id: number; title: string }>();

    return results;
  });

  return jsonResponse({
    events,
    streams,
    tuneTitles: Object.fromEntries(tuneRows.map((row) => [String(row.tune_id), row.title])),
  });
}

/** GET /admin/api/inbox/source - 出典の確認待ち: every event still marked so, whatever its status. */
export async function listSourceInbox(env: Env): Promise<Response> {
  const { results } = await env.DB.prepare(
    'SELECT event_id FROM footprints_event WHERE source_pending = 1 ORDER BY start_date, event_id',
  ).all<{ event_id: number }>();

  const byId = await readEvents(
    env,
    results.map((row) => row.event_id),
  );

  return jsonResponse({
    events: results.flatMap((row) => {
      const saved = byId.get(row.event_id);

      return saved === undefined ? [] : [presentEvent(saved)];
    }),
  });
}

type PublishTarget = 'footprints' | 'genet_music' | 'subscriber_milestones';
type PublishEntity = 'footprints_event' | 'genet_stream' | 'genet_tune' | 'genet_person' | 'subscriber_milestone';

interface PublishItem {
  target: PublishTarget;
  entity: PublishEntity;
  key: string;
  /** null when the row is gone: what is waiting is the revision, which outlives it. */
  title: string | null;
  /** The Japan-time date the row is filed under, or null for a tune or a person, which have none. */
  date: string | null;
  /** The latest revision's action - or `event_changed` for a milestone whose own revision did not change but whose linked event did. */
  latestAction: string;
}

/**
 * GET /admin/api/inbox/publish - 公開待ち: what the next 「いま公開する」 of
 * each public JSON would put on the site or take off it. `canPublish` follows
 * the same rule as the 公開 screen's buttons, so a run asked for here does
 * something.
 */
export async function listPublishInbox(env: Env): Promise<Response> {
  const [footprints, genet, milestones] = await Promise.all([
    waitingFootprints(env),
    waitingGenetMusic(env),
    waitingSubscriberMilestones(env),
  ]);

  const milestoneEntries = [
    ...milestones.pending,
    ...milestones.eventChanged.map((m) => ({ milestoneId: m.milestoneId, latestAction: 'event_changed' })),
  ];

  const keysOf = (entity: PublishEntity) => genet.pending.filter((p) => p.entity === entity).map((p) => p.key);

  const [eventRows, streamRows, tuneRows, personRows, milestoneRows] = await Promise.all([
    selectByIds(
      env,
      'SELECT event_id AS id, title, start_date AS date FROM footprints_event WHERE event_id IN',
      footprints.map((p) => p.eventId),
    ),
    selectByIds(
      env,
      `SELECT video_id AS id, coalesce(short_title, title) AS title, date(published_at, '+9 hours') AS date
         FROM genet_stream WHERE video_id IN`,
      keysOf('genet_stream'),
    ),
    selectByIds(
      env,
      'SELECT tune_id AS id, title, NULL AS date FROM genet_tune WHERE tune_id IN',
      keysOf('genet_tune').map(Number),
    ),
    selectByIds(
      env,
      'SELECT person_id AS id, name AS title, NULL AS date FROM genet_person WHERE person_id IN',
      keysOf('genet_person').map(Number),
    ),
    selectByIds(
      env,
      `SELECT m.milestone_id AS id, c.name || ' ' || printf('%,d', m.subscriber_count) || ' 人' AS title,
              m.reached_date AS date
         FROM subscriber_milestone m JOIN channel c ON c.channel_id = m.channel_id
        WHERE m.milestone_id IN`,
      milestoneEntries.map((m) => m.milestoneId),
    ),
  ]);

  const rowsByEntity: Record<PublishEntity, Map<string, TitledRow>> = {
    footprints_event: byKey(eventRows),
    genet_stream: byKey(streamRows),
    genet_tune: byKey(tuneRows),
    genet_person: byKey(personRows),
    subscriber_milestone: byKey(milestoneRows),
  };

  const item = (target: PublishTarget, entity: PublishEntity, key: string, latestAction: string): PublishItem => {
    const row = rowsByEntity[entity].get(key);

    return { target, entity, key, title: row?.title ?? null, date: row?.date ?? null, latestAction };
  };

  return jsonResponse({
    items: [
      ...footprints.map((p) => item('footprints', 'footprints_event', String(p.eventId), p.latestAction)),
      ...genet.pending.map((p) => item('genet_music', p.entity, p.key, p.latestAction)),
      ...milestoneEntries.map((m) =>
        item('subscriber_milestones', 'subscriber_milestone', String(m.milestoneId), m.latestAction),
      ),
    ],
    canPublish: {
      footprints: footprints.length > 0,
      genet: genet.pending.length > 0 || genet.shapeOutdated,
      milestones: milestones.needsBuild,
    },
  });
}

interface TitledRow {
  id: string | number;
  title: string;
  date: string | null;
}

/** `select` (ending in `IN`) run over `ids` in chunks. */
function selectByIds(env: Env, select: string, ids: readonly (string | number)[]): Promise<TitledRow[]> {
  return queryInChunks(ids, async (chunk) => {
    const placeholders = chunk.map((_, index) => `?${index + 1}`).join(', ');
    const { results } = await env.DB.prepare(`${select} (${placeholders})`)
      .bind(...chunk)
      .all<TitledRow>();

    return results;
  });
}

function byKey(rows: readonly TitledRow[]): Map<string, TitledRow> {
  return new Map(rows.map((row) => [String(row.id), row]));
}

/**
 * POST /admin/api/footprints/events/:eventId/defer - 「あとで」. The row
 * becomes `review` and stays in 確認待ち, behind the rows not yet looked at.
 * Logs no revision: nothing about what is or will be public changed. 409 for
 * a published row, which 確認待ち never lists.
 */
export async function deferEvent(env: Env, eventId: number): Promise<Response> {
  const saved = await readEvent(env, eventId);

  if (saved === null) return errorResponse(404, `no footprints event ${eventId}`);

  if (saved.event.status === 'published') return errorResponse(409, 'a published event cannot be put off');

  await env.DB.prepare(`UPDATE footprints_event SET status = 'review' WHERE event_id = ?1 AND status <> 'published'`)
    .bind(eventId)
    .run();

  return jsonResponse({ event: presentEvent({ ...saved, event: { ...saved.event, status: 'review' } }) });
}

/** POST /admin/api/genet/streams/:videoId/defer - `deferEvent` for a stream. */
export async function deferStream(env: Env, videoId: string): Promise<Response> {
  const row = await env.DB.prepare('SELECT status FROM genet_stream WHERE video_id = ?1')
    .bind(videoId)
    .first<{ status: string }>();

  if (row === null) return errorResponse(404, `no stream ${videoId}`);

  if (row.status === 'published') return errorResponse(409, 'a published stream cannot be put off');

  await env.DB.prepare(`UPDATE genet_stream SET status = 'review' WHERE video_id = ?1 AND status <> 'published'`)
    .bind(videoId)
    .run();

  return jsonResponse({ status: 'review' });
}

/**
 * POST /admin/api/footprints/events/:eventId/confirm-source - 「出典を確かめた」.
 * Clears `source_pending` once the saved sources back the event the way
 * publishing asks (`sourcesProblem`); 400 with the reason otherwise, so a row
 * cannot leave 出典の確認待ち on sources that would then fail to publish.
 *
 * A published row's public copy still says 確認待ち afterwards: like any
 * other save, this logs no revision, and the row needs 「公開待ちにする」.
 */
export async function confirmEventSources(env: Env, eventId: number): Promise<Response> {
  const saved = await readEvent(env, eventId);

  if (saved === null) return errorResponse(404, `no footprints event ${eventId}`);

  const problem = sourcesProblem(saved.sources, await readSourceWhitelist(env));

  if (problem !== null) return jsonResponse({ errors: [problem] }, { status: 400 });

  await env.DB.prepare(
    `UPDATE footprints_event
        SET source_pending = 0, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
      WHERE event_id = ?1`,
  )
    .bind(eventId)
    .run();

  return jsonResponse({ event: presentEvent({ ...saved, event: { ...saved.event, source_pending: 0 } }) });
}
