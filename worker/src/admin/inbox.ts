import { queryInChunks } from '../lib/d1';
import type { Env } from '../lib/env';
import { jsonResponse } from '../lib/json';
import { readSourceWhitelist, sourcesEnough } from '../lib/source-whitelist';
import { present as presentEvent, readEvents } from './footprints';
import { footprintsNeedsWrite, waitingFootprints } from './footprints-publish';
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
 * live has been through once already). 「あとで」 is gone from あしあと
 * and ジェネット楽曲一覧 (#281, #284).
 */

const NEVER_PUBLISHED_EVENT = `CAST(event_id AS TEXT) NOT IN (
  SELECT entity_key FROM revision WHERE entity = 'footprints_event' AND action IN ('import', 'publish'))`;

const NEVER_PUBLISHED_STREAM = `video_id NOT IN (
  SELECT entity_key FROM revision WHERE entity = 'genet_stream' AND action IN ('import', 'publish'))`;

const REVIEW_EVENTS = `status = 'draft' AND ${NEVER_PUBLISHED_EVENT}`;
const REVIEW_STREAMS = `status = 'draft' AND ${NEVER_PUBLISHED_STREAM}`;

/**
 * Every event whose sources are not enough (#282), by date and then by id:
 * what 出典の確認待ち lists. Judged here rather than in SQL, by the same rule
 * the public JSON's `source_pending` and the admin screen use. One query for
 * every event's sources: there are a few hundred events, not more.
 */
async function eventIdsShortOfSources(env: Env): Promise<number[]> {
  const [{ results }, whitelist] = await Promise.all([
    env.DB.prepare(
      `SELECT e.event_id, s.url
         FROM footprints_event e
         LEFT JOIN footprints_event_source s ON s.event_id = e.event_id
        ORDER BY e.start_date, e.event_id, s.position`,
    ).all<{ event_id: number; url: string | null }>(),
    readSourceWhitelist(env),
  ]);

  const urlsById = new Map<number, string[]>();

  for (const row of results) {
    const urls = urlsById.get(row.event_id) ?? [];

    if (row.url !== null) urls.push(row.url);
    urlsById.set(row.event_id, urls);
  }

  return [...urlsById].flatMap(([eventId, urls]) => (sourcesEnough(urls, whitelist) ? [] : [eventId]));
}

/** GET /admin/api/inbox - how many rows each やること screen holds, for the sidebar. */
export async function inboxCounts(env: Env): Promise<Response> {
  const [events, streams, source, footprints, genet, milestones] = await Promise.all([
    env.DB.prepare(`SELECT count(*) AS n FROM footprints_event WHERE ${REVIEW_EVENTS}`).first<{ n: number }>(),
    env.DB.prepare(`SELECT count(*) AS n FROM genet_stream WHERE ${REVIEW_STREAMS}`).first<{ n: number }>(),
    // Judging reads the whitelist and every source; a failure there leaves
    // this one count unknown rather than the sidebar without any.
    eventIdsShortOfSources(env).catch(() => null),
    waitingFootprints(env),
    waitingGenetMusic(env),
    waitingSubscriberMilestones(env),
  ]);

  return jsonResponse({
    review: (events?.n ?? 0) + (streams?.n ?? 0),
    source: source === null ? null : source.length,
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
    env.DB.prepare(`SELECT event_id FROM footprints_event WHERE ${REVIEW_EVENTS} ORDER BY start_date, event_id`).all<{
      event_id: number;
    }>(),
    env.DB.prepare(`SELECT video_id FROM genet_stream WHERE ${REVIEW_STREAMS} ORDER BY published_at, video_id`).all<{
      video_id: string;
    }>(),
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

/** GET /admin/api/inbox/source - 出典の確認待ち: every event short of sources, whatever its status. */
export async function listSourceInbox(env: Env): Promise<Response> {
  const eventIds = await eventIdsShortOfSources(env);
  const byId = await readEvents(env, eventIds);

  return jsonResponse({
    events: eventIds.flatMap((eventId) => {
      const saved = byId.get(eventId);

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
  const [footprints, footprintsWrite, genet, milestones] = await Promise.all([
    waitingFootprints(env),
    footprintsNeedsWrite(env),
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
      footprints: footprints.length > 0 || footprintsWrite,
      genet: genet.pending.length > 0 || genet.shapeOutdated || genet.behind,
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
