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
  /** True until the first round of each rhythm is over, answered or not. */
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
  const countsAsked = ref(false);
  const archiveAsked = ref(false);

  /**
   * The first endpoint that refused, once the ones that answered are in hand.
   *
   * The two endpoints of a rhythm are asked together but kept apart: one of
   * them failing must not throw away what the other sent. The refusal is still
   * raised afterwards, so the page reports it and asks again sooner.
   */
  const refusal = (results: readonly PromiseSettledResult<unknown>[]) =>
    results.find((result): result is PromiseRejectedResult => result.status === 'rejected');

  const counts = useIntervalAction(
    COUNTS_SECONDS * 1000,
    async () => {
      const [channelList, liveList] = await Promise.allSettled([getChannels(), getLive()]);

      if (channelList.status === 'fulfilled') {
        channels.value = channelList.value.data.channels;
        countsFetchedAt.value = channelList.value.data.fetchedAt?.valueOf() ?? null;
      }

      if (liveList.status === 'fulfilled') live.value = liveList.value.data.streams;

      countsAsked.value = true;

      const failed = refusal([channelList, liveList]);

      if (failed !== undefined) throw failed.reason;

      return COUNTS_SECONDS * 1000;
    },
    async () => RETRY_SECONDS * 1000,
  );

  const archive = useIntervalAction(
    ARCHIVE_SECONDS * 1000,
    async () => {
      const [monthsSeries, streamList] = await Promise.allSettled([getMonths(), getStreams()]);

      if (monthsSeries.status === 'fulfilled') months.value = monthsSeries.value.data;
      if (streamList.status === 'fulfilled') streams.value = streamList.value.data;

      archiveAsked.value = true;

      const failed = refusal([monthsSeries, streamList]);

      if (failed !== undefined) throw failed.reason;

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
