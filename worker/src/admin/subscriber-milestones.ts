import { queryInChunks } from '../lib/d1';
import type { Env } from '../lib/env';
import { changedElsewhereResponse, jsonResponse } from '../lib/json';
import { LOAD_FAILED, malformed, MEMBER_NOT_FOUND_TEXT, refusal, refuse, type Refusal } from '../lib/refusal';
import { sourceUrlProblem } from '../lib/source-whitelist';
import { isSchemaDate, isSchemaMonth } from '../lib/time';
import { heldToVersion, UNLOGGED_VERSION_STEP } from '../lib/edit-version';

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
  edit_version: number;
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
       event_id, status, memo, created_at, updated_at, edit_version`;

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
    version: milestone.edit_version,
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

// `review` (確認中) is gone since #283; migration 0015 made every such row a
// draft, though the table's CHECK still allows it.
function isStatus(value: unknown): value is 'draft' | 'published' {
  return value === 'draft' || value === 'published';
}

/** GET /admin/api/subscribers/milestones - optionally narrowed by channel and by status. Oldest first. */
export async function listMilestones(env: Env, channelId: string | null, status: string | null): Promise<Response> {
  if (status !== null && !isStatus(status)) {
    return refuse(400, refusal(LOAD_FAILED, 'status must be one of draft, published'));
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

/** The 404 for a milestone that is not there - gone, or never was. */
export function noMilestoneResponse(milestoneId: number | string): Response {
  return refuse(404, refusal('この節目が見つかりません', `no subscriber milestone ${milestoneId}`));
}

/** GET /admin/api/subscribers/milestones/:milestoneId. 404 when there is no such milestone. */
export async function getMilestone(env: Env, milestoneId: number): Promise<Response> {
  const saved = await readMilestone(env, milestoneId);

  if (saved === null) return noMilestoneResponse(milestoneId);

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
function readMilestoneFields(body: Record<string, unknown>): MilestoneFields | { error: Refusal } {
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
    return { error: malformed('sources must be an array of { url, title }') };
  }

  if (typeof body.channelId !== 'string') return { error: malformed('channelId must be a string') };
  if (typeof body.datePrecision !== 'string') return { error: malformed('datePrecision must be day or month') };
  if (typeof body.reachedDate !== 'string') return { error: malformed('reachedDate must be a string') };

  if (typeof body.subscriberCount !== 'number' || !Number.isSafeInteger(body.subscriberCount)) {
    return { error: refusal('人数の形式が正しくありません', 'subscriberCount must be an integer') };
  }

  if (typeof body.announcedBy !== 'string')
    return { error: malformed(`announcedBy must be one of ${ANNOUNCERS.join(', ')}`) };

  const eventId = body.eventId ?? null;

  if (eventId !== null && (typeof eventId !== 'number' || !Number.isSafeInteger(eventId))) {
    return { error: malformed('eventId must be an integer or null') };
  }

  const memo = body.memo ?? null;

  if (memo !== null && typeof memo !== 'string') return { error: malformed('memo must be a string or null') };

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
function milestoneFieldsProblem(fields: MilestoneFields): Refusal | null {
  if (!(DATE_PRECISIONS as readonly string[]).includes(fields.datePrecision)) {
    return malformed('datePrecision must be day or month');
  }

  const reachedOk =
    fields.datePrecision === 'day' ? isSchemaDate(fields.reachedDate) : isSchemaMonth(fields.reachedDate);

  if (!reachedOk) {
    return refusal(
      '達成の日の形式が正しくありません',
      `reachedDate must be ${fields.datePrecision === 'day' ? 'YYYY-MM-DD' : 'YYYY-MM'}`,
    );
  }

  if (fields.subscriberCount <= 0) {
    return refusal('人数は 1 以上にしてください', 'subscriberCount must be greater than 0');
  }

  if (!(ANNOUNCERS as readonly string[]).includes(fields.announcedBy)) {
    return malformed(`announcedBy must be one of ${ANNOUNCERS.join(', ')}`);
  }

  for (const source of fields.sources) {
    const problem = sourceUrlProblem(source.url);

    if (problem !== null) return problem;
  }

  return null;
}

/**
 * Why `eventId` cannot be linked, or null when it can (or is null). Only a
 * footprints event of kind `milestone` - the celebration of the number - is
 * one a milestone may point at (#225's design).
 */
async function eventLinkProblem(env: Env, eventId: number | null): Promise<Refusal | null> {
  if (eventId === null) return null;

  const event = await env.DB.prepare('SELECT kind FROM footprints_event WHERE event_id = ?1')
    .bind(eventId)
    .first<{ kind: string }>();

  if (event === null)
    return refusal('つなぐ出来事が見つかりません。選び直してください', `no footprints event ${eventId}`);

  if (event.kind !== 'milestone') {
    return refusal(
      'つなぐ出来事はあしあとの「節目」の出来事から選んでください',
      `footprints event ${eventId} is not a milestone`,
    );
  }

  return null;
}

/**
 * Everything a create, a save and a publish check before touching D1.
 *
 * `keptEventId` is the event the row is linked to already, which
 * 「非公開に戻す」 lets the row keep though the event is no longer a
 * milestone: otherwise an event's kind changed on あしあと would leave a
 * published milestone that cannot be taken off the public site.
 */
export async function validatedFields(
  env: Env,
  body: Record<string, unknown>,
  keptEventId?: number | null,
): Promise<MilestoneFields | { error: Response }> {
  const fields = readMilestoneFields(body);

  if ('error' in fields) return { error: refuse(400, fields.error) };

  const problem = milestoneFieldsProblem(fields);

  if (problem !== null) return { error: refuse(400, problem) };

  const channel = await env.DB.prepare('SELECT 1 AS found FROM channel WHERE channel_id = ?1')
    .bind(fields.channelId)
    .first<{ found: number }>();

  if (channel === null) {
    return { error: refuse(400, refusal(MEMBER_NOT_FOUND_TEXT, `unknown channelId: ${fields.channelId}`)) };
  }

  const linkProblem =
    keptEventId !== undefined && fields.eventId === keptEventId ? null : await eventLinkProblem(env, fields.eventId);

  if (linkProblem !== null) return { error: refuse(400, linkProblem) };

  return fields;
}

/**
 * Source rows for a milestone that already has its row. Inserted only while
 * that row is still there - and still as `SaveOptions` asks, through
 * `still` - for the reason footprints.ts's
 * `memberStatements` gives: a milestone deleted between the caller's read
 * and its batch would otherwise fail the whole batch on the foreign key, a
 * publish with it.
 */
function sourceStatements(
  env: Env,
  milestoneId: number,
  sources: readonly SourceRow[],
  still: StillAsRead,
): D1PreparedStatement[] {
  return sources.map((source, index) =>
    env.DB.prepare(
      `INSERT INTO subscriber_milestone_source (milestone_id, position, url, title)
       SELECT ?1, ?2, ?3, ?4
        WHERE EXISTS (SELECT 1 FROM subscriber_milestone WHERE milestone_id = ?1 AND ${stillAsRead(5)})`,
    ).bind(milestoneId, index + 1, source.url, source.title, ...still),
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
 * What `saveStatements` sets and expects: the `status` to give the row, and
 * what the row must still be for anything to be written. Every condition is
 * checked against the row as it was before the batch: the source statements
 * run before the row's own, so a status the row is given cannot answer them.
 *
 * - `whileStatus`: a save that read the row as a draft passes `'draft'`, so a
 *   publish that landed in between is not written over with no revision: the
 *   first statement then changes nothing, which the caller reads as the row
 *   having moved on
 * - `whileRevision`: the newest revision of the milestone, 0 for none, as the
 *   caller saw it before reading the row. A save that lands late - after its
 *   public JSON could not be written - then writes nothing over a publish or
 *   withdrawal recorded in between, even one that left the status as it was
 * - `whileVersion`: the `edit_version` the screen read the row at (#307),
 *   as footprints.ts's `SaveOptions` has it
 */
export interface SaveOptions {
  status?: MilestoneStatus;
  whileStatus?: MilestoneStatus;
  whileRevision?: number;
  whileVersion?: number;
  /** A published row's save that logs no revision: adds publishing.ts's `UNLOGGED_VERSION_STEP` to `edit_version`. */
  unlogged?: boolean;
}

/** `SaveOptions`' conditions as `stillAsRead` binds them: status, revision and version, each null for none. */
type StillAsRead = readonly [string | null, number | null, number | null];

function stillAsReadValues(options: SaveOptions): StillAsRead {
  return [options.whileStatus ?? null, options.whileRevision ?? null, options.whileVersion ?? null];
}

export type MilestoneStatus = 'draft' | 'published';

/**
 * The condition, in `saveStatements`' statements over a `subscriber_milestone`
 * row, that the row is still as `SaveOptions` asks, read from the
 * `StillAsRead` bound from `?first` on. The key is cast from the row's own
 * column: a number bound from JavaScript reaches D1 as a real, which casts
 * to `'1.0'`.
 */
function stillAsRead(first: number): string {
  const [status, revision, version] = [`?${first}`, `?${first + 1}`, `?${first + 2}`];

  return `(${status} IS NULL OR subscriber_milestone.status = ${status})
          AND (${revision} IS NULL
               OR (SELECT COALESCE(MAX(revision_id), 0) FROM revision
                    WHERE entity = 'subscriber_milestone'
                      AND entity_key = CAST(subscriber_milestone.milestone_id AS TEXT)) = ${revision})
          AND (${version} IS NULL OR subscriber_milestone.edit_version = ${version})`;
}

/** The newest revision of milestone `milestoneId`, or 0 when it has none: `SaveOptions.whileRevision`. */
export async function newestRevisionOf(env: Env, milestoneId: number): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT COALESCE(MAX(revision_id), 0) AS revision_id FROM revision
      WHERE entity = 'subscriber_milestone' AND entity_key = ?1`,
  )
    .bind(String(milestoneId))
    .first<{ revision_id: number }>();

  return row!.revision_id;
}

