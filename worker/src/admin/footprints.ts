import type { Env } from '../lib/env';
import { errorResponse, jsonResponse } from '../lib/json';
import { isSchemaDate, isSchemaTimestamp } from '../lib/time';

/**
 * Reading, saving and deleting `footprints_event` (#141, #140): the
 * timeline's own rows, still in progress. Publishing them - the validation
 * that lets a row become part of the public JSON, and the only point a save
 * logs a `revision` - is footprints-publish.ts. #141's design table for a
 * row that passes through a publish gate has no `revision` for a plain save:
 * only `publish`, `withdraw` and the collector's own `import` add one, so
 * this file writes `footprints_event` and its members and sources without
 * ever calling `revisionStatement`.
 */

export const KINDS = [
  'project',
  'announcement',
  'debut',
  '3d',
  'new_outfit',
  'real_event',
  'goods',
  'music',
  'collab',
  'media',
  'milestone',
  'graduation',
  'anniversary',
  'other',
] as const;

const DATE_PRECISIONS = ['day', 'month'] as const;

export interface EventRow {
  event_id: number;
  date_precision: string;
  start_date: string;
  starts_at: string | null;
  end_date: string | null;
  kind: string;
  emphasized: number;
  title: string;
  place: string | null;
  supplement: string | null;
  video_id: string | null;
  source_pending: number;
  status: string;
  memo: string | null;
  created_at: string;
  updated_at: string;
}

export interface SourceRow {
  url: string;
  title: string | null;
}

/** One event with its members and sources, as saved. */
export interface FootprintsEvent {
  event: EventRow;
  channelIds: string[];
  sources: SourceRow[];
}

export function present(saved: FootprintsEvent) {
  const { event } = saved;

  return {
    eventId: event.event_id,
    datePrecision: event.date_precision,
    startDate: event.start_date,
    startsAt: event.starts_at,
    endDate: event.end_date,
    kind: event.kind,
    emphasized: event.emphasized === 1,
    title: event.title,
    place: event.place,
    supplement: event.supplement,
    videoId: event.video_id,
    sourcePending: event.source_pending === 1,
    status: event.status,
    memo: event.memo,
    createdAt: event.created_at,
    updatedAt: event.updated_at,
    channelIds: saved.channelIds,
    sources: saved.sources.map((source) => ({ url: source.url, title: source.title })),
  };
}

/**
 * The shape #141's design gives one element of the public JSON, built from a
 * saved event rather than from a fresh body - footprints-publish.ts uses
 * this both for what a `publish` revision's `body` holds and for what a
 * working row is compared against to answer "changed since it was
 * published". Key order follows the "あしあと" example in #141's design
 * comment; `memo`, `status`, `created_via` and the timestamp columns are
 * left out, because they are not part of the public shape either.
 */
export function publicShapeOf(saved: FootprintsEvent) {
  const { event } = saved;

  return {
    event_id: event.event_id,
    date_precision: event.date_precision,
    start_date: event.start_date,
    starts_at: event.starts_at,
    end_date: event.end_date,
    kind: event.kind,
    emphasized: event.emphasized === 1,
    title: event.title,
    place: event.place,
    supplement: event.supplement,
    video_id: event.video_id,
    source_pending: event.source_pending === 1,
    channel_ids: [...saved.channelIds].sort(),
    sources: saved.sources.map((source) => ({ url: source.url, title: source.title })),
  };
}

/**
 * The event's own row, its members and its sources - three tables read
 * together because every caller of this file wants all three, the same
 * grouping `present` hands back out.
 */
export async function readEvent(env: Env, eventId: number): Promise<FootprintsEvent | null> {
  const event = await env.DB.prepare(
    `SELECT event_id, date_precision, start_date, starts_at, end_date, kind, emphasized, title, place,
            supplement, video_id, source_pending, status, memo, created_at, updated_at
       FROM footprints_event
      WHERE event_id = ?1`,
  )
    .bind(eventId)
    .first<EventRow>();

  if (event === null) return null;

  const [members, sources] = await Promise.all([
    env.DB.prepare('SELECT channel_id FROM footprints_event_member WHERE event_id = ?1 ORDER BY channel_id')
      .bind(eventId)
      .all<{ channel_id: string }>(),
    env.DB.prepare('SELECT url, title FROM footprints_event_source WHERE event_id = ?1 ORDER BY position')
      .bind(eventId)
      .all<SourceRow>(),
  ]);

  return { event, channelIds: members.results.map((row) => row.channel_id), sources: sources.results };
}

