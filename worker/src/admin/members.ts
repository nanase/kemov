import { readEditableBody } from '../lib/editable-body';
import type { Env } from '../lib/env';
import { errorResponse, jsonResponse } from '../lib/json';
import { revisionStatement } from '../lib/revision';
import { isSchemaDate } from '../lib/time';

/**
 * Reading and saving `channel` (#141's "member"), which #152 made D1's own:
 * this is the only place any of it is written after the first seed. A member
 * is added here (#211), removed only while nothing has been recorded against
 * it, and the display order is set for the whole list at once, never one row
 * at a time - see saveMemberList.
 */

/**
 * `channel`'s own columns, in table order. One list rather than one per
 * concern (the SELECT, the row type, the revision body): the column order
 * the revision body's JSON keys must follow (see revisionBodyOf) is D1's own,
 * so this is also what keeps the three from drifting apart from it.
 */
const MEMBER_COLUMNS = [
  'channel_id',
  'name',
  'fullname',
  'globalname',
  'twitter',
  'color_key',
  'color_sub',
  'color_light',
  'color_back',
  'activity_start_date',
  'activity_end_date',
  'custom_url',
  'thumbnail_url',
  'fetched_at',
  'display_order',
  'twitch',
] as const;

interface MemberRow {
  channel_id: string;
  name: string;
  fullname: string;
  globalname: string | null;
  twitter: string | null;
  color_key: string;
  color_sub: string;
  color_light: string;
  color_back: string;
  activity_start_date: string;
  activity_end_date: string | null;
  custom_url: string | null;
  thumbnail_url: string | null;
  fetched_at: string | null;
  display_order: number;
  twitch: string | null;
}

function present(row: MemberRow) {
  return {
    channelId: row.channel_id,
    name: row.name,
    fullname: row.fullname,
    globalname: row.globalname,
    twitter: row.twitter,
    twitch: row.twitch,
    colorKey: row.color_key,
    colorSub: row.color_sub,
    colorLight: row.color_light,
    colorBack: row.color_back,
    activityStartDate: row.activity_start_date,
    activityEndDate: row.activity_end_date,
    customUrl: row.custom_url,
    thumbnailUrl: row.thumbnail_url,
    fetchedAt: row.fetched_at,
    displayOrder: row.display_order,
  };
}

const SELECT_MEMBERS = `SELECT ${MEMBER_COLUMNS.join(', ')} FROM channel`;

/** GET /admin/api/members */
export async function listMembers(env: Env): Promise<Response> {
  const { results } = await env.DB.prepare(`${SELECT_MEMBERS} ORDER BY display_order, channel_id`).all<MemberRow>();

  return jsonResponse({ members: results.map(present) });
}

/**
 * The columns a PUT may change, in the JSON shape it sends them in.
 *
 * `channel_id` is the URL, not the body, and `custom_url`, `thumbnail_url`
 * and `fetched_at` belong to the collector - see scripts/channels.js's own
 * split between channels.yml's fields and what the collector writes.
 * `display_order` belongs to the list as a whole (saveMemberList): a PUT that
 * carried one row's own would overwrite an order somebody else had just
 * saved. All of them are refused here rather than silently kept, same as any
 * key this object never had.
 */
const EDITABLE_MEMBER_KEYS = [
  'name',
  'fullname',
  'globalname',
  'twitter',
  'twitch',
  'colorKey',
  'colorSub',
  'colorLight',
  'colorBack',
  'activityStartDate',
  'activityEndDate',
] as const;

/** What a new member's body carries: the editable columns plus the id a PUT takes from its URL. */
const NEW_MEMBER_KEYS = ['channelId', ...EDITABLE_MEMBER_KEYS] as const;

type NewMemberKey = (typeof NEW_MEMBER_KEYS)[number];

// Same patterns scripts/channels.js's checkEntry applies to channels.yml,
// repeated rather than shared for the same reason isSchemaDate's comment in
// lib/time.ts gives: that file is plain JavaScript for bare node, this one
// is TypeScript for workerd, and neither can import the other. channel is
// what channels.yml seeds and the admin site now edits, so a value this
// rejects and one the seed would have rejected are the same rule regardless.
const CHANNEL_ID_PATTERN = /^UC[\w-]{22}$/;
const COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;
const TWITTER_PATTERN = /^\w{1,15}$/;
const TWITCH_PATTERN = /^\w{4,25}$/;

