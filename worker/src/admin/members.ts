import { readEditableBody } from '../lib/editable-body';
import type { Env } from '../lib/env';
import { errorResponse, jsonResponse } from '../lib/json';
import { revisionStatement } from '../lib/revision';
import { isSchemaDate } from '../lib/time';

/**
 * Reading and saving `channel` (#141's "member"), which #152 made D1's own:
 * this is the only place any of it is written, and unlike video_override and
 * channel_snapshot_exclusion there is no row-creating route - a new member
 * only ever arrives through the seed (see docs/reference/data.md).
 */

/**
 * `channel`'s own columns, in table order. One list rather than one per
 * concern (the SELECT, the row type, the revision body): the column order
 * the revision body's JSON keys must follow (see updateMember) is D1's own,
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

/** GET /admin/api/members */
export async function listMembers(env: Env): Promise<Response> {
  const { results } = await env.DB.prepare(
    `SELECT ${MEMBER_COLUMNS.join(', ')} FROM channel ORDER BY display_order, channel_id`,
  ).all<MemberRow>();

  return jsonResponse({ members: results.map(present) });
}

/**
 * The columns a PUT may change, in the JSON shape it sends them in.
 *
 * `channel_id` is the URL, not the body, and `custom_url`, `thumbnail_url`
 * and `fetched_at` belong to the collector - see scripts/channels.js's own
 * split between channels.yml's fields and what the collector writes. Both
 * groups are refused here rather than silently kept, same as any key this
 * object never had.
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
  'displayOrder',
] as const;

type EditableMemberKey = (typeof EDITABLE_MEMBER_KEYS)[number];

// Same patterns scripts/channels.js's checkEntry applies to channels.yml,
// repeated rather than shared for the same reason isSchemaDate's comment in
// lib/time.ts gives: that file is plain JavaScript for bare node, this one
// is TypeScript for workerd, and neither can import the other. channel is
// what channels.yml seeds and the admin site now edits, so a value this
// rejects and one the seed would have rejected are the same rule regardless.
const COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;
const TWITTER_PATTERN = /^\w{1,15}$/;
const TWITCH_PATTERN = /^\w{4,25}$/;

function isFilledString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

/** What is wrong with one field's value, or null when it is fine. */
function memberFieldProblem(key: EditableMemberKey, value: unknown): string | null {
  switch (key) {
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
    case 'displayOrder':
      return typeof value === 'number' && Number.isInteger(value) && value >= 0
        ? null
        : 'displayOrder must be a non-negative integer';
  }
}

/** PUT /admin/api/members/:channelId. 404 when there is no such member. */
export async function updateMember(env: Env, channelId: string, body: Record<string, unknown>): Promise<Response> {
  const existing = await env.DB.prepare(`SELECT ${MEMBER_COLUMNS.join(', ')} FROM channel WHERE channel_id = ?1`)
    .bind(channelId)
    .first<MemberRow>();

  if (existing === null) return errorResponse(404, `no member ${channelId}`);

  const read = readEditableBody(body, EDITABLE_MEMBER_KEYS, memberFieldProblem);

  if ('error' in read) return read.error;

  const { values } = read;

  const activityStartDate = values.activityStartDate as string;
  const activityEndDate = values.activityEndDate as string | null;

  if (activityEndDate !== null && activityEndDate < activityStartDate) {
    return errorResponse(400, 'activityEndDate is before activityStartDate');
  }

  const updated: MemberRow = {
    channel_id: channelId,
    name: values.name as string,
    fullname: values.fullname as string,
    globalname: values.globalname as string | null,
    twitter: values.twitter as string | null,
    twitch: values.twitch as string | null,
    color_key: values.colorKey as string,
    color_sub: values.colorSub as string,
    color_light: values.colorLight as string,
    color_back: values.colorBack as string,
    activity_start_date: activityStartDate,
    activity_end_date: activityEndDate,
    // Not writable by this PUT, so the row already on hand is what the row
    // still has after it.
    custom_url: existing.custom_url,
    thumbnail_url: existing.thumbnail_url,
    fetched_at: existing.fetched_at,
    display_order: values.displayOrder as number,
  };

  // MEMBER_COLUMNS order, minus fetched_at: fetched_at is the collector's own
  // clock, not something this save changed, so it is the "日時の列" #141's
  // design excludes from the body of a channel/video_override/
  // channel_snapshot_exclusion revision.
  const revisionBody = {
    channel_id: updated.channel_id,
    name: updated.name,
    fullname: updated.fullname,
    globalname: updated.globalname,
    twitter: updated.twitter,
    color_key: updated.color_key,
    color_sub: updated.color_sub,
    color_light: updated.color_light,
    color_back: updated.color_back,
    activity_start_date: updated.activity_start_date,
    activity_end_date: updated.activity_end_date,
    custom_url: updated.custom_url,
    thumbnail_url: updated.thumbnail_url,
    display_order: updated.display_order,
    twitch: updated.twitch,
  };

  const results = await env.DB.batch([
    env.DB.prepare(
      `UPDATE channel
          SET name = ?1, fullname = ?2, globalname = ?3, twitter = ?4, twitch = ?5,
              color_key = ?6, color_sub = ?7, color_light = ?8, color_back = ?9,
              activity_start_date = ?10, activity_end_date = ?11, display_order = ?12
        WHERE channel_id = ?13`,
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
      updated.display_order,
      channelId,
    ),
    revisionStatement(env.DB, 'channel', channelId, 'save', revisionBody),
  ]);

  return jsonResponse({ member: present(updated), revisionId: results[1].meta.last_row_id });
}