/**
 * `readEvent` for several event ids at once, keyed by event_id - three
 * queries in total rather than three per id. Used wherever a caller already
 * has a list of ids and would otherwise call `readEvent` in a loop
 * (listEvents, pendingFootprints's "changed" check).
 */
export async function readEvents(env: Env, eventIds: readonly number[]): Promise<Map<number, FootprintsEvent>> {
  if (eventIds.length === 0) return new Map();

  const placeholders = eventIds.map((_, index) => `?${index + 1}`).join(', ');

  const [events, members, sources] = await Promise.all([
    env.DB.prepare(
      `SELECT event_id, date_precision, start_date, starts_at, end_date, kind, emphasized, title, place,
                supplement, video_id, source_pending, status, memo, created_at, updated_at
           FROM footprints_event
          WHERE event_id IN (${placeholders})`,
    )
      .bind(...eventIds)
      .all<EventRow>(),
    env.DB.prepare(
      `SELECT event_id, channel_id FROM footprints_event_member WHERE event_id IN (${placeholders}) ORDER BY event_id, channel_id`,
    )
      .bind(...eventIds)
      .all<{ event_id: number; channel_id: string }>(),
    env.DB.prepare(
      `SELECT event_id, url, title FROM footprints_event_source WHERE event_id IN (${placeholders}) ORDER BY event_id, position`,
    )
      .bind(...eventIds)
      .all<{ event_id: number } & SourceRow>(),
  ]);

  const result = new Map<number, FootprintsEvent>(
    events.results.map((event) => [event.event_id, { event, channelIds: [], sources: [] }]),
  );

  for (const { event_id: eventId, channel_id: channelId } of members.results) {
    result.get(eventId)?.channelIds.push(channelId);
  }

  for (const { event_id: eventId, ...source } of sources.results) {
    result.get(eventId)?.sources.push(source);
  }

  return result;
}

/** GET /admin/api/footprints/events - optionally narrowed by status and by a substring of title. */
export async function listEvents(env: Env, status: string | null, q: string | null): Promise<Response> {
  if (status !== null && !isStatus(status)) {
    return errorResponse(400, `status must be one of draft, review, published`);
  }

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (status !== null) {
    params.push(status);
    conditions.push(`status = ?${params.length}`);
  }

  if (q !== null) {
    params.push(`%${q.replace(/[\\%_]/g, '\\$&')}%`);
    conditions.push(`title LIKE ?${params.length} ESCAPE '\\'`);
  }

  const where = conditions.length === 0 ? '' : `WHERE ${conditions.join(' AND ')}`;

  const { results } = await env.DB.prepare(
    `SELECT event_id FROM footprints_event ${where} ORDER BY start_date, event_id`,
  )
    .bind(...params)
    .all<{ event_id: number }>();

  const byId = await readEvents(
    env,
    results.map((row) => row.event_id),
  );

  // The order results was already asked in - readEvents' own Map does not
  // promise one, since it is built from three separate, unordered queries.
  return jsonResponse({ events: results.map((row) => present(byId.get(row.event_id)!)) });
}

/** GET /admin/api/footprints/events/:eventId. 404 when there is no such event. */
export async function getEvent(env: Env, eventId: number): Promise<Response> {
  const saved = await readEvent(env, eventId);

  if (saved === null) return errorResponse(404, `no footprints event ${eventId}`);

  return jsonResponse(present(saved));
}

function isStatus(value: unknown): value is 'draft' | 'review' | 'published' {
  return value === 'draft' || value === 'review' || value === 'published';
}

/**
 * What is wrong with the fields a POST or PUT sends, or null when they are
 * fine.
 *
 * This is the schema's own CHECKs, not the stricter rules
 * footprints-publish.ts enforces before letting an event become
 * `published`: a row not yet ready to publish is exactly what a draft is
 * for, and D1's CHECKs are what actually bound what this function accepts -
 * checked again here so a mistake is a 400 with a reason, not a raw
 * constraint failure.
 */