function isFilledString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

/** What is wrong with one field's value, or null when it is fine. */
function memberFieldProblem(key: NewMemberKey, value: unknown): string | null {
  switch (key) {
    case 'channelId':
      return typeof value === 'string' && CHANNEL_ID_PATTERN.test(value)
        ? null
        : 'channelId must be a YouTube channel id';
    case 'name':
    case 'fullname':
      return isFilledString(value) ? null : `${key} must be a non-empty string`;
    case 'globalname':
      return value === null || isFilledString(value) ? null : 'globalname must be a non-empty string or null';
    case 'twitter':
      return value === null || (typeof value === 'string' && TWITTER_PATTERN.test(value))
        ? null
        : 'twitter must be a handle without the @, or null';
    case 'twitch':
      return value === null || (typeof value === 'string' && TWITCH_PATTERN.test(value))
        ? null
        : 'twitch must be a Twitch login, or null';
    case 'colorKey':
    case 'colorSub':
    case 'colorLight':
    case 'colorBack':
      return typeof value === 'string' && COLOR_PATTERN.test(value) ? null : `${key} must be #RRGGBB`;
    case 'activityStartDate':
      return typeof value === 'string' && isSchemaDate(value) ? null : 'activityStartDate must be YYYY-MM-DD';
    case 'activityEndDate':
      return value === null || (typeof value === 'string' && isSchemaDate(value))
        ? null
        : 'activityEndDate must be YYYY-MM-DD or null';
  }
}

/**
 * A body checked against `keys` and against the rule that spans two fields.
 * The one place a PUT and a new member share their rules, so a value one
 * accepts and the other refuses cannot come from the two drifting apart.
 */
function readMemberBody(
  body: Record<string, unknown>,
  keys: readonly NewMemberKey[],
): { values: Record<NewMemberKey, unknown> } | { error: Response } {
  const read = readEditableBody(body, keys, memberFieldProblem);

  if ('error' in read) return read;

  const { activityStartDate, activityEndDate } = read.values;

  if (activityEndDate !== null && (activityEndDate as string) < (activityStartDate as string)) {
    return { error: errorResponse(400, 'activityEndDate is before activityStartDate') };
  }

  return read;
}

/**
 * MEMBER_COLUMNS order, minus fetched_at, custom_url and thumbnail_url.
 * fetched_at is the collector's own clock, not something a save changes, so
 * it is the "日時の列" #141's design excludes from the body of a
 * channel/video_override/channel_snapshot_exclusion revision.
 *
 * custom_url and thumbnail_url come from the YouTube API, which lets this
 * site keep what it fetched for 30 days at most (#222). `revision` is
 * append-only and is never trimmed, so a value written here would outlive
 * that limit with no way to remove it short of dropping the table's
 * triggers. No save here changes either column anyway (see
 * EDITABLE_MEMBER_KEYS), so the body would only have recorded whatever the
 * collector last wrote (#224).
 */
function revisionBodyOf(row: MemberRow) {
  return {
    channel_id: row.channel_id,
    name: row.name,
    fullname: row.fullname,
    globalname: row.globalname,
    twitter: row.twitter,
    color_key: row.color_key,
    color_sub: row.color_sub,
    color_light: row.color_light,
    color_back: row.color_back,
    activity_start_date: row.activity_start_date,
    activity_end_date: row.activity_end_date,
    display_order: row.display_order,
    twitch: row.twitch,
  };
}

