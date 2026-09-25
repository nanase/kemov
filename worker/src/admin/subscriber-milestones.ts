import { queryInChunks } from '../lib/d1';
import type { Env } from '../lib/env';
import { errorResponse, jsonResponse } from '../lib/json';
import { isSchemaDate, isSchemaMonth } from '../lib/time';

/**
 * Reading, saving and deleting `subscriber_milestone` (#225): a subscriber
 * count a member, the project or a listener announced, recorded by hand with
 * its sources. Publishing - the check that lets a row into the public JSON,
 * and the only point a save logs a `revision` - is
 * subscriber-milestones-publish.ts, the same split footprints.ts and
 * footprints-publish.ts make.
 */

const DATE_PRECISIONS = ['day', 'month'] as const;

/** Who announced the number. A listener's source URLs never reach the public JSON. */
export const ANNOUNCERS = ['member', 'official', 'listener'] as const;

export interface MilestoneRow {
  milestone_id: number;
  channel_id: string;
  date_precision: string;
  reached_date: string;
  subscriber_count: number;
  announced_by: string;
  event_id: number | null;
  status: string;
  memo: string | null;
  created_at: string;
  updated_at: string;
}

export interface SourceRow {
  url: string;
  title: string | null;
}

/** One milestone with its sources, as saved. */
export interface SubscriberMilestone {
  milestone: MilestoneRow;
  sources: SourceRow[];
}

const MILESTONE_COLUMNS = `milestone_id, channel_id, date_precision, reached_date, subscriber_count, announced_by,
       event_id, status, memo, created_at, updated_at`;

export function present(saved: SubscriberMilestone) {
  const { milestone } = saved;

  return {
    milestoneId: milestone.milestone_id,
    channelId: milestone.channel_id,
    datePrecision: milestone.date_precision,
    reachedDate: milestone.reached_date,
    subscriberCount: milestone.subscriber_count,
    announcedBy: milestone.announced_by,
    eventId: milestone.event_id,
    status: milestone.status,
    memo: milestone.memo,
    createdAt: milestone.created_at,
    updatedAt: milestone.updated_at,
    sources: saved.sources.map((source) => ({ url: source.url, title: source.title })),
  };
}

/**
 * What a `publish` revision's `body` holds, and what a working row is
 * compared against to answer "changed since it was published".
 *
 * Unlike footprints' own `publicShapeOf`, this is not yet the public shape:
 * it keeps a listener's source URLs, which subscriber-milestones-publish.ts
 * drops only when it builds the public JSON, and it names the linked event by
 * id alone, which the build replaces with the event as it is live at that
 * moment. The revision is the admin site's history of what was decided, and
 * the URL is part of that.
 */
export function publishedBodyOf(saved: SubscriberMilestone) {
  const { milestone } = saved;

  return {
    milestone_id: milestone.milestone_id,
    channel_id: milestone.channel_id,
    date_precision: milestone.date_precision,
    reached_date: milestone.reached_date,
    subscriber_count: milestone.subscriber_count,
    announced_by: milestone.announced_by,
    event_id: milestone.event_id,
    sources: saved.sources.map((source) => ({ url: source.url, title: source.title })),
  };
}

export async function readMilestone(env: Env, milestoneId: number): Promise<SubscriberMilestone | null> {
  const [milestone, sources] = await Promise.all([
    env.DB.prepare(`SELECT ${MILESTONE_COLUMNS} FROM subscriber_milestone WHERE milestone_id = ?1`)
      .bind(milestoneId)
      .first<MilestoneRow>(),
    env.DB.prepare('SELECT url, title FROM subscriber_milestone_source WHERE milestone_id = ?1 ORDER BY position')
      .bind(milestoneId)
      .all<SourceRow>(),
  ]);

  if (milestone === null) return null;

  return { milestone, sources: sources.results };
}