function eventFieldsProblem(fields: EventFields): string | null {
  if (!(DATE_PRECISIONS as readonly string[]).includes(fields.datePrecision)) {
    return 'datePrecision must be day or month';
  }

  const startOk = fields.datePrecision === 'day' ? isSchemaDate(fields.startDate) : isSchemaMonth(fields.startDate);

  if (!startOk) return `startDate must be ${fields.datePrecision === 'day' ? 'YYYY-MM-DD' : 'YYYY-MM'}`;

  if (fields.startsAt !== null) {
    if (!isSchemaTimestamp(fields.startsAt)) return 'startsAt must be YYYY-MM-DDTHH:MM:SSZ or null';
    if (fields.datePrecision !== 'day') return 'startsAt requires datePrecision to be day';
    if (japanDateOf(fields.startsAt) !== fields.startDate) return 'startsAt is not on startDate in Japan time';
  }

  if (fields.endDate !== null) {
    const endOk = isSchemaDate(fields.endDate) || isSchemaMonth(fields.endDate);

    if (!endOk) return 'endDate must be YYYY-MM-DD, YYYY-MM, or null';
    if (fields.endDate < fields.startDate) return 'endDate is before startDate';
  }

  if (!(KINDS as readonly string[]).includes(fields.kind)) return `kind must be one of ${KINDS.join(', ')}`;
  // Not "title must not be empty": that is one of the stricter rules
  // footprints-publish.ts checks before letting an event publish, not a
  // schema CHECK - title has none - so a draft may leave it blank while
  // still being worked out.

  if (fields.videoId !== null && typeof fields.videoId !== 'string') return 'videoId must be a string or null';

  for (const source of fields.sources) {
    if (!source.url.startsWith('https://')) return 'every source url must start with https://';
  }

  return null;
}

function isSchemaMonth(value: string): boolean {
  return /^\d{4}-\d{2}$/.test(value) && isSchemaDate(`${value}-01`);
}

