/**
 * Pure logic for the メンバー screen (#144, #211) - which field a failed save
 * is about, the body a PUT or a new member needs beyond the fields this
 * screen shows, and the order the list is edited in. Kept apart from
 * MembersPage.vue so it can be tested without touching the DOM, the same
 * split lib/footprints.ts uses.
 */

import { sameFields } from './editing';

/** `present()`'s own shape in `worker/src/admin/members.ts`. */
export interface Member {
  channelId: string;
  name: string;
  fullname: string;
  globalname: string | null;
  twitter: string | null;
  twitch: string | null;
  colorKey: string;
  colorSub: string;
  colorLight: string;
  colorBack: string;
  activityStartDate: string;
  activityEndDate: string | null;
  customUrl: string | null;
  thumbnailUrl: string | null;
  fetchedAt: string | null;
  displayOrder: number;
}

/**
 * The PUT body `updateMember` (`worker/src/admin/members.ts`) reads - every
 * one of `EDITABLE_MEMBER_KEYS`. A PUT here is a full replace: a key left out
 * is treated as null, which 400s for a column that may not be null. There is
 * no `displayOrder`: the order belongs to the list, which is saved as a whole.
 */
export interface MemberFormFields {
  name: string;
  fullname: string;
  globalname: string | null;
  twitter: string | null;
  twitch: string | null;
  colorKey: string;
  colorSub: string;
  colorLight: string;
  colorBack: string;
  activityStartDate: string;
  activityEndDate: string | null;
}

/** A member not yet saved: the fields a PUT takes, and the id a PUT takes from its URL. */
export interface NewMemberFields extends MemberFormFields {
  channelId: string;
}

export function toFormFields(member: Member): MemberFormFields {
  return {
    name: member.name,
    fullname: member.fullname,
    globalname: member.globalname,
    twitter: member.twitter,
    twitch: member.twitch,
    colorKey: member.colorKey,
    colorSub: member.colorSub,
    colorLight: member.colorLight,
    colorBack: member.colorBack,
    activityStartDate: member.activityStartDate,
    activityEndDate: member.activityEndDate,
  };
}

/** The form a new member starts from. Every field is empty but the colours, which the server refuses to leave out. */
export function blankNewMember(): NewMemberFields {
  return {
    channelId: '',
    name: '',
    fullname: '',
    globalname: null,
    twitter: null,
    twitch: null,
    colorKey: '',
    colorSub: '',
    colorLight: '',
    colorBack: '',
    activityStartDate: '',
    activityEndDate: null,
  };
}

/** The words this screen adds for adding, ordering and deleting (#211). */
export const MEMBER_TEXT = {
  moveUp: (name: string) => `${name}を上へ`,
  moveDown: (name: string) => `${name}を下へ`,
  discard: '元に戻す',
  addHeading: 'メンバーを足す',
  addToList: '一覧に足す',
  channelIdEmpty: 'channel_id を書いてください',
  channelIdTaken: 'この channel_id はすでに一覧にあります',
  removeAdded: '削除',
  remove: '削除',
  removeConfirm: '削除する',
  removeCancel: 'やめる',
  hasRecords: '記録があるため削除できません',
  removed: '削除しました',
  listChanged: 'メンバー情報に変更がありました。再読み込みしてください',
  pickColor: (label: string) => `${label} の色を選ぶ`,
  rowErrorLead: (name: string, channelId: string) =>
    `足した行「${name || '名前なし'}」（${channelId}）に誤りがあります。`,
  openErrorRow: '該当の行を表示',
} as const;

/**
 * `order` as the list should read now that `id` moved one place, or `order`
 * itself when there is nowhere to move it: a first member cannot go up, a
 * last one cannot go down.
 */
export function moveId(order: readonly string[], id: string, delta: -1 | 1): string[] {
  const from = order.indexOf(id);
  const to = from + delta;

  if (from < 0 || to < 0 || to >= order.length) return [...order];

  const next = [...order];

  [next[from], next[to]] = [next[to]!, next[from]!];

  return next;
}

/**
 * The draft order after the saved list was read again: the ids of `draft`
 * that still exist, in the order they had, then whatever is new - so a member
 * somebody else added shows up at the end rather than being dropped, and one
 * somebody else deleted does not linger.
 */
export function reconcileOrder(draft: readonly string[], existing: readonly string[]): string[] {
  const alive = new Set(existing);
  const kept = draft.filter((id) => alive.has(id));
  const seen = new Set(kept);

  return [...kept, ...existing.filter((id) => !seen.has(id))];
}