/** `readMilestone` for several ids at once, keyed by milestone_id - two queries per chunk of ids rather than two per id. */
export async function readMilestones(
  env: Env,
  milestoneIds: readonly number[],
): Promise<Map<number, SubscriberMilestone>> {
  const [milestoneRows, sourceRows] = await Promise.all([
    queryInChunks(milestoneIds, async (chunk) => {
      const placeholders = chunk.map((_, index) => `?${index + 1}`).join(', ');
      const { results } = await env.DB.prepare(
        `SELECT ${MILESTONE_COLUMNS} FROM subscriber_milestone WHERE milestone_id IN (${placeholders})`,
      )
        .bind(...chunk)
        .all<MilestoneRow>();

      return results;
    }),
    queryInChunks(milestoneIds, async (chunk) => {
      const placeholders = chunk.map((_, index) => `?${index + 1}`).join(', ');
      const { results } = await env.DB.prepare(
        `SELECT milestone_id, url, title FROM subscriber_milestone_source
          WHERE milestone_id IN (${placeholders}) ORDER BY milestone_id, position`,
      )
        .bind(...chunk)
        .all<{ milestone_id: number } & SourceRow>();

      return results;
    }),
  ]);

  const result = new Map<number, SubscriberMilestone>(
    milestoneRows.map((milestone) => [milestone.milestone_id, { milestone, sources: [] }]),
  );

  for (const { milestone_id: milestoneId, ...source } of sourceRows) {
    result.get(milestoneId)?.sources.push(source);
  }

  return result;
}

function isStatus(value: unknown): value is 'draft' | 'review' | 'published' {
  return value === 'draft' || value === 'review' || value === 'published';
}

/** GET /admin/api/subscribers/milestones - optionally narrowed by channel and by status. Oldest first. */
export async function listMilestones(env: Env, channelId: string | null, status: string | null): Promise<Response> {
  if (status !== null && !isStatus(status)) {
    return errorResponse(400, 'status must be one of draft, review, published');
  }

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (channelId !== null) {
    params.push(channelId);
    conditions.push(`channel_id = ?${params.length}`);
  }

  if (status !== null) {
    params.push(status);
    conditions.push(`status = ?${params.length}`);
  }

  const where = conditions.length === 0 ? '' : `WHERE ${conditions.join(' AND ')}`;

  const { results } = await env.DB.prepare(
    `SELECT milestone_id FROM subscriber_milestone ${where} ORDER BY reached_date, milestone_id`,
  )
    .bind(...params)
    .all<{ milestone_id: number }>();

  const byId = await readMilestones(
    env,
    results.map((row) => row.milestone_id),
  );

  // flatMap for the same reason footprints.ts's listEvents gives: a row can
  // be deleted between the SELECT above and readMilestones.
  return jsonResponse({
    milestones: results.flatMap((row) => {
      const saved = byId.get(row.milestone_id);

      return saved === undefined ? [] : [present(saved)];
    }),
  });
}

/** GET /admin/api/subscribers/milestones/:milestoneId. 404 when there is no such milestone. */
export async function getMilestone(env: Env, milestoneId: number): Promise<Response> {
  const saved = await readMilestone(env, milestoneId);

  if (saved === null) return errorResponse(404, `no subscriber milestone ${milestoneId}`);

  return jsonResponse(present(saved));
}

export interface MilestoneFields {
  channelId: string;
  datePrecision: string;
  reachedDate: string;
  subscriberCount: number;
  announcedBy: string;
  eventId: number | null;
  memo: string | null;
  sources: SourceRow[];
}

/**
 * Reads the fields a POST or PUT body carries - a full replace, the same
 * reading footprints.ts's `readEventFields` gives an event: a field left out
 * is null (or `[]` for `sources`), and the checks below then refuse it where
 * the column cannot be null.
 */
