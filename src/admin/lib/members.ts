/**
 * Pure logic for the メンバー screen (#144) - which field a failed save is
 * about, and the fields a PUT body needs beyond the ones this screen shows.
 * Kept apart from MembersPage.vue so it can be tested without touching the
 * DOM, the same split lib/footprints.ts uses.
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
 * one of `EDITABLE_MEMBER_KEYS`, not only the ones this screen's panel shows
 * (name / colorKey / colorSub / activityStartDate / activityEndDate /
 * displayOrder, matching the mock). A PUT here is a full replace: a key left
 * out is treated as null, which 400s for a column that may not be null - so
 * `toFormFields` below carries `fullname`/`globalname`/`twitter`/`twitch`/
 * `colorLight`/`colorBack` through unchanged rather than dropping them.
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
  displayOrder: number;
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
    displayOrder: member.displayOrder,
  };
}

export type MemberFieldKey =
  'name' | 'colorKey' | 'colorSub' | 'activityStartDate' | 'activityEndDate' | 'displayOrder';

// activityEndDate before activityStartDate: "activityEndDate is before
// activityStartDate" names both, and activityEndDate is the one actually out
// of range - the message's own subject, the same reasoning
// lib/footprints.ts's own FIELD_MARKERS gives endDate/startDate.
const FIELD_MARKERS: readonly [RegExp, MemberFieldKey][] = [
  [/^activityEndDate\b/, 'activityEndDate'],
  [/^activityStartDate\b/, 'activityStartDate'],
  [/^colorKey\b/, 'colorKey'],
  [/^colorSub\b/, 'colorSub'],
  [/^displayOrder\b/, 'displayOrder'],
  [/^name\b/, 'name'],
];

/** Which of this screen's own fields a save's 400 message is about - null when it names none of them (a field this screen does not show, or no field at all). */
export function fieldForSaveError(message: string): MemberFieldKey | null {
  for (const [pattern, field] of FIELD_MARKERS) {
    if (pattern.test(message)) return field;
  }

  return null;
}
