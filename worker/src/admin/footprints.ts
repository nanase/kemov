import { byteLength } from '../lib/backup';
import { queryInChunks } from '../lib/d1';
import type { Env } from '../lib/env';
import { changedElsewhereResponse, jsonResponse } from '../lib/json';
import {
  DATE_SHAPE_TEXT,
  LOAD_FAILED,
  malformed,
  QUERY_TOO_LONG_TEXT,
  refusal,
  refuse,
  type Refusal,
} from '../lib/refusal';
import { sourcesEnough } from '../lib/source-whitelist';
import { isSchemaDate, isSchemaMonth, isSchemaTimestamp, japanDateOf } from '../lib/time';
import { heldToVersion, UNLOGGED_VERSION_STEP } from '../lib/edit-version';

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
  'memorial_day',
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
  status: string;
  memo: string | null;
  created_at: string;
  updated_at: string;
  edit_version: number;
}

export interface SourceRow {
  url: string;
  title: string | null;
}

/** One event with its members and sources, as saved. */
export interface FootprintsEvent {
  event: EventRow;
  channelIds: string[];
  /** The members among `channelIds` the event is about, rather than ones who took part: a debut's own member, not its guests. */
  leadChannelIds: string[];
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
    status: event.status,
    memo: event.memo,
    createdAt: event.created_at,
    updatedAt: event.updated_at,
    version: event.edit_version,
    channelIds: saved.channelIds,
    leadChannelIds: saved.leadChannelIds,
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
 *
 * `source_pending` is not read from the column of that name, which is no
 * longer used (#282): it says the sources are not enough by `whitelist`,
 * judged the way the admin screen judges them.
 */
export function publicShapeOf(saved: FootprintsEvent, whitelist: readonly string[]) {
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
    source_pending: !sourcesEnough(
      saved.sources.map((source) => source.url),
      whitelist,
    ),
    channel_ids: [...saved.channelIds].sort(),
    lead_channel_ids: [...saved.leadChannelIds].sort(),
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
            supplement, video_id, status, memo, created_at, updated_at, edit_version
       FROM footprints_event
      WHERE event_id = ?1`,
  )
    .bind(eventId)
    .first<EventRow>();

  if (event === null) return null;

  const [members, sources] = await Promise.all([
    env.DB.prepare('SELECT channel_id, lead FROM footprints_event_member WHERE event_id = ?1 ORDER BY channel_id')
      .bind(eventId)
      .all<{ channel_id: string; lead: number }>(),
    env.DB.prepare('SELECT url, title FROM footprints_event_source WHERE event_id = ?1 ORDER BY position')
      .bind(eventId)
      .all<SourceRow>(),
  ]);

  return {
    event,
    channelIds: members.results.map((row) => row.channel_id),
    leadChannelIds: members.results.flatMap((row) => (row.lead === 1 ? [row.channel_id] : [])),
    sources: sources.results,
  };
}

/**
 * `readEvent` for several event ids at once, keyed by event_id - three
 * queries per chunk of ids (`queryInChunks`, worker/src/lib/d1.ts) rather
 * than three per id. Used wherever a caller already has a list of ids and
 * would otherwise call `readEvent` in a loop (listEvents, pendingFootprints's
 * "changed" check).
 */
export async function readEvents(env: Env, eventIds: readonly number[]): Promise<Map<number, FootprintsEvent>> {
  // The rows before their members and sources, not alongside them: a save landing in
  // between then leaves the `edit_version` read behind the members and sources read,
  // and a write sent with it is refused (#307) rather than taking the members and sources
  // for the ones that version saved.
  const eventRows = await queryInChunks(eventIds, async (chunk) => {
    const placeholders = chunk.map((_, index) => `?${index + 1}`).join(', ');
    const { results } = await env.DB.prepare(
      `SELECT event_id, date_precision, start_date, starts_at, end_date, kind, emphasized, title, place,
                  supplement, video_id, status, memo, created_at, updated_at, edit_version
             FROM footprints_event
            WHERE event_id IN (${placeholders})`,
    )
      .bind(...chunk)
      .all<EventRow>();

    return results;
  });
  const [memberRows, sourceRows] = await Promise.all([
    queryInChunks(eventIds, async (chunk) => {
      const placeholders = chunk.map((_, index) => `?${index + 1}`).join(', ');
      const { results } = await env.DB.prepare(
        `SELECT event_id, channel_id, lead FROM footprints_event_member WHERE event_id IN (${placeholders}) ORDER BY event_id, channel_id`,
      )
        .bind(...chunk)
        .all<{ event_id: number; channel_id: string; lead: number }>();

      return results;
    }),
    queryInChunks(eventIds, async (chunk) => {
      const placeholders = chunk.map((_, index) => `?${index + 1}`).join(', ');
      const { results } = await env.DB.prepare(
        `SELECT event_id, url, title FROM footprints_event_source WHERE event_id IN (${placeholders}) ORDER BY event_id, position`,
      )
        .bind(...chunk)
        .all<{ event_id: number } & SourceRow>();

      return results;
    }),
  ]);

  const result = new Map<number, FootprintsEvent>(
    eventRows.map((event) => [event.event_id, { event, channelIds: [], leadChannelIds: [], sources: [] }]),
  );

  for (const { event_id: eventId, channel_id: channelId, lead } of memberRows) {
    result.get(eventId)?.channelIds.push(channelId);
    if (lead === 1) result.get(eventId)?.leadChannelIds.push(channelId);
  }

  for (const { event_id: eventId, ...source } of sourceRows) {
    result.get(eventId)?.sources.push(source);
  }

  return result;
}

// D1's own LIKE/GLOB pattern length limit is 50 bytes of UTF-8, not
// characters - see developers.cloudflare.com/d1/platform/limits/. Checked
// against the pattern this function actually sends (escaped and wrapped in
// `%`), not against `q` itself, since escaping a `%`, `_` or `\` in `q` grows
// it by one byte each.
const D1_LIKE_PATTERN_BYTE_LIMIT = 50;

/** GET /admin/api/footprints/events - optionally narrowed by status and by a substring of title. */
export async function listEvents(env: Env, status: string | null, q: string | null): Promise<Response> {
  if (status !== null && !isStatus(status)) {
    return refuse(400, refusal(LOAD_FAILED, 'status must be one of draft, published'));
  }

  let pattern: string | null = null;

  if (q !== null) {
    pattern = `%${q.replace(/[\\%_]/g, '\\$&')}%`;

    if (byteLength(pattern) > D1_LIKE_PATTERN_BYTE_LIMIT) {
      return refuse(400, refusal(QUERY_TOO_LONG_TEXT, 'q is too long to search by'));
    }
  }

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (status !== null) {
    params.push(status);
    conditions.push(`status = ?${params.length}`);
  }

  if (pattern !== null) {
    params.push(pattern);
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
  //
  // flatMap rather than map: a row this SELECT found can still be gone by the
  // time readEvents reads it, if a concurrent deleteEvent runs in between -
  // byId then has no entry for it, and present(undefined!) would throw. Left
  // out of the answer instead, the same as deleteEvent itself removing a row
  // from what a caller sees next.
  return jsonResponse({
    events: results.flatMap((row) => {
      const saved = byId.get(row.event_id);

      return saved === undefined ? [] : [present(saved)];
    }),
  });
}

/** The 404 for an event that is not there - gone, or never was. */
export function noEventResponse(eventId: number | string): Response {
  return refuse(404, refusal('この出来事が見つかりません', `no footprints event ${eventId}`));
}

/** GET /admin/api/footprints/events/:eventId. 404 when there is no such event. */
export async function getEvent(env: Env, eventId: number): Promise<Response> {
  const saved = await readEvent(env, eventId);

  if (saved === null) return noEventResponse(eventId);

  return jsonResponse(present(saved));
}

// `review` (「あとで」) is gone since #281; migration 0013 made every such
// row a draft, though the table's CHECK still allows it.
function isStatus(value: unknown): value is 'draft' | 'published' {
  return value === 'draft' || value === 'published';
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
function eventFieldsProblem(fields: EventFields): Refusal | null {
  if (!(DATE_PRECISIONS as readonly string[]).includes(fields.datePrecision)) {
    return malformed('datePrecision must be day or month');
  }

  const startOk = fields.datePrecision === 'day' ? isSchemaDate(fields.startDate) : isSchemaMonth(fields.startDate);

  if (!startOk) {
    return refusal(DATE_SHAPE_TEXT, `startDate must be ${fields.datePrecision === 'day' ? 'YYYY-MM-DD' : 'YYYY-MM'}`);
  }

  if (fields.startsAt !== null) {
    if (!isSchemaTimestamp(fields.startsAt)) return malformed('startsAt must be YYYY-MM-DDTHH:MM:SSZ or null');

    if (fields.datePrecision !== 'day') {
      return refusal(
        '開始の時刻がある出来事は日付の細かさを「月まで」にできません',
        'startsAt requires datePrecision to be day',
      );
    }

    if (japanDateOf(fields.startsAt) !== fields.startDate) {
      return refusal('日付が開始の時刻と合っていません', 'startsAt is not on startDate in Japan time');
    }
  }

  if (fields.endDate !== null) {
    const endOk = isSchemaDate(fields.endDate) || isSchemaMonth(fields.endDate);

    if (!endOk) return malformed('endDate must be YYYY-MM-DD, YYYY-MM, or null');
    if (fields.endDate < fields.startDate)
      return refusal('日付が終わりの日より後になっています', 'endDate is before startDate');
  }

  if (!(KINDS as readonly string[]).includes(fields.kind)) return malformed(`kind must be one of ${KINDS.join(', ')}`);
  // Not "title must not be empty": that is one of the stricter rules
  // footprints-publish.ts checks before letting an event publish, not a
  // schema CHECK - title has none - so a draft may leave it blank while
  // still being worked out.

  if (fields.videoId !== null && typeof fields.videoId !== 'string')
    return malformed('videoId must be a string or null');

  // A lead is a member, marked: the column lives on footprints_event_member,
  // so a lead who is not among the members has no row to be marked on.
  if (fields.leadChannelIds.some((id) => !fields.channelIds.includes(id))) {
    return refusal('主役は関わったメンバーから選んでください', 'every leadChannelIds entry must also be in channelIds');
  }

  for (const source of fields.sources) {
    if (!source.url.startsWith('https://')) {
      return refusal('出典の URL が https:// で始まっていません', 'every source url must start with https://');
    }
  }

  return null;
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
  memo: string | null;
  channelIds: string[];
  leadChannelIds: string[];
  sources: SourceRow[];
}

/**
 * Reads the fields a POST or PUT body carries, defaulting a field it leaves
 * out to null (or `[]` for the arrays) - the same full-replace reading
 * #158 gives a PUT body, extended to POST here because there is no partial
 * form of creating an event either.
 *
 * Not built on `editable-body.ts`'s `readEditableBody`, even though this is
 * the same full-replace shape: that helper's `FieldProblem` checks one key
 * against its own value alone, with no way to see a sibling field, but
 * `eventFieldsProblem` below needs several at once - `startsAt` is only
 * valid when `datePrecision` is `day`, and its Japan-time date must match
 * `startDate`. `channelIds`, `leadChannelIds` and `sources` are arrays besides, which
 * `readEditableBody` has no shape for. `editable-body.ts`'s own comment
 * already says as much: it exists for the shape of the check members.ts and
 * video-overrides.ts share, not to force every resource through it.
 */
function readEventFields(body: Record<string, unknown>): EventFields | { error: Refusal } {
  const channelIds = body.channelIds ?? [];
  const leadChannelIds = body.leadChannelIds ?? [];
  const sources = body.sources ?? [];

  if (!Array.isArray(channelIds) || channelIds.some((id) => typeof id !== 'string')) {
    return { error: malformed('channelIds must be an array of strings') };
  }

  if (!Array.isArray(leadChannelIds) || leadChannelIds.some((id) => typeof id !== 'string')) {
    return { error: malformed('leadChannelIds must be an array of strings') };
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
    return { error: malformed('sources must be an array of { url, title }') };
  }

  // Checked rather than coerced (body.emphasized === true / !== false, as an
  // earlier version of this function did): a truthy non-boolean like the
  // string "true" would otherwise silently save as the opposite of what its
  // own type suggests instead of failing loudly.
  if (body.emphasized !== undefined && typeof body.emphasized !== 'boolean') {
    return { error: malformed('emphasized must be a boolean') };
  }

  // No CHECK and no format rule stands behind these, so a number sent for a
  // title would otherwise be saved, and published, as it was sent.
  for (const field of ['title', 'place', 'supplement', 'memo'] as const) {
    if (body[field] !== undefined && body[field] !== null && typeof body[field] !== 'string') {
      return { error: malformed(`${field} must be a string or null`) };
    }
  }

  return {
    datePrecision: (body.datePrecision as string) ?? null,
    startDate: (body.startDate as string) ?? null,
    startsAt: (body.startsAt as string | null) ?? null,
    endDate: (body.endDate as string | null) ?? null,
    kind: (body.kind as string) ?? null,
    emphasized: (body.emphasized as boolean | undefined) ?? false,
    title: (body.title as string) ?? '',
    place: (body.place as string | null) ?? null,
    supplement: (body.supplement as string | null) ?? null,
    videoId: (body.videoId as string | null) ?? null,
    memo: (body.memo as string | null) ?? null,
    // Deduped here, once, rather than left for memberStatements to insert
    // twice: footprints_event_member's primary key is (event_id, channel_id),
    // so a repeated id would otherwise fail the whole batch with a
    // constraint error instead of a 400.
    channelIds: [...new Set(channelIds as string[])],
    leadChannelIds: [...new Set(leadChannelIds as string[])],
    sources: (sources as { url: string; title?: string | null }[]).map((source) => ({
      url: source.url,
      title: source.title ?? null,
    })),
  };
}

/** Every channelId in `channelIds` that `channel` has no row for. */
async function unknownChannelIds(env: Env, channelIds: readonly string[]): Promise<string[]> {
  const ids = [...new Set(channelIds)];

  const rows = await queryInChunks(ids, async (chunk) => {
    const placeholders = chunk.map((_, index) => `?${index + 1}`).join(', ');
    const { results } = await env.DB.prepare(`SELECT channel_id FROM channel WHERE channel_id IN (${placeholders})`)
      .bind(...chunk)
      .all<{ channel_id: string }>();

    return results;
  });

  const known = new Set(rows.map((row) => row.channel_id));

  return ids.filter((id) => !known.has(id));
}

/**
 * Everything createEvent and updateEvent both check before touching D1:
 * shape (readEventFields), then format (eventFieldsProblem), then whether
 * every member actually exists.
 */
export async function validatedFields(
  env: Env,
  body: Record<string, unknown>,
): Promise<EventFields | { error: Response }> {
  const fields = readEventFields(body);

  if ('error' in fields) return { error: refuse(400, fields.error) };

  const problem = eventFieldsProblem(fields);

  if (problem !== null) return { error: refuse(400, problem) };

  const unknown = await unknownChannelIds(env, fields.channelIds);

  if (unknown.length > 0) {
    return {
      error: refuse(
        400,
        refusal('関わったメンバーに一覧にないメンバーが含まれています', `unknown channelIds: ${unknown.join(', ')}`),
      ),
    };
  }

  return fields;
}

/**
 * Member and source rows for an event that already has its row. Inserted
 * only while that row is still there - and still as `SaveOptions` asks:
 * each of `still` is null for no condition, as `stillAsRead` reads them.
 * An event deleted between the caller's read and its batch would otherwise fail the whole batch on the foreign key, and a publish
 * with it, after the public JSON was already written, instead of letting the
 * batch end with no revision logged (publishing.ts).
 */
function memberStatements(env: Env, eventId: number, fields: EventFields, still: StillAsRead): D1PreparedStatement[] {
  return fields.channelIds.map((channelId) =>
    env.DB.prepare(
      `INSERT INTO footprints_event_member (event_id, channel_id, lead)
       SELECT ?1, ?2, ?3
        WHERE EXISTS (SELECT 1 FROM footprints_event WHERE event_id = ?1 AND ${stillAsRead(4)})`,
    ).bind(eventId, channelId, fields.leadChannelIds.includes(channelId) ? 1 : 0, ...still),
  );
}

function sourceStatements(
  env: Env,
  eventId: number,
  sources: readonly SourceRow[],
  still: StillAsRead,
): D1PreparedStatement[] {
  return sources.map((source, index) =>
    env.DB.prepare(
      `INSERT INTO footprints_event_source (event_id, position, url, title)
       SELECT ?1, ?2, ?3, ?4
        WHERE EXISTS (SELECT 1 FROM footprints_event WHERE event_id = ?1 AND ${stillAsRead(5)})`,
    ).bind(eventId, index + 1, source.url, source.title, ...still),
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
function memberStatementsForNewEvent(env: Env, fields: EventFields): D1PreparedStatement[] {
  return fields.channelIds.map((channelId) =>
    env.DB.prepare(
      'INSERT INTO footprints_event_member (event_id, channel_id, lead) VALUES (last_insert_rowid(), ?1, ?2)',
    ).bind(channelId, fields.leadChannelIds.includes(channelId) ? 1 : 0),
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
          video_id, status, memo)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 'draft', ?11)`,
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
      fields.memo,
    ),
    ...memberStatementsForNewEvent(env, fields),
    ...sourceStatementsForNewEvent(env, fields.sources),
  ]);

  const eventId = results[0].meta.last_row_id;
  const saved = await readEvent(env, eventId);

  return jsonResponse({ event: present(saved!) }, { status: 201 });
}

