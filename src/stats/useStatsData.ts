import { computed, ref, type Ref } from 'vue';

import { getChannels, getLive, getMonths, getStreams, type ApiError } from '@/lib/api';
import { useIntervalAction } from '@/lib/useIntervalAction';
import type { Channel, LiveStream, MonthsSeries, StreamList } from '@/type/api';

/**
 * The four endpoints the statistics page reads, and how often it asks again.
 *
 * They are split into two rhythms rather than one. The counts and what is on
 * air change every collection round; the month-by-month series and the stream
 * spans are the whole archive reshaped, which moves once a stream ends. Asking
 * for the archive every few minutes would be several hundred kilobytes an hour
 * to redraw the same chart.
 *
 * A failure keeps the last answer on screen. Emptying the page would be the
 * defect this site was rebuilt to remove: a blank table reads as "there is
 * nothing", not as "this could not be read".
 */

/** How often the collector writes, which is what sets the faster rhythm. */
const COUNTS_SECONDS = 300;

/** The archive-shaped answers, which only change as streams finish. */
const ARCHIVE_SECONDS = 1800;

/** How long to wait after a failure before asking again. */
const RETRY_SECONDS = 600;

export interface StatsData {
  channels: Ref<Channel[]>;
  live: Ref<LiveStream[]>;
  months: Ref<MonthsSeries | null>;
  streams: Ref<StreamList | null>;
  /** When the counts were read, as the API reports it. */
  countsFetchedAt: Ref<number | null>;
  /** True until every endpoint has answered once. */
  loading: Ref<boolean>;
  /** The last failure, or null once something arrived again. */
  failure: Ref<ApiError | null>;
  start: () => Promise<void>;
  stop: () => void;
}

export function useStatsData(): StatsData {
  const channels = ref<Channel[]>([]);
  const live = ref<LiveStream[]>([]);
  const months = ref<MonthsSeries | null>(null);
  const streams = ref<StreamList | null>(null);
  const countsFetchedAt = ref<number | null>(null);
  const countsArrived = ref(false);
  const archiveArrived = ref(false);

  const counts = useIntervalAction(
    COUNTS_SECONDS * 1000,
    async () => {
      const [channelList, liveList] = await Promise.all([getChannels(), getLive()]);

      channels.value = channelList.data.channels;
      live.value = liveList.data.streams;
      countsFetchedAt.value = channelList.data.fetchedAt?.valueOf() ?? null;
      countsArrived.value = true;

      return COUNTS_SECONDS * 1000;
    },
    async () => RETRY_SECONDS * 1000,
  );

  const archive = useIntervalAction(
    ARCHIVE_SECONDS * 1000,
    async () => {
      const [monthsSeries, streamList] = await Promise.all([getMonths(), getStreams()]);

      months.value = monthsSeries.data;
      streams.value = streamList.data;
      archiveArrived.value = true;

      return ARCHIVE_SECONDS * 1000;
    },
    async () => RETRY_SECONDS * 1000,
  );

  const failureOf = (error: unknown): ApiError | null => (error === undefined ? null : (error as ApiError));

  return {
    channels,
    live,
    months,
    streams,
    countsFetchedAt,
    loading: computed(() => !countsArrived.value || !archiveArrived.value) as Ref<boolean>,
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
