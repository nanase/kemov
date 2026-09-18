import { computed, ref, type Ref } from 'vue';

import { getChannels, getFootprintEvents, getVideosTable, type ApiError } from '@/lib/api';
import { useIntervalAction } from '@/lib/useIntervalAction';
import { tableRows, type VideoTableRow } from '@/lib/ranking';
import type { Channel, FootprintEvent } from '@/type/api';

/**
 * The three things the footprints page reads.
 *
 * The events are what the admin site has published, and the streams are the
 * archive `GET /api/videos/table` already serves - the page puts them in one
 * column rather than asking for them as one thing.
 *
 * A failure keeps the last answer on screen. Emptying the page would say
 * there is nothing recorded, which is not what happened.
 */

/** How often the collector writes, which is what sets the faster rhythm. */
const COUNTS_SECONDS = 300;

/** The archive and the published events, which move when somebody publishes. */
const ARCHIVE_SECONDS = 1800;

/** How long to wait after a failure before asking again. */
const RETRY_SECONDS = 600;

export interface FootprintsData {
  channels: Ref<Channel[]>;
  events: Ref<FootprintEvent[]>;
  rows: Ref<VideoTableRow[]>;
  /** When the counts were read, as the API reports it. */
  fetchedAt: Ref<number | null>;
  /** True until the first round of each rhythm is over, answered or not. */
  loading: Ref<boolean>;
  /** The last failure, or null once something arrived again. */
  failure: Ref<ApiError | null>;
  start: () => Promise<void>;
  stop: () => void;
}

export function useFootprintsData(): FootprintsData {
  const channels = ref<Channel[]>([]);
  const events = ref<FootprintEvent[]>([]);
  const rows = ref<VideoTableRow[]>([]);
  const fetchedAt = ref<number | null>(null);
  const countsAsked = ref(false);
  const archiveAsked = ref(false);

  const refusal = (results: readonly PromiseSettledResult<unknown>[]) =>
    results.find((result): result is PromiseRejectedResult => result.status === 'rejected');

  const counts = useIntervalAction(
    COUNTS_SECONDS * 1000,
    async () => {
      const channelList = await getChannels();

      channels.value = channelList.data.channels;
      fetchedAt.value = channelList.data.fetchedAt?.valueOf() ?? null;
      countsAsked.value = true;

      return COUNTS_SECONDS * 1000;
    },
    async () => RETRY_SECONDS * 1000,
  );

  const archive = useIntervalAction(
    ARCHIVE_SECONDS * 1000,
    async () => {
      const [table, published] = await Promise.allSettled([getVideosTable(), getFootprintEvents()]);

      if (table.status === 'fulfilled') rows.value = tableRows(table.value.data);

      if (published.status === 'fulfilled') events.value = published.value.data.events;

      archiveAsked.value = true;

      // Nothing has been published yet, and until it is, the endpoint answers
      // 404. That is an answer - there is nothing recorded - and the timeline
      // is drawn from the streams alone (#140). Anything else is a failure.
      const failed = refusal([table, published]);
      const missing = published.status === 'rejected' && (published.reason as ApiError)?.status === 404;

      if (failed !== undefined && !(missing && table.status === 'fulfilled')) throw failed.reason;

      return ARCHIVE_SECONDS * 1000;
    },
    async () => RETRY_SECONDS * 1000,
  );

  const failureOf = (error: unknown): ApiError | null => (error === undefined ? null : (error as ApiError));

  return {
    channels,
    events,
    rows,
    fetchedAt,
    loading: computed(() => !countsAsked.value || !archiveAsked.value) as Ref<boolean>,
    failure: computed(() => failureOf(counts.error.value) ?? failureOf(archive.error.value)) as Ref<ApiError | null>,
    start: async () => {
      await Promise.all([counts.start(), archive.start()]);
    },
    stop: () => {
      counts.stop();
      archive.stop();
    },
  };
}