/** The Japan-time calendar date (UTC+9) an instant falls on, in the schema's date shape. */
function japanDateOf(instant: string): string {
  return new Date(new Date(instant).getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export interface EventFields {
  datePrecision: string;
  startDate: string;
  startsAt: string | null;
  endDate: string | null;
  kind: string;
  emphasized: boolean;
  title: string;
  place: string | null;
  supplement: string | null;
  videoId: string | null;
  sourcePending: boolean;
  memo: string | null;
  channelIds: string[];
  sources: SourceRow[];
}

/**
 * Reads the fields a POST or PUT body carries, defaulting a field it leaves
 * out to null (or `[]` for the two arrays) - the same full-replace reading
 * #158 gives a PUT body, extended to POST here because there is no partial
 * form of creating an event either.
 */
function readEventFields(body: Record<string, unknown>): EventFields | { error: string } {
  const channelIds = body.channelIds ?? [];
  const sources = body.sources ?? [];

  if (!Array.isArray(channelIds) || channelIds.some((id) => typeof id !== 'string')) {
    return { error: 'channelIds must be an array of strings' };
  }

  if (
    !Array.isArray(sources) ||
    sources.some(
      (source) =>
        typeof source !== 'object' ||
        source === null ||
        typeof source.url !== 'string' ||
        (source.title !== undefined && source.title !== null && typeof source.title !== 'string'),
    )
  ) {
    return { error: 'sources must be an array of { url, title }' };
  }

  return {
    datePrecision: (body.datePrecision as string) ?? null,
    startDate: (body.startDate as string) ?? null,
    startsAt: (body.startsAt as string | null) ?? null,
    endDate: (body.endDate as string | null) ?? null,
    kind: (body.kind as string) ?? null,
    emphasized: body.emphasized === true,
    title: (body.title as string) ?? '',
    place: (body.place as string | null) ?? null,
    supplement: (body.supplement as string | null) ?? null,
    videoId: (body.videoId as string | null) ?? null,
    sourcePending: body.sourcePending !== false,
    memo: (body.memo as string | null) ?? null,
    // Deduped here, once, rather than left for memberStatements to insert
    // twice: footprints_event_member's primary key is (event_id, channel_id),
    // so a repeated id would otherwise fail the whole batch with a
    // constraint error instead of a 400.
    channelIds: [...new Set(channelIds as string[])],
    sources: (sources as { url: string; title?: string | null }[]).map((source) => ({
      url: source.url,
      title: source.title ?? null,
    })),
  };
}

/** Every channelId in `channelIds` that `channel` has no row for. */
async function unknownChannelIds(env: Env, channelIds: readonly string[]): Promise<string[]> {
  if (channelIds.length === 0) return [];

  const { results } = await env.DB.prepare(
    `SELECT channel_id FROM channel WHERE channel_id IN (${channelIds.map((_, index) => `?${index + 1}`).join(', ')})`,
  )
    .bind(...channelIds)
    .all<{ channel_id: string }>();

  const known = new Set(results.map((row) => row.channel_id));

  return [...new Set(channelIds)].filter((id) => !known.has(id));
}

/**
 * Everything createEvent and updateEvent both check before touching D1:
 * shape (readEventFields), then format (eventFieldsProblem), then whether
 * every member actually exists.
 */
async function validatedFields(env: Env, body: Record<string, unknown>): Promise<EventFields | { error: Response }> {
  const fields = readEventFields(body);

  if ('error' in fields) return { error: errorResponse(400, fields.error) };

  const problem = eventFieldsProblem(fields);

  if (problem !== null) return { error: errorResponse(400, problem) };

  const unknown = await unknownChannelIds(env, fields.channelIds);

  if (unknown.length > 0) return { error: errorResponse(400, `unknown channelIds: ${unknown.join(', ')}`) };

  return fields;
}

function memberStatements(env: Env, eventId: number, channelIds: readonly string[]): D1PreparedStatement[] {
  return channelIds.map((channelId) =>
    env.DB.prepare('INSERT INTO footprints_event_member (event_id, channel_id) VALUES (?1, ?2)').bind(
      eventId,
      channelId,
    ),
  );
}

function sourceStatements(env: Env, eventId: number, sources: readonly SourceRow[]): D1PreparedStatement[] {
  return sources.map((source, index) =>
    env.DB.prepare('INSERT INTO footprints_event_source (event_id, position, url, title) VALUES (?1, ?2, ?3, ?4)').bind(
      eventId,
      index + 1,
      source.url,
      source.title,
    ),
  );
}

/**
 * Member/source statements for the row a batch's own first statement is
 * about to insert - `last_insert_rowid()` written into the SQL text rather
 * than bound, because it names a function call, not a value.
 * `footprints_event_member` and `footprints_event_source` are declared
 * `WITHOUT ROWID` (composite primary keys), so an insert into either never
 * moves what `last_insert_rowid()` reports; it keeps naming the row the
 * batch's INSERT created through every statement after it.
 */
function memberStatementsForNewEvent(env: Env, channelIds: readonly string[]): D1PreparedStatement[] {
  return channelIds.map((channelId) =>
    env.DB.prepare('INSERT INTO footprints_event_member (event_id, channel_id) VALUES (last_insert_rowid(), ?1)').bind(
      channelId,
    ),
  );
}

function sourceStatementsForNewEvent(env: Env, sources: readonly SourceRow[]): D1PreparedStatement[] {
  return sources.map((source, index) =>
    env.DB.prepare(
      'INSERT INTO footprints_event_source (event_id, position, url, title) VALUES (last_insert_rowid(), ?1, ?2, ?3)',
    ).bind(index + 1, source.url, source.title),
  );
}

/**
 * POST /admin/api/footprints/events. Always creates in `draft` - #141's
 * table draws publishing as its own operation, and a plain save logs no
 * `revision` at all.
 *
 * One `db.batch`, event_id included - see memberStatementsForNewEvent's
 * comment for how the member and source statements name a row this same
 * batch's own INSERT is what creates.
 */
export async function createEvent(env: Env, body: Record<string, unknown>): Promise<Response> {
  const fields = await validatedFields(env, body);

  if ('error' in fields) return fields.error;

  const results = await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO footprints_event
         (date_precision, start_date, starts_at, end_date, kind, emphasized, title, place, supplement,
          video_id, source_pending, status, memo)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 'draft', ?12)`,
    ).bind(
      fields.datePrecision,
      fields.startDate,
      fields.startsAt,
      fields.endDate,
      fields.kind,
      fields.emphasized ? 1 : 0,
      fields.title,
      fields.place,
      fields.supplement,
      fields.videoId,
      fields.sourcePending ? 1 : 0,
      fields.memo,
    ),
    ...memberStatementsForNewEvent(env, fields.channelIds),
    ...sourceStatementsForNewEvent(env, fields.sources),
  ]);

  const eventId = results[0].meta.last_row_id;
  const saved = await readEvent(env, eventId);

  return jsonResponse({ event: present(saved!) }, { status: 201 });
}

/**
 * PUT /admin/api/footprints/events/:eventId. Replaces members and sources
 * along with the row; `status` is left untouched - #141's table keeps
 * publishing and withdrawing as their own operations. Logs no `revision`,
 * same as createEvent.
 */
export async function updateEvent(env: Env, eventId: number, body: Record<string, unknown>): Promise<Response> {
  const existing = await readEvent(env, eventId);

  if (existing === null) return errorResponse(404, `no footprints event ${eventId}`);

  const fields = await validatedFields(env, body);

  if ('error' in fields) return fields.error;

  await env.DB.batch([
    env.DB.prepare(
      `UPDATE footprints_event
          SET date_precision = ?1, start_date = ?2, starts_at = ?3, end_date = ?4, kind = ?5, emphasized = ?6,
              title = ?7, place = ?8, supplement = ?9, video_id = ?10, source_pending = ?11, memo = ?12,
              updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
        WHERE event_id = ?13`,
    ).bind(
      fields.datePrecision,
      fields.startDate,
      fields.startsAt,
      fields.endDate,
      fields.kind,
      fields.emphasized ? 1 : 0,
      fields.title,
      fields.place,
      fields.supplement,
      fields.videoId,
      fields.sourcePending ? 1 : 0,
      fields.memo,
      eventId,
    ),
    env.DB.prepare('DELETE FROM footprints_event_member WHERE event_id = ?1').bind(eventId),
    env.DB.prepare('DELETE FROM footprints_event_source WHERE event_id = ?1').bind(eventId),
    ...memberStatements(env, eventId, fields.channelIds),
    ...sourceStatements(env, eventId, fields.sources),
  ]);

  const saved = await readEvent(env, eventId);

  return jsonResponse({ event: present(saved!) });
}

/**
 * DELETE /admin/api/footprints/events/:eventId.
 *
 * 404 when there is no such event. 409 when it is `published` - HQ's call,
 * #141's design left this undecided: the public JSON is built from
 * `revision`, not from the working row, so deleting a published event would
 * leave its last `publish` sitting in the history with nothing telling the
 * next "publish now" to leave it out. Withdrawing first logs that `withdraw`
 * and makes the row eligible for deletion the same request could otherwise
 * not safely make. Logs no `revision`, same as createEvent and updateEvent.
 */
export async function deleteEvent(env: Env, eventId: number): Promise<Response> {
  const existing = await readEvent(env, eventId);

  if (existing === null) return errorResponse(404, `no footprints event ${eventId}`);

  if (existing.event.status === 'published') {
    return errorResponse(409, 'withdraw this event before deleting it');
  }

  await env.DB.batch([
    env.DB.prepare('DELETE FROM footprints_event_member WHERE event_id = ?1').bind(eventId),
    env.DB.prepare('DELETE FROM footprints_event_source WHERE event_id = ?1').bind(eventId),
    env.DB.prepare('DELETE FROM footprints_event WHERE event_id = ?1').bind(eventId),
  ]);

  // {} rather than 204: every other answer in this API is JSON, and this one
  // has nothing more to say than "done" - no row survives to echo back, and
  // no revisionId either, since this delete logs none.
  return jsonResponse({});
}