/**
 * What `saveStatements` sets and expects, as subscriber-milestones.ts's
 * `SaveOptions` is for a milestone: the `status` to give the row, and what
 * the row must still be for anything to be written. Every condition is
 * checked against the row as it was before the batch: the member and source
 * statements run before the row's own, so a status the row is given cannot
 * answer them.
 *
 * - `whileStatus`: a save that read the row as a draft passes `'draft'`, so a
 *   publish that landed in between is not written over with no revision
 * - `whileRevision`: the event's newest revision, 0 for none, as the caller
 *   saw it before reading the row. A save that lands late - after its public
 *   JSON could not be written - then writes nothing over a publish or
 *   withdrawal recorded in between, even one that left the status as it was
 * - `whileVersion`: the `edit_version` the screen read the row at (#307),
 *   which every save adds 1 to. Another screen's save in between - a draft's
 *   too, which logs no revision - is then not written over
 */
export interface SaveOptions {
  status?: EventStatus;
  whileStatus?: EventStatus;
  whileRevision?: number;
  whileVersion?: number;
  /** A published row's save that logs no revision: adds lib/edit-version.ts's `UNLOGGED_VERSION_STEP` to `edit_version`. */
  unlogged?: boolean;
}

export type EventStatus = 'draft' | 'published';

