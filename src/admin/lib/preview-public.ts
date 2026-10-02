/**
 * What the edit panel holds, turned into what the public pages read - for the
 * プレビュー beside it. Each goes through the public site's own reader
 * (`readFootprintEvents`, `readSubscriberMilestones`), so a value the page
 * could not read is caught here and named, rather than drawn as `NaN`.
 *
 * The snake_case bodies mirror what publishing writes: `publicShapeOf` in
 * `worker/src/admin/footprints.ts` and `publicEntryOf` in
 * `worker/src/admin/subscriber-milestones-publish.ts`.
 */
import { ShapeError } from '@/lib/read';
import {
  readFootprintEvents,
  readSubscriberMilestones,
  type FootprintEvent,
  type SubscriberMilestone,
} from '@/type/api';

import type { EventFormFields } from './footprints';
import type { MilestoneFormFields } from './subscriber-milestones';

/** The value, or the field (as the published JSON names it) the page could not read. */
export type PreviewReadout<T> = { ok: true; value: T } | { ok: false; field: string };

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
