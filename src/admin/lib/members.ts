/**
 * Pure logic for the メンバー screen (#144, #211) - which field a failed save
 * is about, the body a PUT or a new member needs beyond the fields this
 * screen shows, and the order the list is edited in. Kept apart from
 * MembersPage.vue so it can be tested without touching the DOM, the same
 * split lib/footprints.ts uses.
 */

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
  unsaved: '未保存',
  discard: '元に戻す',
  addHeading: 'メンバーを足す',
  addToList: '一覧に足す',
  removeAdded: '削除',
  remove: '削除',
  removeConfirm: '削除する',
  removeCancel: 'やめる',
  hasRecords: '記録があるため削除できません',
  removed: '削除しました',
  listChanged: 'メンバー情報に変更がありました。再読み込みしてください',
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