function readMilestoneFields(body: Record<string, unknown>): MilestoneFields | { error: string } {
  const sources = body.sources ?? [];

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

  if (typeof body.channelId !== 'string') return { error: 'channelId must be a string' };
  if (typeof body.datePrecision !== 'string') return { error: 'datePrecision must be day or month' };
  if (typeof body.reachedDate !== 'string') return { error: 'reachedDate must be a string' };

  if (typeof body.subscriberCount !== 'number' || !Number.isSafeInteger(body.subscriberCount)) {
    return { error: 'subscriberCount must be an integer' };
  }

  if (typeof body.announcedBy !== 'string') return { error: `announcedBy must be one of ${ANNOUNCERS.join(', ')}` };

  const eventId = body.eventId ?? null;

  if (eventId !== null && (typeof eventId !== 'number' || !Number.isSafeInteger(eventId))) {
    return { error: 'eventId must be an integer or null' };
  }

  const memo = body.memo ?? null;

  if (memo !== null && typeof memo !== 'string') return { error: 'memo must be a string or null' };

  return {
    channelId: body.channelId,
    datePrecision: body.datePrecision,
    reachedDate: body.reachedDate,
    subscriberCount: body.subscriberCount,
    announcedBy: body.announcedBy,
    eventId,
    memo,
    sources: (sources as { url: string; title?: string | null }[]).map((source) => ({
      url: source.url,
      title: source.title ?? null,
    })),
  };
}

/**
 * What is wrong with the fields, or null when they are fine - the schema's
 * own CHECKs, checked here too so that a mistake is a 400 with a reason
 * rather than a raw constraint failure. What only publishing asks for (a
 * source that is enough) is subscriber-milestones-publish.ts's to check: a
 * draft still being worked out may lack it.
 */
function milestoneFieldsProblem(fields: MilestoneFields): string | null {
  if (!(DATE_PRECISIONS as readonly string[]).includes(fields.datePrecision)) {
    return 'datePrecision must be day or month';
  }

  const reachedOk =
    fields.datePrecision === 'day' ? isSchemaDate(fields.reachedDate) : isSchemaMonth(fields.reachedDate);

  if (!reachedOk) return `reachedDate must be ${fields.datePrecision === 'day' ? 'YYYY-MM-DD' : 'YYYY-MM'}`;

  if (fields.subscriberCount <= 0) return 'subscriberCount must be greater than 0';

  if (!(ANNOUNCERS as readonly string[]).includes(fields.announcedBy)) {
    return `announcedBy must be one of ${ANNOUNCERS.join(', ')}`;
  }

  for (const source of fields.sources) {
    if (!source.url.startsWith('https://')) return 'every source url must start with https://';
    // The schema's CHECK looks at the prefix alone, so `https://` by itself
    // would save, and count towards nothing but still reach the public JSON.
    if (!hasHost(source.url)) return 'every source url must be a valid https URL';
  }

  return null;
}

function hasHost(url: string): boolean {
  try {
    return new URL(url).hostname !== '';
  } catch {
    return false;
  }
}

/**
 * Why `eventId` cannot be linked, or null when it can (or is null). Only a
 * footprints event of kind `milestone` - the celebration of the number - is
 * one a milestone may point at (#225's design).
 */
export async function eventLinkProblem(env: Env, eventId: number | null): Promise<string | null> {
  if (eventId === null) return null;

  const event = await env.DB.prepare('SELECT kind FROM footprints_event WHERE event_id = ?1')
    .bind(eventId)
    .first<{ kind: string }>();

  if (event === null) return `no footprints event ${eventId}`;
  if (event.kind !== 'milestone') return `footprints event ${eventId} is not a milestone`;

  return null;
}

/** Everything createMilestone and updateMilestone both check before touching D1. */
async function validatedFields(
  env: Env,
  body: Record<string, unknown>,
): Promise<MilestoneFields | { error: Response }> {
  const fields = readMilestoneFields(body);

  if ('error' in fields) return { error: errorResponse(400, fields.error) };

  const problem = milestoneFieldsProblem(fields);

  if (problem !== null) return { error: errorResponse(400, problem) };

  const channel = await env.DB.prepare('SELECT 1 AS found FROM channel WHERE channel_id = ?1')
    .bind(fields.channelId)
    .first<{ found: number }>();

  if (channel === null) return { error: errorResponse(400, `unknown channelId: ${fields.channelId}`) };

  const linkProblem = await eventLinkProblem(env, fields.eventId);

  if (linkProblem !== null) return { error: errorResponse(400, linkProblem) };

  return fields;
}

function sourceStatements(env: Env, milestoneId: number, sources: readonly SourceRow[]): D1PreparedStatement[] {
  return sources.map((source, index) =>
    env.DB.prepare(
      'INSERT INTO subscriber_milestone_source (milestone_id, position, url, title) VALUES (?1, ?2, ?3, ?4)',
    ).bind(milestoneId, index + 1, source.url, source.title),
  );
}