/** PUT /admin/api/members/:channelId. 404 when there is no such member. */
export async function updateMember(env: Env, channelId: string, body: Record<string, unknown>): Promise<Response> {
  const existing = await env.DB.prepare(`${SELECT_MEMBERS} WHERE channel_id = ?1`).bind(channelId).first<MemberRow>();

  if (existing === null) return errorResponse(404, `no member ${channelId}`);

  const read = readMemberBody(body, EDITABLE_MEMBER_KEYS);

  if ('error' in read) return read.error;

  const { values } = read;

  const updated: MemberRow = {
    ...existing,
    name: values.name as string,
    fullname: values.fullname as string,
    globalname: values.globalname as string | null,
    twitter: values.twitter as string | null,
    twitch: values.twitch as string | null,
    color_key: values.colorKey as string,
    color_sub: values.colorSub as string,
    color_light: values.colorLight as string,
    color_back: values.colorBack as string,
    activity_start_date: values.activityStartDate as string,
    activity_end_date: values.activityEndDate as string | null,
    // custom_url, thumbnail_url, fetched_at and display_order are not
    // writable by this PUT, so the row already on hand is what the row still
    // has after it.
  };

  const results = await env.DB.batch([
    env.DB.prepare(
      `UPDATE channel
          SET name = ?1, fullname = ?2, globalname = ?3, twitter = ?4, twitch = ?5,
              color_key = ?6, color_sub = ?7, color_light = ?8, color_back = ?9,
              activity_start_date = ?10, activity_end_date = ?11
        WHERE channel_id = ?12`,
    ).bind(
      updated.name,
      updated.fullname,
      updated.globalname,
      updated.twitter,
      updated.twitch,
      updated.color_key,
      updated.color_sub,
      updated.color_light,
      updated.color_back,
      updated.activity_start_date,
      updated.activity_end_date,
      channelId,
    ),
    revisionStatement(env.DB, 'channel', channelId, 'save', revisionBodyOf(updated)),
  ]);

  return jsonResponse({ member: present(updated), revisionId: results[1].meta.last_row_id });
}

/** A new member's row: the body's fields, nothing the collector writes yet, and the place it takes in the list. */
function newMemberRow(values: Record<NewMemberKey, unknown>, displayOrder: number): MemberRow {
  return {
    channel_id: values.channelId as string,
    name: values.name as string,
    fullname: values.fullname as string,
    globalname: values.globalname as string | null,
    twitter: values.twitter as string | null,
    twitch: values.twitch as string | null,
    color_key: values.colorKey as string,
    color_sub: values.colorSub as string,
    color_light: values.colorLight as string,
    color_back: values.colorBack as string,
    activity_start_date: values.activityStartDate as string,
    activity_end_date: values.activityEndDate as string | null,
    custom_url: null,
    thumbnail_url: null,
    fetched_at: null,
    display_order: displayOrder,
  };
}

type NewMemberValues = Record<NewMemberKey, unknown>;

/**
 * The first statement of a whole-list save: fails the batch, so that D1 rolls
 * all of it back, unless `channel` holds exactly `ids` when the batch runs.
 *
 * saveMemberList reads the members before it builds the batch, and somebody
 * else may add or delete one in between. Without this a deleted member would
 * still get a `save` revision for an UPDATE that changed no row, and an added
 * one would be left out of the order it was saved with.
 *
 * It fails by inserting a NULL into a NOT NULL column - there is no way to
 * abort a batch from SQL alone - and only when the sets differ, so a matching
 * list changes nothing. The ids go in as one JSON text, not one bind or one
 * SELECT each: a compound SELECT has a term limit in D1, and the list grows
 * with the members.
 */