/**
 * The statements that save `fields` over milestone `milestoneId`'s sources
 * and row (see `SaveOptions`), the row's own last. A plain draft save
 * (`updateMilestone`) and subscriber-milestones-publish.ts's publishing both
 * run these, the latter in the same batch as the revision it logs.
 */
export function saveStatements(
  env: Env,
  milestoneId: number,
  fields: MilestoneFields,
  options: SaveOptions = {},
): D1PreparedStatement[] {
  const still = stillAsReadValues(options);

  return [
    env.DB.prepare(
      `DELETE FROM subscriber_milestone_source
        WHERE milestone_id = ?1
          AND EXISTS (SELECT 1 FROM subscriber_milestone WHERE milestone_id = ?1 AND ${stillAsRead(2)})`,
    ).bind(milestoneId, ...still),
    ...sourceStatements(env, milestoneId, fields.sources, still),
    env.DB.prepare(
      `UPDATE subscriber_milestone
          SET channel_id = ?1, date_precision = ?2, reached_date = ?3, subscriber_count = ?4, announced_by = ?5,
              event_id = ?6, memo = ?7, status = COALESCE(?8, status), edit_version = edit_version + ${options.unlogged === true ? UNLOGGED_VERSION_STEP : 1},
              updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
        WHERE milestone_id = ?9 AND ${stillAsRead(10)}`,
    ).bind(
      fields.channelId,
      fields.datePrecision,
      fields.reachedDate,
      fields.subscriberCount,
      fields.announcedBy,
      fields.eventId,
      fields.memo,
      options.status ?? null,
      milestoneId,
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
export function noLongerDraftResponse(milestoneId: number): Response {
  return changedElsewhereResponse(`subscriber milestone ${milestoneId} is no longer a draft`);
}

/** The answer when a draft's save found it saved by another screen since the version it was read at (#307). */
export function savedElsewhereResponse(milestoneId: number): Response {
  return changedElsewhereResponse(`subscriber milestone ${milestoneId} was saved by another screen meanwhile`);
}

/**
 * `saved` as it would read with `fields` saved over it and `status` set -
 * what publishing checks and logs before anything is written, as
 * footprints.ts's `withFields` is for an event. The timestamps are left as
 * they were: nothing built from this reads them.
 */
export function withFields(
  saved: SubscriberMilestone,
  fields: MilestoneFields,
  status: 'draft' | 'published',
): SubscriberMilestone {
  return {
    milestone: {
      ...saved.milestone,
      channel_id: fields.channelId,
      date_precision: fields.datePrecision,
      reached_date: fields.reachedDate,
      subscriber_count: fields.subscriberCount,
      announced_by: fields.announcedBy,
      event_id: fields.eventId,
      status,
      memo: fields.memo,
    },
    sources: fields.sources,
  };
}

/**
 * Saves a draft's fields. Replaces the sources along with the row; `status`
 * is left untouched, and no `revision` is logged. A published milestone's
 * save reaches the public site, and that is
 * subscriber-milestones-publish.ts's `saveMilestone`. 409, and nothing
 * written, when the row was published between the read and the write.
 */
export async function updateMilestone(env: Env, milestoneId: number, body: Record<string, unknown>): Promise<Response> {
  const existing = await readMilestone(env, milestoneId);

  if (existing === null) return noMilestoneResponse(milestoneId);

  const held = heldToVersion(body, existing.milestone.edit_version, `subscriber milestone ${milestoneId}`);

  if ('error' in held) return held.error;

  const fields = await validatedFields(env, body);

  if ('error' in fields) return fields.error;

  if (existing.milestone.status !== 'draft') return noLongerDraftResponse(milestoneId);

  const results = await env.DB.batch(saveStatements(env, milestoneId, fields, { whileStatus: 'draft', ...held }));
  const saved = await readMilestone(env, milestoneId);

  if (saved === null) return noMilestoneResponse(milestoneId);

  if (!savedRow(results)) {
    return saved.milestone.status === 'draft'
      ? savedElsewhereResponse(milestoneId)
      : noLongerDraftResponse(milestoneId);
  }

  return jsonResponse({ milestone: present(saved) });
}

/**
 * DELETE /admin/api/subscribers/milestones/:milestoneId. 404 when there is no
 * such milestone, 409 when it is `published`: it is on the public site,
 * and 「非公開に戻す」 is what takes it off, the same reasoning
 * footprints.ts's deleteEvent gives.
 *
 * Deleted only while it is still a draft when the batch runs: a 「公開」 that
 * lands between the read and the delete would otherwise leave its revision
 * and its public entry with no row to withdraw them from.
 */
export async function deleteMilestone(env: Env, milestoneId: number): Promise<Response> {
  const existing = await readMilestone(env, milestoneId);

  if (existing === null) return noMilestoneResponse(milestoneId);

  if (existing.milestone.status === 'published') {
    return changedElsewhereResponse('withdraw this milestone before deleting it', 'remove');
  }

  const results = await env.DB.batch([
    env.DB.prepare(
      `DELETE FROM subscriber_milestone_source
        WHERE milestone_id = ?1
          AND EXISTS (SELECT 1 FROM subscriber_milestone WHERE milestone_id = ?1 AND status = 'draft')`,
    ).bind(milestoneId),
    env.DB.prepare(`DELETE FROM subscriber_milestone WHERE milestone_id = ?1 AND status = 'draft'`).bind(milestoneId),
  ]);

  if (results[1]!.meta.changes === 0) {
    if ((await readMilestone(env, milestoneId)) === null) return noMilestoneResponse(milestoneId);

    return changedElsewhereResponse('withdraw this milestone before deleting it', 'remove');
  }

  return jsonResponse({});
}

// Kept where it was first exported: the rule itself lives in
// src/admin/lib/source-check.ts, which あしあと's judgement uses too.
export { sourceUrlProblem };
