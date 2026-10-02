/**
 * What the edit panel holds, turned into what the public pages read - for the
 * プレビュー beside it. Each goes through the public site's own reader
 * (`readFootprintEvents`, `readSubscriberMilestones`, `readGenetMusicData`),
 * so a value the page could not read is caught here and named, rather than
 * drawn as `NaN`.
 *
 * The snake_case bodies mirror what publishing writes: `publicShapeOf` in
 * `worker/src/admin/footprints.ts` and the genet files beside it, and
 * `publicEntryOf` in `worker/src/admin/subscriber-milestones-publish.ts`.
 */
import { readGenetMusicData } from '@/lib/genet/musicRead';
import type { GenetPerson, GenetStream, GenetTune } from '@/lib/genet/musicTypes';
import { ShapeError } from '@/lib/read';
import {
  readFootprintEvents,
  readSubscriberMilestones,
  type FootprintEvent,
  type SubscriberMilestone,
} from '@/type/api';

import type { EventFormFields } from './footprints';
import type { GenetPerson as AdminGenetPerson } from './genet-people';
import type { StreamFormFields } from './genet-streams';
import type { TuneFormFields } from './genet-tunes';
import type { MilestoneFormFields } from './subscriber-milestones';

/** The value, or the field (as the published JSON names it) the page could not read. */
export type PreviewReadout<T> = { ok: true; value: T } | { ok: false; field: string };

/** `read`'s value, or the last segment of the path a ShapeError names (`body.events[0].start_date` is `start_date`). */
function readOne<T>(read: () => T): PreviewReadout<T> {
  try {
    return { ok: true, value: read() };
  } catch (error) {
    if (!(error instanceof ShapeError)) throw error;

    const field = error.path.split('.').pop() ?? error.path;

    return { ok: false, field: field.replace(/\[\d+\]$/, '') };
  }
}

/** One あしあと event as the timeline would publish it. The memo is left out, as publishing leaves it out. */
export function publicEventOf(fields: EventFormFields, eventId: number): PreviewReadout<FootprintEvent> {
  const body = {
    published_at: null,
    events: [
      {
        event_id: eventId,
        date_precision: fields.datePrecision,
        start_date: fields.startDate,
        starts_at: fields.startsAt,
        end_date: fields.endDate,
        kind: fields.kind,
        emphasized: fields.emphasized,
        title: fields.title,
        place: fields.place,
        supplement: fields.supplement,
        video_id: fields.videoId,
        source_pending: fields.sourcePending,
        channel_ids: [...fields.channelIds].sort(),
        sources: fields.sources.map((source) => ({ url: source.url, title: source.title })),
      },
    ],
  };

  return readOne(() => readFootprintEvents(body).events[0]!);
}

/**
 * One milestone as the statistics and member pages would publish it.
 *
 * `event` is what the panel knows of the linked event. Publishing uses the
 * title the timeline has published at the time, so the two differ until the
 * timeline is published again.
 */
export function publicMilestoneOf(
  fields: MilestoneFormFields,
  milestoneId: number,
  event: { eventId: number; title: string; startDate: string } | null,
): PreviewReadout<SubscriberMilestone> {
  const count = fields.subscriberCount.trim().replace(/,/g, '');
  const body = {
    published_at: null,
    milestones: [
      {
        milestone_id: milestoneId,
        channel_id: fields.channelId,
        date_precision: fields.datePrecision,
        reached_date: fields.reachedDate.trim(),
        subscriber_count: /^\d+$/.test(count) ? Number(count) : fields.subscriberCount,
        announced_by: fields.announcedBy,
        event: event === null ? null : { event_id: event.eventId, title: event.title, start_date: event.startDate },
        sources:
          fields.announcedBy === 'listener'
            ? []
            : fields.sources.map((source) => ({ url: source.url.trim(), title: source.title || null })),
      },
    ],
  };

  return readOne(() => readSubscriberMilestones(body).milestones[0]!);
}

/**
 * The draft's member's published milestones with the draft in its own
 * place: in place of its published self if it has one, in date order the way
 * publishing sorts them.
 */
export function milestonesWithDraft(
  published: readonly SubscriberMilestone[],
  draft: SubscriberMilestone,
): SubscriberMilestone[] {
  return [
    ...published.filter((m) => m.channelId === draft.channelId && m.milestoneId !== draft.milestoneId),
    draft,
  ].sort((a, b) =>
    a.reachedDate === b.reachedDate ? a.milestoneId - b.milestoneId : a.reachedDate < b.reachedDate ? -1 : 1,
  );
}

/** What the 楽曲 panel draws: the tune, the stream performing it, and the people its credits name. */
export interface PublicSong {
  tune: GenetTune;
  stream: GenetStream;
  people: GenetPerson[];
}

/**
 * One tune and the stream being edited, as ジェネット楽曲一覧 would publish
 * them (`publicShapeOf` in `worker/src/admin/genet-tunes.ts`,
 * `worker/src/admin/genet-streams.ts` and `worker/src/admin/genet-people.ts`).
 * The page reads the whole body at once, so a field it could not read in the
 * stream stops the page, not just this tune.
 */
export function publicSongOf(
  tune: TuneFormFields,
  tuneId: number,
  stream: StreamFormFields,
  videoId: string,
  people: readonly AdminGenetPerson[],
): PreviewReadout<PublicSong> {
  const body = {
    published_at: '2000-01-01T00:00:00Z',
    channel_id: null,
    streams: [
      {
        video_id: videoId,
        platform: stream.platform,
        url: stream.url,
        video_type: stream.videoType,
        title: stream.title,
        short_title: stream.shortTitle,
        published_at: stream.publishedAt,
        categories: stream.categories,
        keywords: stream.keywords,
        performances: stream.performances.map((p) => ({
          tune_id: p.tuneId,
          description: p.description,
          scenes: p.scenes.map((s) => ({ style: s.style, video_id: s.videoId, start_seconds: s.startSeconds })),
        })),
      },
    ],
    tunes: [
      {
        tune_id: tuneId,
        title: tune.title,
        original_title: tune.originalTitle,
        subtunes: tune.subtunes,
        attributes: tune.attributes.map((a) => ({
          name: a.name,
          text: a.text,
          people: a.people.map((p) => ({ person_id: p.personId, credited_as: p.creditedAs, note: p.note })),
        })),
        videos: tune.videos.map((v) => ({
          video_id: v.videoId,
          title: v.title,
          start_seconds: v.startSeconds,
          description: v.description,
        })),
        scores: tune.scores.map((s) => ({ url: s.url, title: s.title })),
      },
    ],
    people: people.map((p) => ({ person_id: p.personId, name: p.name, link: p.link })),
  };

  return readOne(() => {
    const data = readGenetMusicData(body);

    return { tune: data.tunes[0]!, stream: data.streams[0]!, people: data.people };
  });
}

/**
 * The published streams with the draft in its own place: in place of its
 * published self if it has one, newest first the way publishing sorts them.
 */
export function streamsWithDraft(published: readonly GenetStream[], draft: GenetStream): GenetStream[] {
  return [...published.filter((s) => s.video_id !== draft.video_id), draft].sort((a, b) =>
    a.published_at === b.published_at ? 0 : a.published_at < b.published_at ? 1 : -1,
  );
}