export function membershipGuard(db: D1Database, ids: string[]): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO channel (channel_id)
       SELECT NULL
        WHERE (SELECT count(*) FROM channel) <> json_array_length(?1)
           OR EXISTS (SELECT 1 FROM channel WHERE channel_id NOT IN (SELECT value FROM json_each(?1)))`,
    )
    .bind(JSON.stringify(ids));
}

/**
 * Adds `added` and sets the display order of the whole list, in one
 * `db.batch`: D1 runs a batch as one transaction, so what the public site
 * reads is the list before it or the list after it, never a half-moved one.
 *
 * `order` is every member's id in the order to show them, the new ones
 * included. It has to name exactly the members there are, so a list somebody
 * else changed since this one was loaded is refused (409) rather than
 * silently reordered around them. A member whose place did not change is not
 * written and logs no revision.
 */
async function saveMemberList(env: Env, added: NewMemberValues[], order: string[] | null): Promise<Response> {
  const { results: existing } = await env.DB.prepare(
    `${SELECT_MEMBERS} ORDER BY display_order, channel_id`,
  ).all<MemberRow>();
  const known = new Set(existing.map((row) => row.channel_id));
  const addedIds = added.map((values) => values.channelId as string);

  for (const id of addedIds) {
    if (known.has(id)) return errorResponse(409, `member ${id} already exists`);
  }

  if (new Set(addedIds).size !== addedIds.length) return errorResponse(400, 'add names the same member twice');

  const finalOrder = order ?? [...existing.map((row) => row.channel_id), ...addedIds];
  const expected = new Set([...known, ...addedIds]);

  if (
    finalOrder.length !== expected.size ||
    new Set(finalOrder).size !== expected.size ||
    !finalOrder.every((id) => expected.has(id))
  ) {
    return errorResponse(409, 'order does not list exactly the current members; reload and try again');
  }

  const placeOf = new Map(finalOrder.map((id, index) => [id, index]));
  const statements: D1PreparedStatement[] = [
    membershipGuard(
      env.DB,
      existing.map((row) => row.channel_id),
    ),
  ];
  const rows: MemberRow[] = [];

  for (const values of added) {
    const row = newMemberRow(values, placeOf.get(values.channelId as string)!);

    rows.push(row);
    statements.push(
      env.DB.prepare(
        `INSERT INTO channel (channel_id, name, fullname, globalname, twitter, twitch,
                              color_key, color_sub, color_light, color_back,
                              activity_start_date, activity_end_date, display_order)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)`,
      ).bind(
        row.channel_id,
        row.name,
        row.fullname,
        row.globalname,
        row.twitter,
        row.twitch,
        row.color_key,
        row.color_sub,
        row.color_light,
        row.color_back,
        row.activity_start_date,
        row.activity_end_date,
        row.display_order,
      ),
      revisionStatement(env.DB, 'channel', row.channel_id, 'save', revisionBodyOf(row)),
    );
  }

  for (const row of existing) {
    const place = placeOf.get(row.channel_id)!;

    if (place === row.display_order) continue;

    row.display_order = place;
    statements.push(
      env.DB.prepare('UPDATE channel SET display_order = ?1 WHERE channel_id = ?2').bind(place, row.channel_id),
      revisionStatement(env.DB, 'channel', row.channel_id, 'save', revisionBodyOf(row)),
    );
  }

  // Always run, even when nothing above changed: the guard is what makes a
  // save of a list somebody else changed fail rather than pass unchecked.
  try {
    await env.DB.batch(statements);
  } catch {
    // The guard, or a member added between the read above and here whose id's
    // PRIMARY KEY refuses the INSERT: both mean the list is not the one this
    // save was built from, and nothing was written.
    return errorResponse(409, 'the member list changed while saving; reload and try again');
  }

  const byId = new Map([...existing, ...rows].map((row) => [row.channel_id, row]));

  return jsonResponse({ members: finalOrder.map((id) => present(byId.get(id)!)) });
}

/**
 * POST /admin/api/members: one new member, at the end of the list. 409 when
 * the id is taken.
 */
export async function addMember(env: Env, body: Record<string, unknown>): Promise<Response> {
  const read = readMemberBody(body, NEW_MEMBER_KEYS);

  if ('error' in read) return read.error;

  const saved = await saveMemberList(env, [read.values], null);

  if (saved.status !== 200) return saved;

  const { members } = (await saved.json()) as { members: { channelId: string }[] };

  return jsonResponse(
    { member: members.find((member) => member.channelId === read.values.channelId) },
    { status: 201 },
  );
}

/**
 * PUT /admin/api/members: `{ add: [member...], order: [channelId...] }`, the
 * list as the admin site's editor left it, saved at once. `add` may be left
 * out when only the order changed.
 */
export async function saveMembers(env: Env, body: Record<string, unknown>): Promise<Response> {
  const unknownKey = Object.keys(body).find((key) => key !== 'add' && key !== 'order');

  if (unknownKey !== undefined) return errorResponse(400, `${unknownKey} cannot be saved`);

  const { add = [], order } = body;

  if (!Array.isArray(order) || !order.every((id) => typeof id === 'string')) {
    return errorResponse(400, 'order must be a list of channel ids');
  }

  if (!Array.isArray(add)) return errorResponse(400, 'add must be a list of members');

  const added: NewMemberValues[] = [];

  for (const member of add) {
    if (typeof member !== 'object' || member === null || Array.isArray(member)) {
      return errorResponse(400, 'add must be a list of members');
    }

    const read = readMemberBody(member as Record<string, unknown>, NEW_MEMBER_KEYS);

    if ('error' in read) return read.error;

    added.push(read.values);
  }

  return await saveMemberList(env, added, order as string[]);
}

/**
 * The tables whose rows hang off a member, and so keep it from being deleted.
 * subscriber_milestone_source is not named: its rows hang off a milestone, so
 * a member with one already has a subscriber_milestone row.
 */
const RECORD_TABLES = ['channel_snapshot', 'video', 'footprints_event_member', 'subscriber_milestone'] as const;

// One condition, used both to explain a refusal and to guard the DELETE
// itself, so what is refused and what would have been deleted cannot differ.
const HAS_NO_RECORDS = RECORD_TABLES.map((table) => `NOT EXISTS (SELECT 1 FROM ${table} WHERE channel_id = ?1)`).join(
  ' AND ',
);

/**
 * DELETE /admin/api/members/:channelId. 404 when there is no such member,
 * 409 - with the reason - when anything has been recorded against it: from
 * then on a member who stops gets an activity_end_date, not a delete.
 */
export async function deleteMember(env: Env, channelId: string): Promise<Response> {
  const existing = await env.DB.prepare(`${SELECT_MEMBERS} WHERE channel_id = ?1`).bind(channelId).first<MemberRow>();

  if (existing === null) return errorResponse(404, `no member ${channelId}`);

  const counts = await env.DB.prepare(
    `SELECT ${RECORD_TABLES.map((table) => `(SELECT count(*) FROM ${table} WHERE channel_id = ?1) AS ${table}`).join(', ')}`,
  )
    .bind(channelId)
    .first<Record<(typeof RECORD_TABLES)[number], number>>();

  const recorded = RECORD_TABLES.filter((table) => (counts?.[table] ?? 0) > 0).map(
    (table) => `${table}: ${counts![table]}`,
  );

  if (recorded.length > 0) {
    return errorResponse(
      409,
      `member ${channelId} has records (${recorded.join(', ')}) and cannot be deleted; set activityEndDate instead`,
    );
  }

  // The revision goes first and is gated like the DELETE, the same order
  // video-overrides.ts's deleteVideoOverride gives and for the same reason:
  // the checks above can go stale before this batch runs.
  const results = await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO revision (entity, entity_key, action, body, created_via)
       SELECT 'channel', ?1, 'delete', NULL, 'admin'
       WHERE EXISTS (SELECT 1 FROM channel WHERE channel_id = ?1) AND ${HAS_NO_RECORDS}`,
    ).bind(channelId),
    // collect_task has no foreign key to channel, so nothing would take its
    // rows along: a channel whose first fetch failed leaves a `failed` task
    // that a retry can never resolve once the channel is gone, because the
    // collector reads its targets from `channel`. Only the two kinds whose
    // target is a channel id; video_update and chat_replay name videos, and a
    // member with videos is refused above.
    env.DB.prepare(
      `DELETE FROM collect_task
        WHERE target_id = ?1 AND kind IN ('channel_stats', 'video_discover')
          AND EXISTS (SELECT 1 FROM channel WHERE channel_id = ?1) AND ${HAS_NO_RECORDS}`,
    ).bind(channelId),
    env.DB.prepare(`DELETE FROM channel WHERE channel_id = ?1 AND ${HAS_NO_RECORDS}`).bind(channelId),
  ]);

  if (results[2].meta.changes === 0) {
    return errorResponse(409, `member ${channelId} gained records and cannot be deleted; set activityEndDate instead`);
  }

  return jsonResponse({ revisionId: results[0].meta.last_row_id });
}