/**
 * Source statements for the row the same batch's first statement inserts.
 * `subscriber_milestone_source` is `WITHOUT ROWID`, so inserting into it never
 * moves what `last_insert_rowid()` reports - see footprints.ts's
 * `memberStatementsForNewEvent`.
 */
function sourceStatementsForNewMilestone(env: Env, sources: readonly SourceRow[]): D1PreparedStatement[] {
  return sources.map((source, index) =>
    env.DB.prepare(
      'INSERT INTO subscriber_milestone_source (milestone_id, position, url, title) VALUES (last_insert_rowid(), ?1, ?2, ?3)',
    ).bind(index + 1, source.url, source.title),
  );
}

/** POST /admin/api/subscribers/milestones. Always creates in `draft`, and logs no `revision`. */
export async function createMilestone(env: Env, body: Record<string, unknown>): Promise<Response> {
  const fields = await validatedFields(env, body);

  if ('error' in fields) return fields.error;

  const results = await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO subscriber_milestone
         (channel_id, date_precision, reached_date, subscriber_count, announced_by, event_id, status, memo, created_via)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'draft', ?7, 'admin')`,
    ).bind(
      fields.channelId,
      fields.datePrecision,
      fields.reachedDate,
      fields.subscriberCount,
      fields.announcedBy,
      fields.eventId,
      fields.memo,
    ),
    ...sourceStatementsForNewMilestone(env, fields.sources),
  ]);

  const saved = await readMilestone(env, results[0].meta.last_row_id);

  return jsonResponse({ milestone: present(saved!) }, { status: 201 });
}

/**
 * PUT /admin/api/subscribers/milestones/:milestoneId. Replaces the sources
 * along with the row; `status` is left untouched, and no `revision` is
 * logged - publishing is its own operation, as for an event.
 */
export async function updateMilestone(env: Env, milestoneId: number, body: Record<string, unknown>): Promise<Response> {
  const existing = await readMilestone(env, milestoneId);

  if (existing === null) return errorResponse(404, `no subscriber milestone ${milestoneId}`);

  const fields = await validatedFields(env, body);

  if ('error' in fields) return fields.error;

  await env.DB.batch([
    env.DB.prepare(
      `UPDATE subscriber_milestone
          SET channel_id = ?1, date_precision = ?2, reached_date = ?3, subscriber_count = ?4, announced_by = ?5,
              event_id = ?6, memo = ?7, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
        WHERE milestone_id = ?8`,
    ).bind(
      fields.channelId,
      fields.datePrecision,
      fields.reachedDate,
      fields.subscriberCount,
      fields.announcedBy,
      fields.eventId,
      fields.memo,
      milestoneId,
    ),
    env.DB.prepare('DELETE FROM subscriber_milestone_source WHERE milestone_id = ?1').bind(milestoneId),
    ...sourceStatements(env, milestoneId, fields.sources),
  ]);

  const saved = await readMilestone(env, milestoneId);

  return jsonResponse({ milestone: present(saved!) });
}

/**
 * DELETE /admin/api/subscribers/milestones/:milestoneId. 404 when there is no
 * such milestone, 409 when it is `published` - the public JSON is built from
 * `revision`, so a published row has to be withdrawn first for the next
 * publish to leave it out, the same reasoning footprints.ts's deleteEvent
 * gives.
 */
export async function deleteMilestone(env: Env, milestoneId: number): Promise<Response> {
  const existing = await readMilestone(env, milestoneId);

  if (existing === null) return errorResponse(404, `no subscriber milestone ${milestoneId}`);

  if (existing.milestone.status === 'published') {
    return errorResponse(409, 'withdraw this milestone before deleting it');
  }

  await env.DB.batch([
    env.DB.prepare('DELETE FROM subscriber_milestone_source WHERE milestone_id = ?1').bind(milestoneId),
    env.DB.prepare('DELETE FROM subscriber_milestone WHERE milestone_id = ?1').bind(milestoneId),
  ]);

  return jsonResponse({});
}
