/**
 * What the 登録者数の節目 screens make of publishing (#225, #283): what
 * `GET /subscribers/pending` says, the edit panel's answers in 節目's own
 * terms, and the source check (#277's 2a・6-7). What every data shares - the
 * chip, the buttons and the words - is lib/publishing.ts.
 */

import { fieldForSaveError, type MilestoneFieldKey } from './subscriber-milestones';
import { publishAnswerFor, type AnsweredAction, type PublishAnswer } from './publishing';

export interface PendingMilestoneEntry {
  milestoneId: number;
  latestAction: string;
}

/** A published row whose working copy no longer matches the revision that made it live. */
export interface ChangedMilestoneEntry {
  milestoneId: number;
}

/** A row whose linked event is not, on the public timeline now, what the stored JSON says. */
export interface EventChangedMilestoneEntry {
  milestoneId: number;
  eventId: number;
}

/** `GET /admin/api/subscribers/pending`. */
export interface MilestonesPending {
  pending: PendingMilestoneEntry[];
  changed: ChangedMilestoneEntry[];
  eventChanged: EventChangedMilestoneEntry[];
  /** The stored JSON is in an older shape, so a run builds it again with nothing else waiting. */
  shapeOutdated: boolean;
  /** Whether the public JSON may say what no revision says: a write of it was sent that no check found up to date since. */
  behind: boolean;
}

/**
 * Whether a `published` row's public copy is older than its working row -
 * since #283, a row whose save went through while the public JSON could not
 * be written, or one changed before then.
 */
export function isChangedSincePublish(state: MilestonesPending | null, milestoneId: number): boolean {
  return state?.changed.some((entry) => entry.milestoneId === milestoneId) ?? false;
}

/**
 * Whether the public JSON names the row's linked event as it was before the
 * timeline changed it. An event's publish builds the JSON again (#277's
 * 6-6), so this is a rebuild that failed.
 */
export function isEventChanged(state: MilestonesPending | null, milestoneId: number): boolean {
  return state?.eventChanged.some((entry) => entry.milestoneId === milestoneId) ?? false;
}

/**
 * Whether 「いま公開する」 does anything - exactly when the worker builds
 * (`publishState`'s `needsBuild`), for the reason genet-publish.ts's
 * `canPublishGenet` gives. `changed` does not count: those rows have no newer
 * revision until 「保存」 is pressed again.
 */
export function canPublishMilestones(state: MilestonesPending): boolean {
  return state.pending.length > 0 || state.eventChanged.length > 0 || state.shapeOutdated || state.behind;
}

/** Whether the only reason to publish is the shape, so the screen can say so. */
export function publishesOnlyForShape(state: MilestonesPending): boolean {
  return state.pending.length === 0 && state.eventChanged.length === 0 && !state.behind && state.shapeOutdated;
}

/** The edit panel's note for a 502 that saved nothing (lib/publishing.ts's `notMendedNote`). */
export const MILESTONES_NOT_MENDED_TEXT = '本番の登録者数の節目への反映に失敗しました。';

export interface MilestonesPublishResult {
  published: boolean;
  publicationId?: number;
  milestoneCount?: number;
  byteLength?: number;
}

export type MilestonesAnswer = PublishAnswer<MilestoneFieldKey>;

/** lib/publishing.ts's `publishAnswerFor` for a milestone: the row comes back as `milestone`. */
export function milestonesAnswerFor(action: AnsweredAction, status: string | null, error: unknown): MilestonesAnswer {
  return publishAnswerFor(
    { rowKey: 'milestone', fieldForSaveError, notMendedNote: MILESTONES_NOT_MENDED_TEXT },
    action,
    status,
    error,
  );
}

/** One source as `POST /subscribers/source-check` marks it - worker/src/admin/subscriber-milestones-publish.ts's `SourceMark`. */
export type SourceMark =
  { kind: 'whitelist' } | { kind: 'own_video' } | { kind: 'host'; host: string | null; sameSite: boolean };

/** `POST /admin/api/subscribers/source-check`. */
export interface SourcesJudgement {
  marks: SourceMark[];
  enough: boolean;
}

/** The words #277's 2a and #283 give the source panel. */
export const SOURCE_TEXT = {
  whitelist: 'ホワイトリスト',
  ownVideo: '本人の動画',
  enough: '出典は足りています',
  notEnoughTitle: '出典が足りません',
  notEnoughBody: 'このままでは公開できません。ホワイトリストの出典か、別のサイトの出典を足してください。',
} as const;

/**
 * The chip beside one source, or null when there is nothing to say - a URL
 * no host can be read from yet, while it is still being typed. A source that
 * counts by itself is drawn in the 公開中 green, as the mock has it.
 */
export function sourceChipFor(mark: SourceMark): { label: string; tone: 'published' | 'kind' } | null {
  if (mark.kind === 'whitelist') return { label: SOURCE_TEXT.whitelist, tone: 'published' };
  if (mark.kind === 'own_video') return { label: SOURCE_TEXT.ownVideo, tone: 'published' };
  if (mark.host === null) return null;

  return { label: mark.sameSite ? `${mark.host}（同じサイト）` : mark.host, tone: 'kind' };
}

/**
 * The body `POST /subscribers/source-check` takes for what the panel holds.
 * The URLs are trimmed as a save trims them (`toRequestBody`), so the check
 * judges what a 「公開」 would send.
 */
export function sourceCheckBody(fields: {
  channelId: string;
  announcedBy: string;
  sources: readonly { url: string }[];
}): { channelId: string; announcedBy: string; urls: string[] } {
  return {
    channelId: fields.channelId,
    announcedBy: fields.announcedBy,
    urls: fields.sources.map((s) => s.url.trim()),
  };
}