/** `SaveOptions`' conditions as `stillAsRead` binds them: status, revision and version, each null for none. */
type StillAsRead = readonly [string | null, number | null, number | null];

function stillAsReadValues(options: SaveOptions): StillAsRead {
  return [options.whileStatus ?? null, options.whileRevision ?? null, options.whileVersion ?? null];
}

/**
 * The condition, in `saveStatements`' statements over a `footprints_event`
 * row, that the row is still as `SaveOptions` asks, read from the
 * `StillAsRead` bound from `?first` on. The key is cast from the row's own
 * column, for the reason subscriber-milestones.ts's `stillAsRead` gives.
 */
function stillAsRead(first: number): string {
  const [status, revision, version] = [`?${first}`, `?${first + 1}`, `?${first + 2}`];

  return `(${status} IS NULL OR footprints_event.status = ${status})
          AND (${revision} IS NULL
               OR (SELECT COALESCE(MAX(revision_id), 0) FROM revision
                    WHERE entity = 'footprints_event'
                      AND entity_key = CAST(footprints_event.event_id AS TEXT)) = ${revision})
          AND (${version} IS NULL OR footprints_event.edit_version = ${version})`;
}

/** The newest revision of event `eventId`, or 0 when it has none: `SaveOptions.whileRevision`. */
export async function newestRevisionOf(env: Env, eventId: number): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT COALESCE(MAX(revision_id), 0) AS revision_id FROM revision
      WHERE entity = 'footprints_event' AND entity_key = ?1`,
  )
    .bind(String(eventId))
    .first<{ revision_id: number }>();

  return row!.revision_id;
}

/**
 * The statements that save `fields` over event `eventId`'s members, sources
 * and row (see `SaveOptions`), the row's own last. A plain draft save
 * (`updateEvent`) and footprints-publish.ts's publishing both run these, the
 * latter in the same batch as the revision it logs.
 */
export function saveStatements(
  env: Env,
  eventId: number,
  fields: EventFields,
  options: SaveOptions = {},
): D1PreparedStatement[] {
  const still = stillAsReadValues(options);

  return [
    env.DB.prepare(
      `DELETE FROM footprints_event_member
        WHERE event_id = ?1
          AND EXISTS (SELECT 1 FROM footprints_event WHERE event_id = ?1 AND ${stillAsRead(2)})`,
    ).bind(eventId, ...still),
    env.DB.prepare(
      `DELETE FROM footprints_event_source
        WHERE event_id = ?1
          AND EXISTS (SELECT 1 FROM footprints_event WHERE event_id = ?1 AND ${stillAsRead(2)})`,
    ).bind(eventId, ...still),
    ...memberStatements(env, eventId, fields, still),
    ...sourceStatements(env, eventId, fields.sources, still),
    env.DB.prepare(
      `UPDATE footprints_event
          SET date_precision = ?1, start_date = ?2, starts_at = ?3, end_date = ?4, kind = ?5, emphasized = ?6,
              title = ?7, place = ?8, supplement = ?9, video_id = ?10, memo = ?11,
              status = COALESCE(?12, status), edit_version = edit_version + ${options.unlogged === true ? UNLOGGED_VERSION_STEP : 1},
              updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
        WHERE event_id = ?13 AND ${stillAsRead(14)}`,
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
      fields.memo,
      options.status ?? null,
      eventId,
      ...still,
    ),
  ];
}

/**
 * Whether `saveStatements`' batch - those statements alone - wrote the row:
 * false when it was gone, or no longer as `SaveOptions` asked.
 */
export function savedRow(results: readonly D1Result[]): boolean {
  return results[results.length - 1]!.meta.changes > 0;
}

/** The answer when a save that read the row as a draft found it published by then. */
export function noLongerDraftResponse(eventId: number): Response {
  return changedElsewhereResponse(`footprints event ${eventId} is no longer a draft`);
}

/** The answer when a draft's save found it saved by another screen since the version it was read at (#307). */
export function savedElsewhereResponse(eventId: number): Response {
  return changedElsewhereResponse(`footprints event ${eventId} was saved by another screen meanwhile`);
}

/**
 * `saved` as it would read with `fields` saved over it and `status` set -
 * what publishing checks and logs before anything is written, so a live row
 * that would fail is refused without being saved. The timestamps are left as
 * they were: nothing built from this reads them.
 */
export function withFields(
  saved: FootprintsEvent,
  fields: EventFields,
  status: 'draft' | 'published',
): FootprintsEvent {
  return {
    event: {
      ...saved.event,
      date_precision: fields.datePrecision,
      start_date: fields.startDate,
      starts_at: fields.startsAt,
      end_date: fields.endDate,
      kind: fields.kind,
      emphasized: fields.emphasized ? 1 : 0,
      title: fields.title,
      place: fields.place,
      supplement: fields.supplement,
      video_id: fields.videoId,
      status,
      memo: fields.memo,
    },
    // Sorted as readEvent reads them back, so the answer reads the same
    // either way.
    channelIds: [...fields.channelIds].sort(),
    leadChannelIds: [...fields.leadChannelIds].sort(),
    sources: fields.sources,
  };
}

/**
 * Saves a draft's fields. Replaces members and sources along with the row;
 * `status` is left untouched, and no `revision` is logged, same as
 * createEvent. A published event's save reaches the public site, and that
 * is footprints-publish.ts's `saveEvent`. 409, and nothing written, when the
 * row was published between the read and the write.
 */
export async function updateEvent(env: Env, eventId: number, body: Record<string, unknown>): Promise<Response> {
  const existing = await readEvent(env, eventId);

  if (existing === null) return noEventResponse(eventId);

  const held = heldToVersion(body, existing.event.edit_version, `footprints event ${eventId}`);

  if ('error' in held) return held.error;

  const fields = await validatedFields(env, body);

  if ('error' in fields) return fields.error;

  if (existing.event.status !== 'draft') return noLongerDraftResponse(eventId);

  const results = await env.DB.batch(saveStatements(env, eventId, fields, { whileStatus: 'draft', ...held }));
  const saved = await readEvent(env, eventId);

  if (saved === null) return noEventResponse(eventId);
  if (!savedRow(results)) {
    return saved.event.status === 'draft' ? savedElsewhereResponse(eventId) : noLongerDraftResponse(eventId);
  }

  return jsonResponse({ event: present(saved) });
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
 * Also 409 while a subscriber milestone links to the event (#225).
 *
 * Deleted only while it is still a draft when the batch runs, members and
 * sources too: a 「公開」 that lands between the read and the delete would
 * otherwise leave its revision and its public entry with no row to withdraw
 * them from.
 */
export async function deleteEvent(env: Env, eventId: number): Promise<Response> {
  const existing = await readEvent(env, eventId);

  if (existing === null) return noEventResponse(eventId);

  if (existing.event.status === 'published') {
    return changedElsewhereResponse('withdraw this event before deleting it', 'remove');
  }

  // subscriber_milestone.event_id is a foreign key to this row, so the
  // DELETE below would fail on it as a 500. Answered here instead, the same
  // way genet-tunes.ts refuses to delete a tune a stream still performs.
  const linked = await env.DB.prepare('SELECT milestone_id FROM subscriber_milestone WHERE event_id = ?1 LIMIT 1')
    .bind(eventId)
    .first<{ milestone_id: number }>();

  if (linked !== null) {
    return refuse(
      409,
      refusal(
        '登録者数の節目とつながっているため削除できませんでした',
        `subscriber milestone ${linked.milestone_id} links to this event; unlink it there first`,
      ),
    );
  }

  const results = await env.DB.batch([
    env.DB.prepare(
      `DELETE FROM footprints_event_member
        WHERE event_id = ?1
          AND EXISTS (SELECT 1 FROM footprints_event WHERE event_id = ?1 AND status = 'draft')`,
    ).bind(eventId),
    env.DB.prepare(
      `DELETE FROM footprints_event_source
        WHERE event_id = ?1
          AND EXISTS (SELECT 1 FROM footprints_event WHERE event_id = ?1 AND status = 'draft')`,
    ).bind(eventId),
    env.DB.prepare(`DELETE FROM footprints_event WHERE event_id = ?1 AND status = 'draft'`).bind(eventId),
  ]);

  if (results[2]!.meta.changes === 0) {
    if ((await readEvent(env, eventId)) === null) return noEventResponse(eventId);

    return changedElsewhereResponse('withdraw this event before deleting it', 'remove');
  }

  // {} rather than 204: every other answer in this API is JSON, and this one
  // has nothing more to say than "done" - no row survives to echo back, and
  // no revisionId either, since this delete logs none.
  return jsonResponse({});
}
