/**
 * Pure logic for the 配信・動画 screen (#144's data screens task) - the
 * labels the mock gives `type`/`availability`, which field a failed save is
 * about, and whether a set of override fields amounts to "no override at
 * all" (worker/src/admin/video-overrides.ts's own rule: an override with
 * every column null is refused with 400, so saving one this screen has
 * cleared to nothing must delete it instead of sending that PUT).
 */

/** `present()`'s own shape in `worker/src/admin/videos.ts`. */
export interface CollectedVideo {
  videoId: string;
  channelId: string;
  title: string;
  publishedAt: string;
  type: string | null;
  availability: string;
  hasOverride: boolean;
}

/** `present()`'s own shape in `worker/src/admin/video-overrides.ts`. */
export interface VideoOverride {
  videoId: string;
  title: string | null;
  type: string | null;
  availability: string | null;
  memo: string | null;
  updatedAt: string;
  videoTitle?: string;
}

export interface OverrideFormFields {
  title: string | null;
  type: string | null;
  availability: string | null;
  memo: string | null;
}

export function emptyOverrideFields(): OverrideFormFields {
  return { title: null, type: null, availability: null, memo: null };
}

export function toOverrideFormFields(override: VideoOverride): OverrideFormFields {
  return { title: override.title, type: override.type, availability: override.availability, memo: override.memo };
}

/** Whether `fields` overrides nothing - `title`/`type`/`availability` are all null, the same condition `saveVideoOverride` refuses with 400. `memo` alone does not count: the row it would leave behind has nothing left to say about the video. */
export function overridesNothing(fields: OverrideFormFields): boolean {
  return fields.title === null && fields.type === null && fields.availability === null;
}

export const TYPE_LABEL: Readonly<Record<string, string>> = { video: '動画', streaming: '配信', shorts: 'ショート' };
export const AVAILABILITY_LABEL: Readonly<Record<string, string>> = {
  public: '公開',
  membership: 'メン限',
  private: '非公開',
  unavailable: '削除・不明',
};

export const TYPES = ['video', 'streaming', 'shorts'] as const;
export const AVAILABILITIES = ['public', 'membership', 'private', 'unavailable'] as const;

export type OverrideFieldKey = 'title' | 'type' | 'availability';

const FIELD_MARKERS: readonly [RegExp, OverrideFieldKey][] = [
  [/^title\b/, 'title'],
  [/^type\b/, 'type'],
  [/^availability\b/, 'availability'],
];

export function fieldForSaveError(message: string): OverrideFieldKey | null {
  for (const [pattern, field] of FIELD_MARKERS) {
    if (pattern.test(message)) return field;
  }

  return null;
}