export function sameOrder(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

export type MemberFieldKey =
  | 'name'
  | 'fullname'
  | 'globalname'
  | 'twitter'
  | 'twitch'
  | 'colorKey'
  | 'colorSub'
  | 'colorLight'
  | 'colorBack'
  | 'activityStartDate'
  | 'activityEndDate';

// activityEndDate before activityStartDate: "activityEndDate is before
// activityStartDate" names both, and activityEndDate is the one actually out
// of range - the message's own subject, the same reasoning
// lib/footprints.ts's own FIELD_MARKERS gives endDate/startDate.
const FIELD_MARKERS: readonly [RegExp, MemberFieldKey][] = [
  [/^activityEndDate\b/, 'activityEndDate'],
  [/^activityStartDate\b/, 'activityStartDate'],
  [/^colorKey\b/, 'colorKey'],
  [/^colorSub\b/, 'colorSub'],
  [/^colorLight\b/, 'colorLight'],
  [/^colorBack\b/, 'colorBack'],
  [/^fullname\b/, 'fullname'],
  [/^globalname\b/, 'globalname'],
  [/^twitter\b/, 'twitter'],
  [/^twitch\b/, 'twitch'],
  [/^name\b/, 'name'],
];

/** Which field a save's 400 message is about - null when it names none of them. */
export function fieldForSaveError(message: string): MemberFieldKey | null {
  for (const [pattern, field] of FIELD_MARKERS) {
    if (pattern.test(message)) return field;
  }

  return null;
}

/**
 * Whether showing a different member in the edit panel would throw away what
 * is typed in it: a 「メンバーを足す」 form that is not blank, or a saved
 * member's fields that differ from the saved ones. The panel's 未保存 chip and
 * its confirmation before leaving ask the same thing (#286), so there is one
 * answer for all three.
 *
 * "The same" is `sameFields`' - the one every edit panel uses - so a nullable
 * box typed in and erased again, which holds '' where null was, is not a change.
 */
export function editWouldBeLost(
  newForm: NewMemberFields | null,
  fields: MemberFormFields | null,
  saved: Member | null,
): boolean {
  if (newForm !== null) return !sameFields(newForm, blankNewMember());

  return fields !== null && saved !== null && !sameFields(fields, toFormFields(saved));
}

/** A saved member's typed changes, set aside while the list is read again. */
export interface KeptEdit {
  channelId: string;
  fields: MemberFormFields;
}

/**
 * The changes typed in the edit panel for a saved member, or null when there
 * are none. Taken before the list's 保存, which reads the list again and would
 * otherwise show the saved values over what is typed (#286).
 */
export function keepEdit(fields: MemberFormFields | null, saved: Member | null): KeptEdit | null {
  if (fields === null || saved === null || sameFields(fields, toFormFields(saved))) return null;

  return { channelId: saved.channelId, fields: { ...fields } };
}

/**
 * What the edit panel shows once the list was read again: the changes set
 * aside for that member, or else the saved values. Null when no member is open.
 */
export function fieldsAfterReload(kept: KeptEdit | null, member: Member | null): MemberFormFields | null {
  if (member === null) return null;

  return kept?.channelId === member.channelId ? { ...kept.fields } : toFormFields(member);
}

/**
 * Which not-yet-saved member a list save's 400 is about: the `channelId` the
 * worker puts in the body (`namingMember` in `worker/src/admin/members.ts`),
 * when it is one of `addedIds`. Null for a 400 that is about no member in
 * particular, or about one this screen does not hold - those stay a message
 * over the list.
 */
export function memberOfListSaveError(body: unknown, addedIds: readonly string[]): string | null {
  if (typeof body !== 'object' || body === null || !('channelId' in body)) return null;

  const { channelId } = body;

  return typeof channelId === 'string' && addedIds.includes(channelId) ? channelId : null;
}

export const COLOR_KEYS = ['colorKey', 'colorSub', 'colorLight', 'colorBack'] as const;

export type ColorKey = (typeof COLOR_KEYS)[number];

const BARE_HEX = /^[0-9A-Fa-f]{6}$/;

/**
 * `value` with the `#` a colour is written with put back when it was left
 * off: "1a2b3c" is "#1a2b3c". Anything else is returned as it was - a 3-digit
 * hex or a colour name is not turned into a guess, and the server's own check
 * (`COLOR_PATTERN`) is still the one that decides what is a colour.
 */
export function normalizeColor(value: string): string {
  return BARE_HEX.test(value) ? `#${value}` : value;
}

const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;
const PICKER_DEFAULT = '#000000';

/** Whether `text` is a `#RRGGBB` colour, the one form the picker can show. */
export function isHexColor(text: string): boolean {
  return HEX_COLOR.test(text);
}

/**
 * The value an `<input type="color">` is given for a colour box's text. The
 * picker holds only a lowercase `#rrggbb` and cannot be empty, so a box that
 * is empty or not a colour yet shows the picker's default instead - the box
 * itself is not touched.
 */
export function pickerValue(text: string): string {
  return isHexColor(text) ? text.toLowerCase() : PICKER_DEFAULT;
}
